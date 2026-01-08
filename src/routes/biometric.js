import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { supabaseAdmin } from '../config/supabase.js';
import { biometricService } from '../services/biometricService.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * Register biometric template
 */
router.post('/register', authenticateToken, strictRateLimiter, asyncHandler(async (req, res) => {
  const { credentialData, biometricType = 'fingerprint' } = req.body;
  const userId = req.user.id;

  if (!credentialData) {
    throw new AppError('Biometric credential data is required', 400, 'MISSING_CREDENTIAL_DATA');
  }

  try {
    // Process WebAuthn credential to extract biometric template
    const processResult = await biometricService.processWebAuthnCredential(credentialData);
    
    if (!processResult.success) {
      throw new AppError(`Biometric processing failed: ${processResult.error}`, 500, 'BIOMETRIC_PROCESSING_FAILED');
    }

    // Encrypt biometric template for storage
    const encryptionKey = crypto.randomBytes(32);
    const encryptResult = biometricService.encryptTemplate(processResult.template, encryptionKey);
    
    if (!encryptResult.success) {
      throw new AppError(`Template encryption failed: ${encryptResult.error}`, 500, 'TEMPLATE_ENCRYPTION_FAILED');
    }

    // Check if user already has a biometric template
    const { data: existingTemplate } = await supabaseAdmin
      .from('biometric_templates')
      .select('id')
      .eq('user_id', userId)
      .eq('biometric_type', biometricType)
      .single();

    let result;
    if (existingTemplate) {
      // Update existing template
      const { data, error } = await supabaseAdmin
        .from('biometric_templates')
        .update({
          template_data: encryptResult.encryptedTemplate,
          template_id: processResult.templateId,
          encryption_key: encryptionKey.toString('hex'),
          confidence_score: processResult.confidence,
          updated_at: new Date().toISOString(),
          metadata: {
            biometricType: processResult.biometricType,
            registrationTime: new Date().toISOString(),
            deviceInfo: req.get('User-Agent')
          }
        })
        .eq('user_id', userId)
        .eq('biometric_type', biometricType)
        .select()
        .single();

      if (error) {
        console.error('Biometric template update error:', error);
        throw new AppError('Failed to update biometric template', 500, 'TEMPLATE_UPDATE_ERROR');
      }
      result = data;
    } else {
      // Create new template
      const { data, error } = await supabaseAdmin
        .from('biometric_templates')
        .insert({
          user_id: userId,
          biometric_type: biometricType,
          template_data: encryptResult.encryptedTemplate,
          template_id: processResult.templateId,
          encryption_key: encryptionKey.toString('hex'),
          confidence_score: processResult.confidence,
          is_active: true,
          created_at: new Date().toISOString(),
          metadata: {
            biometricType: processResult.biometricType,
            registrationTime: new Date().toISOString(),
            deviceInfo: req.get('User-Agent')
          }
        })
        .select()
        .single();

      if (error) {
        console.error('Biometric template creation error:', error);
        throw new AppError('Failed to create biometric template', 500, 'TEMPLATE_CREATION_ERROR');
      }
      result = data;
    }

    res.status(existingTemplate ? 200 : 201).json({
      message: existingTemplate ? 'Biometric template updated successfully' : 'Biometric template registered successfully',
      template: {
        id: result.id,
        biometricType: result.biometric_type,
        templateId: result.template_id,
        confidenceScore: result.confidence_score,
        isActive: result.is_active,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }
    });

  } catch (error) {
    console.error('Biometric registration error:', error);
    throw error;
  }
}));

/**
 * Verify biometric authentication
 */
