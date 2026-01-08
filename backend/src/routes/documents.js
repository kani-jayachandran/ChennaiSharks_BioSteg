import express from 'express';
import multer from 'multer';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { uploadRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';
import { uploadToS3, downloadFromS3, deleteFromS3 } from '../config/aws.js';
import encryptionService from '../services/encryption.js';
import steganographyService from '../services/steganography.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { randomBytes } from 'crypto';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF and DOC files
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Only PDF and DOC files are allowed'), false);
    }
  }
});

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireRole(['user']));

// Validate time window
const validateTimeWindow = (startTime, endTime) => {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (isNaN(start) || isNaN(end)) {
    throw new ValidationError('Invalid date format for time window');
  }

  if (start >= end) {
    throw new ValidationError('Start time must be before end time');
  }

  if (start < now - (5 * 60 * 1000)) { // Allow 5 minutes in the past
    throw new ValidationError('Start time cannot be in the past');
  }

  if (end - start < (60 * 1000)) { // Minimum 1 minute window
    throw new ValidationError('Time window must be at least 1 minute');
  }

  if (end - start > (30 * 24 * 60 * 60 * 1000)) { // Maximum 30 days
    throw new ValidationError('Time window cannot exceed 30 days');
  }

  return { start, end };
};

// Extract text from document
const extractDocumentText = async (buffer, mimetype) => {
  try {
    switch (mimetype) {
      case 'application/pdf':
        const pdfData = await pdfParse(buffer);
        return pdfData.text;
      
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docData = await mammoth.extractRawText({ buffer });
        return docData.value;
      
      default:
        throw new Error('Unsupported document type');
    }
  } catch (error) {
    console.error('Document text extraction error:', error);
    return null;
  }
};

// Upload and store document
router.post('/upload', uploadRateLimiter, upload.single('document'), asyncHandler(async (req, res) => {
  const { startTime, endTime, title, description } = req.body;
  const file = req.file;

  // Validate input
  if (!file) {
    throw new ValidationError('Document file is required');
  }

  if (!title || title.trim().length < 3) {
    throw new ValidationError('Title must be at least 3 characters long');
  }

  if (!startTime || !endTime) {
    throw new ValidationError('Start time and end time are required');
  }

  // Validate time window
  const timeWindow = validateTimeWindow(startTime, endTime);

  try {
    const documentId = randomBytes(16).toString('hex');
    const userId = req.user.id;

    // Extract document text for metadata
    const documentText = await extractDocumentText(file.buffer, file.mimetype);

    // Encrypt the document
    const encryptionResult = await encryptionService.encryptDocument(
      file.buffer,
      userId,
      documentId
    );

    if (!encryptionResult.success) {
      throw new Error('Document encryption failed: ' + encryptionResult.error);
    }

    // Embed encrypted document in steganographic image
    const stegoResult = await steganographyService.embedDocument(encryptionResult.encryptedData);

    if (!stegoResult.success) {
      throw new Error('Steganographic embedding failed: ' + stegoResult.error);
    }

    // Upload steganographic image to S3
    const s3Key = `documents/${userId}/${documentId}.png`;
    const uploadResult = await uploadToS3(
      s3Key,
      stegoResult.imageBuffer,
      'image/png'
    );

    if (!uploadResult.success) {
      throw new Error('S3 upload failed: ' + uploadResult.error);
    }

    // Store document metadata in database
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        user_id: userId,
        title: title.trim(),
        description: description?.trim() || null,
        original_filename: file.originalname,
        original_mimetype: file.mimetype,
        original_size: file.size,
        s3_image_url: uploadResult.location,
        s3_key: s3Key,
        start_time: new Date(timeWindow.start).toISOString(),
        end_time: new Date(timeWindow.end).toISOString(),
        document_status: 'active',
        encryption_metadata: encryptionResult.metadata,
        document_text_preview: documentText ? documentText.substring(0, 500) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      // Cleanup S3 upload on database error
      await deleteFromS3(s3Key);
      throw new Error('Database error: ' + dbError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Document uploaded and secured successfully',
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        originalFilename: document.original_filename,
        size: document.original_size,
        startTime: document.start_time,
        endTime: document.end_time,
        status: document.document_status,
        createdAt: document.created_at
      }
    });

  } catch (error) {
    console.error('Document upload error:', error);
    throw new Error(error.message || 'Document upload failed');
  }
}));

