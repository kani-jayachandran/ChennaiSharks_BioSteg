import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { biometricRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';
import { downloadFromS3 } from '../config/aws.js';
import biometricService from '../services/biometric.js';
import encryptionService from '../services/encryption.js';
import steganographyService from '../services/steganography.js';

const router = express.Router();

// Apply authentication and rate limiting to all routes
router.use(authenticateToken);
router.use(requireRole(['user']));
router.use(biometricRateLimiter);

// Enroll biometric template
router.post('/enroll', asyncHandler(async (req, res) => {
  const { biometricData, type = 'fingerprint' } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!biometricData) {
    throw new ValidationError('Biometric data is required');
  }

  if (!['fingerprint', 'face'].includes(type)) {
    throw new ValidationError('Biometric type must be fingerprint or face');
  }

  try {
    // Process WebAuthn biometric data
    const processResult = await biometricService.processWebAuthnData(biometricData, type);
    if (!processResult.success) {
      throw new Error('Biometric data processing failed: ' + processResult.error);
    }

    // Enroll biometric template
    const enrollResult = await biometricService.enrollBiometric(
      userId,
      processResult.processedData,
      type
    );

    if (!enrollResult.success) {
      throw new Error('Biometric enrollment failed: ' + enrollResult.error);
    }

    // Store biometric template in database
    const { data: template, error: dbError } = await supabase
      .from('biometric_templates')
      .upsert({
        user_id: userId,
        biometric_type: type,
        template_data: enrollResult.template,
        quality_score: enrollResult.quality,
        enrolled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,biometric_type'
      })
      .select()
      .single();

    if (dbError) {
      throw new Error('Database error: ' + dbError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Biometric template enrolled successfully',
      template: {
        id: template.id,
        type: template.biometric_type,
        quality: template.quality_score,
        enrolledAt: template.enrolled_at
      }
    });

  } catch (error) {
    console.error('Biometric enrollment error:', error);
    throw new Error(error.message || 'Biometric enrollment failed');
  }
}));

// Verify biometric and access document
router.post('/verify/:documentId', asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const { biometricData, type = 'fingerprint', challenge } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!biometricData) {
    throw new ValidationError('Biometric data is required');
  }

  if (!challenge) {
    throw new ValidationError('Biometric challenge is required');
  }

  try {
    // Validate challenge
    if (!biometricService.validateChallenge(challenge.challenge, challenge.timestamp)) {
      throw new AuthorizationError('Invalid or expired biometric challenge');
    }

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError || !document) {
      throw new NotFoundError('Document not found');
    }

    // Check time-based access control
    const now = Date.now();
    const startTime = new Date(document.start_time).getTime();
    const endTime = new Date(document.end_time).getTime();

    if (now < startTime) {
      throw new AuthorizationError('Document access not yet available');
    }

    if (now > endTime) {
      throw new AuthorizationError('Document access has expired');
    }

    if (document.document_status !== 'active') {
      throw new AuthorizationError('Document is not active');
    }

    // Get stored biometric template
    const { data: template, error: templateError } = await supabase
      .from('biometric_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('biometric_type', type)
      .single();

    if (templateError || !template) {
      throw new NotFoundError('Biometric template not found. Please enroll your biometric first.');
    }

    // Process current biometric data
    const processResult = await biometricService.processWebAuthnData(biometricData, type);
    if (!processResult.success) {
      throw new Error('Biometric data processing failed: ' + processResult.error);
    }

    // Verify biometric
    const verifyResult = await biometricService.verifyBiometric(
      processResult.processedData,
      template.template_data,
      type
    );

    if (!verifyResult.success) {
      throw new Error('Biometric verification failed: ' + verifyResult.error);
    }

    if (!verifyResult.verified) {
      // Log failed attempt
      await supabase
        .from('access_logs')
        .insert({
          user_id: userId,
          document_id: documentId,
          access_type: 'biometric_verification',
          success: false,
          failure_reason: 'biometric_mismatch',
          confidence_score: verifyResult.confidence,
          timestamp: new Date().toISOString()
        });

      throw new AuthorizationError('Biometric verification failed');
    }

    // Download steganographic image from S3
    const downloadResult = await downloadFromS3(document.s3_key);
    if (!downloadResult.success) {
      throw new Error('Failed to retrieve document: ' + downloadResult.error);
    }

    // Extract encrypted document from steganographic image
    const extractResult = await steganographyService.extractDocument(downloadResult.body);
    if (!extractResult.success) {
      throw new Error('Document extraction failed: ' + extractResult.error);
    }

    // Decrypt document
    const decryptResult = await encryptionService.decryptDocument(
      extractResult.data,
      userId,
      documentId
    );

    if (!decryptResult.success) {
      throw new Error('Document decryption failed: ' + decryptResult.error);
    }

    // Log successful access
    await supabase
      .from('access_logs')
      .insert({
        user_id: userId,
        document_id: documentId,
        access_type: 'biometric_verification',
        success: true,
        confidence_score: verifyResult.confidence,
        timestamp: new Date().toISOString()
      });

    // Return decrypted document
    res.json({
      success: true,
      message: 'Document accessed successfully',
      document: {
        id: document.id,
        title: document.title,
        originalFilename: document.original_filename,
        originalMimetype: document.original_mimetype,
        data: decryptResult.document.toString('base64'),
        size: decryptResult.document.length,
        accessedAt: new Date().toISOString()
      },
      verification: {
        confidence: verifyResult.confidence,
        quality: verifyResult.quality,
        type: type
      }
    });

  } catch (error) {
    console.error('Biometric verification error:', error);
    
    // Log failed attempt if we have document info
    if (documentId && userId) {
      try {
        await supabase
          .from('access_logs')
          .insert({
            user_id: userId,
            document_id: documentId,
            access_type: 'biometric_verification',
            success: false,
            failure_reason: error.message,
            timestamp: new Date().toISOString()
          });
      } catch (logError) {
        console.error('Failed to log access attempt:', logError);
      }
    }

    throw error;
  }
}));

