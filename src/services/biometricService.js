import * as ort from 'onnxruntime-node';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Biometric authentication service using ONNX Runtime
 * Handles fingerprint and face recognition templates
 */
export class BiometricService {
  constructor() {
    this.modelPath = path.join(__dirname, '../models/biometric_model.onnx');
    this.session = null;
    this.isInitialized = false;
    this.similarityThreshold = 0.85; // Minimum similarity for authentication
  }

  /**
   * Initialize ONNX Runtime session
   */
  async initialize() {
    try {
      // Check if model file exists, if not create a mock model
      const modelExists = await this.checkModelExists();
      if (!modelExists) {
        console.warn('Biometric model not found, using mock authentication');
        this.isInitialized = true;
        return true;
      }

      // Create ONNX Runtime session
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['cpu'],
        logSeverityLevel: 3 // Only errors
      });

      this.isInitialized = true;
      console.log('✅ Biometric service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize biometric service:', error);
      // Fall back to mock mode
      this.isInitialized = true;
      return false;
    }
  }

  /**
   * Check if biometric model exists
   */
  async checkModelExists() {
    try {
      await fs.access(this.modelPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Process WebAuthn credential data to extract biometric template
   */
  async processWebAuthnCredential(credentialData) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // In a real implementation, this would process the WebAuthn credential
      // and extract biometric features using the ONNX model
      
      // For now, we'll create a mock template based on the credential data
      const template = this.createMockBiometricTemplate(credentialData);

      return {
        success: true,
        template,
        templateId: this.generateTemplateId(template),
        confidence: 0.95,
        biometricType: this.detectBiometricType(credentialData)
      };
    } catch (error) {
      console.error('Error processing WebAuthn credential:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create mock biometric template for development/testing
   */
  createMockBiometricTemplate(credentialData) {
    // Create a deterministic template based on credential data
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(credentialData))
      .digest();

    // Convert to normalized feature vector (128 dimensions)
    const template = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      template[i] = (hash[i % hash.length] / 255.0) * 2 - 1; // Normalize to [-1, 1]
    }

    return Array.from(template);
  }

  /**
   * Generate unique template ID
   */
  generateTemplateId(template) {
    const templateString = template.join(',');
    return crypto.createHash('sha256').update(templateString).digest('hex').substring(0, 16);
  }

  /**
   * Detect biometric type from WebAuthn credential
   */
  detectBiometricType(credentialData) {
    // In a real implementation, this would analyze the credential data
    // For now, return a default type
    return 'fingerprint'; // Could be 'fingerprint', 'face', 'voice', etc.
  }

  /**
   * Compare two biometric templates
   */
  async compareTemplates(template1, template2) {
    try {
      if (!template1 || !template2) {
        throw new Error('Invalid templates provided');
      }

      if (template1.length !== template2.length) {
        throw new Error('Template dimensions do not match');
      }

      // Calculate cosine similarity
      const similarity = this.calculateCosineSimilarity(template1, template2);

      const isMatch = similarity >= this.similarityThreshold;

      return {
        success: true,
        similarity,
        isMatch,
        confidence: similarity,
        threshold: this.similarityThreshold
      };
    } catch (error) {
      console.error('Error comparing templates:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  calculateCosineSimilarity(vector1, vector2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Verify biometric authentication
   */
  async verifyBiometric(credentialData, storedTemplate) {
    try {
      // Process the new credential data
      const processResult = await this.processWebAuthnCredential(credentialData);
      if (!processResult.success) {
        return processResult;
      }

      // Compare with stored template
      const compareResult = await this.compareTemplates(
        processResult.template,
        storedTemplate
      );

      if (!compareResult.success) {
        return compareResult;
      }

      return {
        success: true,
        authenticated: compareResult.isMatch,
        similarity: compareResult.similarity,
        confidence: compareResult.confidence,
        biometricType: processResult.biometricType,
        templateId: processResult.templateId
      };
    } catch (error) {
      console.error('Error verifying biometric:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Encrypt biometric template for storage
   */
  encryptTemplate(template, key) {
    try {
      const templateJson = JSON.stringify(template);
      const cipher = crypto.createCipher('aes-256-gcm', key);
      
      let encrypted = cipher.update(templateJson, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const tag = cipher.getAuthTag();
      const iv = crypto.randomBytes(16);
      
      const encryptedTemplate = Buffer.concat([iv, tag, encrypted]);
      
      return {
        success: true,
        encryptedTemplate: encryptedTemplate.toString('base64')
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Decrypt biometric template
   */
  decryptTemplate(encryptedTemplate, key) {
    try {
      const buffer = Buffer.from(encryptedTemplate, 'base64');
      
      const iv = buffer.slice(0, 16);
      const tag = buffer.slice(16, 32);
      const encrypted = buffer.slice(32);
      
      const decipher = crypto.createDecipher('aes-256-gcm', key);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      const template = JSON.parse(decrypted.toString('utf8'));
      
      return {
        success: true,
        template
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate biometric challenge for authentication
   */
  generateBiometricChallenge() {
    const challenge = crypto.randomBytes(32).toString('base64');
    const timestamp = Date.now();
    const expiresAt = timestamp + (5 * 60 * 1000); // 5 minutes

    return {
      challenge,
      timestamp,
      expiresAt,
      id: crypto.randomUUID()
    };
  }

  /**
   * Validate biometric challenge
   */
  validateBiometricChallenge(challenge, providedChallenge) {
    const now = Date.now();
    
    if (now > challenge.expiresAt) {
      return {
        valid: false,
        error: 'Challenge expired'
      };
    }

    if (challenge.challenge !== providedChallenge) {
      return {
        valid: false,
        error: 'Invalid challenge'
      };
    }

    return {
      valid: true
    };
  }

  /**
   * Get biometric service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      modelLoaded: !!this.session,
      similarityThreshold: this.similarityThreshold,
      supportedTypes: ['fingerprint', 'face'],
      version: '1.0.0'
    };
  }

  /**
   * Update similarity threshold
   */
  updateSimilarityThreshold(threshold) {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    
    this.similarityThreshold = threshold;
    console.log(`Biometric similarity threshold updated to ${threshold}`);
  }
}

// Export singleton instance
export const biometricService = new BiometricService();

// Initialize on module load
biometricService.initialize().catch(console.error);