// Get user's documents
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { status, limit = 20, offset = 0 } = req.query;

  try {
    let query = supabase
      .from('documents')
      .select(`
        id,
        title,
        description,
        original_filename,
        original_size,
        start_time,
        end_time,
        document_status,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('document_status', status);
    }

    const { data: documents, error } = await query;

    if (error) {
      throw new Error('Database error: ' + error.message);
    }

    // Add time-based status information
    const now = Date.now();
    const documentsWithStatus = documents.map(doc => ({
      ...doc,
      isAccessible: now >= new Date(doc.start_time).getTime() && now <= new Date(doc.end_time).getTime(),
      timeRemaining: Math.max(0, new Date(doc.end_time).getTime() - now)
    }));

    res.json({
      success: true,
      documents: documentsWithStatus,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: documents.length
      }
    });

  } catch (error) {
    console.error('Documents fetch error:', error);
    throw new Error(error.message || 'Failed to fetch documents');
  }
}));

// Get document details
router.get('/:documentId', asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const userId = req.user.id;

  try {
    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (error || !document) {
      throw new NotFoundError('Document not found');
    }

    // Check time-based access
    const now = Date.now();
    const startTime = new Date(document.start_time).getTime();
    const endTime = new Date(document.end_time).getTime();
    const isAccessible = now >= startTime && now <= endTime;

    res.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        originalFilename: document.original_filename,
        originalMimetype: document.original_mimetype,
        size: document.original_size,
        startTime: document.start_time,
        endTime: document.end_time,
        status: document.document_status,
        isAccessible,
        timeRemaining: Math.max(0, endTime - now),
        documentTextPreview: document.document_text_preview,
        createdAt: document.created_at,
        updatedAt: document.updated_at
      }
    });

  } catch (error) {
    console.error('Document fetch error:', error);
    throw error;
  }
}));

// Check document access status
router.get('/:documentId/access-status', asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const userId = req.user.id;

  try {
    const { data: document, error } = await supabase
      .from('documents')
      .select('start_time, end_time, document_status')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (error || !document) {
      throw new NotFoundError('Document not found');
    }

    const now = Date.now();
    const startTime = new Date(document.start_time).getTime();
    const endTime = new Date(document.end_time).getTime();

    let status = 'pending';
    let message = 'Document access is pending';

    if (now < startTime) {
      status = 'pending';
      message = 'Document access will be available at the scheduled start time';
    } else if (now > endTime) {
      status = 'expired';
      message = 'Document access has expired';
    } else if (document.document_status !== 'active') {
      status = 'inactive';
      message = 'Document is not active';
    } else {
      status = 'accessible';
      message = 'Document is accessible for biometric verification';
    }

    res.json({
      success: true,
      status,
      message,
      isAccessible: status === 'accessible',
      timeRemaining: Math.max(0, endTime - now),
      startTime: document.start_time,
      endTime: document.end_time
    });

  } catch (error) {
    console.error('Access status check error:', error);
    throw error;
  }
}));

// Delete document
router.delete('/:documentId', asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const userId = req.user.id;

  try {
    // Get document details
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('s3_key')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !document) {
      throw new NotFoundError('Document not found');
    }

    // Delete from S3
    const deleteResult = await deleteFromS3(document.s3_key);
    if (!deleteResult.success) {
      console.warn('S3 deletion failed:', deleteResult.error);
      // Continue with database deletion anyway
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', userId);

    if (dbError) {
      throw new Error('Database error: ' + dbError.message);
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Document deletion error:', error);
    throw error;
  }
}));

// Update document metadata
router.put('/:documentId', asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const userId = req.user.id;
  const { title, description, startTime, endTime } = req.body;

  try {
    // Get current document
    const { data: currentDoc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !currentDoc) {
      throw new NotFoundError('Document not found');
    }

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (title && title.trim().length >= 3) {
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    // Validate and update time window if provided
    if (startTime && endTime) {
      const timeWindow = validateTimeWindow(startTime, endTime);
      updateData.start_time = new Date(timeWindow.start).toISOString();
      updateData.end_time = new Date(timeWindow.end).toISOString();
    }

    // Update document
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      throw new Error('Database error: ' + updateError.message);
    }

    res.json({
      success: true,
      message: 'Document updated successfully',
      document: {
        id: updatedDoc.id,
        title: updatedDoc.title,
        description: updatedDoc.description,
        startTime: updatedDoc.start_time,
        endTime: updatedDoc.end_time,
        updatedAt: updatedDoc.updated_at
      }
    });

  } catch (error) {
    console.error('Document update error:', error);
    throw error;
  }
}));

export default router;