// Generate biometric challenge
router.post('/challenge', asyncHandler(async (req, res) => {
  const challenge = biometricService.generateChallenge();

  res.json({
    success: true,
    challenge
  });
}));

// Get biometric templates for user
router.get('/templates', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const { data: templates, error } = await supabase
      .from('biometric_templates')
      .select('id, biometric_type, quality_score, enrolled_at, updated_at')
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      throw new Error('Database error: ' + error.message);
    }

    res.json({
      success: true,
      templates: templates.map(template => ({
        id: template.id,
        type: template.biometric_type,
        quality: template.quality_score,
        enrolledAt: template.enrolled_at,
        updatedAt: template.updated_at
      }))
    });

  } catch (error) {
    console.error('Templates fetch error:', error);
    throw new Error(error.message || 'Failed to fetch biometric templates');
  }
}));

// Delete biometric template
router.delete('/templates/:templateId', asyncHandler(async (req, res) => {
  const { templateId } = req.params;
  const userId = req.user.id;

  try {
    const { error } = await supabase
      .from('biometric_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', userId);

    if (error) {
      throw new Error('Database error: ' + error.message);
    }

    res.json({
      success: true,
      message: 'Biometric template deleted successfully'
    });

  } catch (error) {
    console.error('Template deletion error:', error);
    throw new Error(error.message || 'Failed to delete biometric template');
  }
}));

// Get access logs for user
router.get('/access-logs', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { documentId, limit = 50, offset = 0 } = req.query;

  try {
    let query = supabase
      .from('access_logs')
      .select(`
        id,
        document_id,
        access_type,
        success,
        failure_reason,
        confidence_score,
        timestamp,
        documents!inner(title, original_filename)
      `)
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (documentId) {
      query = query.eq('document_id', documentId);
    }

    const { data: logs, error } = await query;

    if (error) {
      throw new Error('Database error: ' + error.message);
    }

    res.json({
      success: true,
      logs: logs.map(log => ({
        id: log.id,
        documentId: log.document_id,
        documentTitle: log.documents?.title,
        documentFilename: log.documents?.original_filename,
        accessType: log.access_type,
        success: log.success,
        failureReason: log.failure_reason,
        confidence: log.confidence_score,
        timestamp: log.timestamp
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: logs.length
      }
    });

  } catch (error) {
    console.error('Access logs fetch error:', error);
    throw new Error(error.message || 'Failed to fetch access logs');
  }
}));

export default router;