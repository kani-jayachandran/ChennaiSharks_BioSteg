import ort from 'onnxruntime-node';
import crypto from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Biometric verification service using ONNX Runtime
 * Handles fingerprint and face recognition for document access
 */
class BiometricService {
  constructor() {
    this.modelsPath = join(process.cwd(), 'models');
    this.tempPath = join(process.cwd(), 'temp');
    this.sessions = new Map();
    this.initializeModels();
  }

  // Initialize ONNX models
  async initializeModels() {
    try {
      // Create models directory if it doesn't exist
      if (!existsSync(this.modelsPath)) {
        import('fs').then(fs => fs.mkdirSync(this.modelsPath, { recursive: true }));
      }

      // For demo purposes, we'll create a simple mock model
      // In production, you would load actual biometric models
      await this.createMockModels();
      
      console.log('✅ Biometric models initialized');
    } catch (error) {
      console.error('❌ Failed to initialize biometric models:', error);
    }
  }

  // Create mock ONNX models for demonstration
  async createMockModels() {
    // This is a simplified mock - in production you'd use real biometric models
    const mockModelData = {
      fingerprint: {
        inputShape: [1, 256, 256, 1], // Grayscale fingerprint image
        outputShape: [1, 512], // Feature vector
        threshold: 0.85
      },
      face: {
        inputShape: [1, 224, 224, 3], // RGB face image
        outputShape: [1, 512], // Feature vector
        threshold: 0.90
      }
    };

    // Save model metadata
    writeFileSync(
      join(this.modelsPath, 'models.json'),
      JSON.stringify(mockModelData, null, 2)
    );
  }

  // Load ONNX model session
  async loadModel(modelType) {
    try {
      if (this.sessions.has(modelType)) {
        return this.sessions.get(modelType);
      }

      // In a real implementation, you would load actual ONNX models
      // For demo purposes, we'll create a mock session
      const mockSession = {
        type: modelType,
        loaded: true,
        inputShape: modelType === 'fingerprint' ? [1, 256, 256, 1] : [1, 224, 224, 3],
        outputShape: [1, 512]
      };

      this.sessions.set(modelType, mockSession);
      return mockSession;
    } catch (error) {
      console.error(`Failed to load ${modelType} model:`, error);
      return null;
    }
  }

  // Extract biometric features from raw data
  async extractFeatures(biometricData, type) {
    try {
      const session = await this.loadModel(type);
      if (!session) {
        return {
          success: false,
          error: `Failed to load ${type} model`
        };
      }

      // In a real implementation, you would:
      // 1. Preprocess the biometric data (resize, normalize, etc.)
      // 2. Run inference using the ONNX model
      // 3. Extract feature vectors
      
      // For demo purposes, we'll generate a mock feature vector
      const features = this.generateMockFeatures(biometricData, type);

      return {
        success: true,
        features,
        type,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Feature extraction error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate mock biometric features for demonstration
  generateMockFeatures(data, type) {
    // Create a deterministic feature vector based on input data
    const hash = crypto.createHash('sha256').update(data).digest();
    const features = new Float32Array(512);
    
    // Fill feature vector with normalized values based on hash
    for (let i = 0; i < 512; i++) {
      const byteIndex = i % hash.length;
      features[i] = (hash[byteIndex] / 255.0) * 2.0 - 1.0; // Normalize to [-1, 1]
    }

    return Array.from(features);
  }

  // Compare two biometric feature vectors
  compareFeatures(features1, features2, type = 'fingerprint') {
    try {
      if (!features1 || !features2) {
        return {
          success: false,
          error: 'Invalid feature vectors'
        };
      }

      if (features1.length !== features2.length) {
        return {
          success: false,
          error: 'Feature vector dimension mismatch'
        };
      }

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(features1, features2);
      
      // Get threshold for the biometric type
      const threshold = type === 'fingerprint' ? 0.85 : 0.90;
      const match = similarity >= threshold;

      return {
        success: true,
        similarity,
        threshold,
        match,
        confidence: similarity
      };
    } catch (error) {
      console.error('Feature comparison error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate cosine similarity between two vectors
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  // Enroll new biometric template
  async enrollBiometric(userId, biometricData, type) {
    try {
      // Extract features from biometric data
      const featureResult = await this.extractFeatures(biometricData, type);
      if (!featureResult.success) {
        return featureResult;
      }

      // Create biometric template
      const template = {
        userId,
        type,
        features: featureResult.features,
        enrolledAt: Date.now(),
        version: '1.0',
        quality: this.assessQuality(featureResult.features, type)
      };

      // Generate template hash for integrity
      const templateHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(template.features))
        .digest('hex');

      template.hash = templateHash;

      return {
        success: true,
        template,
        quality: template.quality
      };
    } catch (error) {
      console.error('Biometric enrollment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify biometric against stored template
  async verifyBiometric(biometricData, storedTemplate, type) {
    try {
      // Extract features from current biometric data
      const featureResult = await this.extractFeatures(biometricData, type);
      if (!featureResult.success) {
        return featureResult;
      }

      // Verify template integrity
      const templateHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(storedTemplate.features))
        .digest('hex');

      if (templateHash !== storedTemplate.hash) {
        return {
          success: false,
          error: 'Template integrity check failed'
        };
      }

      // Compare features
      const comparisonResult = this.compareFeatures(
        featureResult.features,
        storedTemplate.features,
        type
      );

      if (!comparisonResult.success) {
        return comparisonResult;
      }

      // Additional security checks
      const qualityCheck = this.assessQuality(featureResult.features, type);
      if (qualityCheck < 0.5) {
        return {
          success: false,
          error: 'Biometric quality too low',
          quality: qualityCheck
        };
      }

      return {
        success: true,
        verified: comparisonResult.match,
        confidence: comparisonResult.confidence,
        similarity: comparisonResult.similarity,
        threshold: comparisonResult.threshold,
        quality: qualityCheck,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Biometric verification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Assess biometric quality
  assessQuality(features, type) {
    try {
      // Simple quality assessment based on feature variance
      const mean = features.reduce((sum, val) => sum + val, 0) / features.length;
      const variance = features.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / features.length;
      const stdDev = Math.sqrt(variance);

      // Normalize quality score (higher variance generally indicates better quality)
      const quality = Math.min(stdDev * 2, 1.0);
      
      return quality;
    } catch (error) {
      console.error('Quality assessment error:', error);
      return 0.5; // Default medium quality
    }
  }

  // Process WebAuthn biometric data
  async processWebAuthnData(webauthnData, type = 'fingerprint') {
    try {
      // In a real implementation, you would:
      // 1. Validate WebAuthn assertion
      // 2. Extract biometric data from authenticator
      // 3. Convert to format suitable for ML models

      // For demo purposes, we'll simulate processing
      const processedData = Buffer.from(JSON.stringify(webauthnData));
      
      return {
        success: true,
        processedData,
        type,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('WebAuthn processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate biometric challenge for verification
  generateChallenge() {
    return {
      challenge: crypto.randomBytes(32).toString('base64'),
      timestamp: Date.now(),
      expires: Date.now() + (5 * 60 * 1000) // 5 minutes
    };
  }

  // Validate biometric challenge
  validateChallenge(challenge, timestamp) {
    const now = Date.now();
    const challengeAge = now - timestamp;
    const maxAge = 5 * 60 * 1000; // 5 minutes

    return challengeAge <= maxAge;
  }
}

export default new BiometricService();