router.post('/verify', authenticateToken, strictRateLimiter, asyncHandler(async (req, res) => {
  const { credentialData, biometricType = 'fingerprint', challengeId } = req.body;
  const userId = req.user.id;

  if (!credentialData) {
    throw new AppError('Biometric credential data is required', 400, 'MISSING_CREDENTIAL_DATA');
  }

  try {
    // Get stored biometric template
    const { data: storedTemplate, error } = await supabaseAdmin
      .from('biometric_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('biometric_type', biometricType)
      .eq('is_active', true)
      .single();

    if (error || !storedTemplate) {
      throw new AppError('No biometric template found. Please register your biometric first.', 404, 'TEMPLATE_NOT_FOUND');
    }

    // Decrypt stored template
    const decryptionKey = Buffer.from(storedTemplate.encryption_key, 'hex');
    const decryptResult = biometricService.decryptTemplate(storedTemplate.template_data, decryptionKey);
    
    if (!decryptResult.success) {
      throw new AppError(`Template decryption failed: ${decryptResult.error}`, 500, 'TEMPLATE_DECRYPTION_FAILED');
    }

    // Verify biometric
    const verifyResult = await biometricService.verifyBiometric(credentialData, decryptResult.template);
    
    if (!verifyResult.success) {
      throw new AppError(`Biometric verification failed: ${verifyResult.error}`, 500, 'BIOMETRIC_VERIFICATION_FAILED');
    }

    // Log verification attempt
    await supabaseAdmin
      .from('biometric_verification_logs')
      .insert({
        user_id: userId,
        template_id: storedTemplate.id,
        biometric_type: biometricType,
        verification_result: verifyResult.authenticated,
        confidence_score: verifyResult.confidence,
        similarity_score: verifyResult.similarity,
        challenge_id: challengeId,
        verification_time: new Date().toISOString(),
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        metadata: {
          templateId: verifyResult.templateId,
          biometricType: verifyResult.biometricType
        }
      });

    // Update template last used time if verification successful
    if (verifyResult.authenticated) {
      await supabaseAdmin
        .from('biometric_templates')
        .update({
          last_used_at: new Date().toISOString(),
          usage_count: storedTemplate.usage_count + 1
        })
        .eq('id', storedTemplate.id);
    }

    res.json({
      authenticated: verifyResult.authenticated,
      confidence: verifyResult.confidence,
      similarity: verifyResult.similarity,
      biometricType: verifyResult.biometricType,
      message: verifyResult.authenticated ? 'Biometric verification successful' : 'Biometric verification failed'
    });

  } catch (error) {
    console.error('Biometric verification error:', error);
    throw error;
  }
}));

/**
 * Generate biometric challenge
 */
router.post('/challenge', authenticateToken, asyncHandler(async (req, res) => {
  const challenge = biometricService.generateBiometricChallenge();

  // Store challenge in database for validation
  await supabaseAdmin
    .from('biometric_challenges')
    .insert({
      id: challenge.id,
      user_id: req.user.id,
      challenge: challenge.challenge,
      created_at: new Date(challenge.timestamp).toISOString(),
      expires_at: new Date(challenge.expiresAt).toISOString(),
      is_used: false
    });

  res.json({
    challengeId: challenge.id,
    challenge: challenge.challenge,
    expiresAt: challenge.expiresAt,
    expiresIn: Math.floor((challenge.expiresAt - Date.now()) / 1000) // seconds
  });
}));

/**
 * Get user's biometric templates
 */
router.get('/templates', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { data: templates, error } = await supabaseAdmin
    .from('biometric_templates')
    .select('id, biometric_type, template_id, confidence_score, is_active, created_at, updated_at, last_used_at, usage_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Templates fetch error:', error);
    throw new AppError('Failed to fetch biometric templates', 500, 'TEMPLATES_FETCH_ERROR');
  }

  res.json({
    templates: templates.map(template => ({
      id: template.id,
      biometricType: template.biometric_type,
      templateId: template.template_id,
      confidenceScore: template.confidence_score,
      isActive: template.is_active,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      lastUsedAt: template.last_used_at,
      usageCount: template.usage_count
    }))
  });
}));

/**
 * Delete biometric template
 */
router.delete('/templates/:templateId', authenticateToken, asyncHandler(async (req, res) => {
  const { templateId } = req.params;
  const userId = req.user.id;

  // Verify template belongs to user
  const { data: template, error: fetchError } = await supabaseAdmin
    .from('biometric_templates')
    .select('id')
    .eq('id', templateId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !template) {
    throw new AppError('Biometric template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  // Delete template
  const { error: deleteError } = await supabaseAdmin
    .from('biometric_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Template deletion error:', deleteError);
    throw new AppError('Failed to delete biometric template', 500, 'TEMPLATE_DELETE_ERROR');
  }

  res.json({
    message: 'Biometric template deleted successfully'
  });
}));

/**
 * Get biometric verification logs
 */
router.get('/logs', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, biometricType } = req.query;

  let query = supabaseAdmin
    .from('biometric_verification_logs')
    .select('*')
    .eq('user_id', userId)
    .order('verification_time', { ascending: false });

  if (biometricType) {
    query = query.eq('biometric_type', biometricType);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: logs, error, count } = await query;

  if (error) {
    console.error('Verification logs fetch error:', error);
    throw new AppError('Failed to fetch verification logs', 500, 'LOGS_FETCH_ERROR');
  }

  res.json({
    logs: logs.map(log => ({
      id: log.id,
      biometricType: log.biometric_type,
      verificationResult: log.verification_result,
      confidenceScore: log.confidence_score,
      similarityScore: log.similarity_score,
      verificationTime: log.verification_time,
      ipAddress: log.ip_address,
      userAgent: log.user_agent
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  });
}));

/**
 * Update biometric template status
 */
router.patch('/templates/:templateId/status', authenticateToken, asyncHandler(async (req, res) => {
  const { templateId } = req.params;
  const { isActive } = req.body;
  const userId = req.user.id;

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be a boolean value', 400, 'INVALID_STATUS');
  }

  // Verify template belongs to user
  const { data: template, error: fetchError } = await supabaseAdmin
    .from('biometric_templates')
    .select('id')
    .eq('id', templateId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !template) {
    throw new AppError('Biometric template not found', 404, 'TEMPLATE_NOT_FOUND');
  }

  // Update template status
  const { data: updatedTemplate, error: updateError } = await supabaseAdmin
    .from('biometric_templates')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq('id', templateId)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateError) {
    console.error('Template status update error:', updateError);
    throw new AppError('Failed to update template status', 500, 'TEMPLATE_UPDATE_ERROR');
  }

  res.json({
    message: `Biometric template ${isActive ? 'activated' : 'deactivated'} successfully`,
    template: {
      id: updatedTemplate.id,
      biometricType: updatedTemplate.biometric_type,
      isActive: updatedTemplate.is_active,
      updatedAt: updatedTemplate.updated_at
    }
  });
}));

/**
 * Get biometric service status
 */
router.get('/status', authenticateToken, asyncHandler(async (req, res) => {
  const status = biometricService.getStatus();
  
  res.json({
    service: 'Biometric Authentication Service',
    ...status,
    timestamp: new Date().toISOString()
  });
}));

export default router;