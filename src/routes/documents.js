import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import { uploadRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { 
  mockDocuments, 
  getUserDocuments, 
  getDocumentById, 
  getDocumentAccessLogs 
} from '../config/mockData.js';
import { validateAccessTime } from '../utils/timeValidation.js';
import crypto from 'crypto';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400, 'UNSUPPORTED_FILE_TYPE'));
    }
  }
});

/**
 * Upload and store document with steganography
 */
router.post('/upload', authenticateToken, uploadRateLimiter, upload.single('document'), asyncHandler(async (req, res) => {
  const { startTime, endTime, title, description } = req.body;
  const file = req.file;
  const userId = req.user.id;

  // Validate file
  if (!file) {
    throw new AppError('No document file provided', 400, 'MISSING_FILE');
  }

  // Validate required fields
  if (!startTime || !endTime) {
    throw new AppError('Start time and end time are required', 400, 'MISSING_TIME_WINDOW');
  }

  if (!title) {
    throw new AppError('Document title is required', 400, 'MISSING_TITLE');
  }

  // Mock upload delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create mock document
  const newDocument = {
    id: crypto.randomUUID(),
    user_id: userId,
    title,
    description,
    original_filename: file.originalname,
    file_size: file.size,
    mime_type: file.mimetype,
    document_hash: crypto.randomBytes(16).toString('hex'),
    encryption_key: crypto.randomBytes(32).toString('hex'),
    s3_image_url: `https://mock-s3-bucket.com/${crypto.randomUUID()}.png`,
    s3_key: `documents/${userId}/${crypto.randomUUID()}.png`,
    start_time: startTime,
    end_time: endTime,
    document_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      documentInfo: {
        type: file.mimetype.includes('pdf') ? 'pdf' : 'document',
        size: file.size
      }
    }
  };

  // Add to mock data (in real app, this would be saved to database)
  mockDocuments.push(newDocument);

  res.status(201).json({
    message: 'Document uploaded and secured successfully',
    document: {
      id: newDocument.id,
      title: newDocument.title,
      description: newDocument.description,
      originalFilename: newDocument.original_filename,
      fileSize: newDocument.file_size,
      mimeType: newDocument.mime_type,
      startTime: newDocument.start_time,
      endTime: newDocument.end_time,
      status: newDocument.document_status,
      createdAt: newDocument.created_at,
      timeValidation: validateAccessTime(newDocument.start_time, newDocument.end_time)
    }
  });
}));

/**
 * Get user's documents list
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10, status, search } = req.query;

  let query = supabaseAdmin
    .from('documents')
    .select('id, title, description, original_filename, file_size, mime_type, start_time, end_time, document_status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Apply filters
  if (status) {
    query = query.eq('document_status', status);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%, description.ilike.%${search}%, original_filename.ilike.%${search}%`);
  }

  // Apply pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: documents, error, count } = await query;

  if (error) {
    console.error('Documents fetch error:', error);
    throw new AppError('Failed to fetch documents', 500, 'DOCUMENTS_FETCH_ERROR');
  }

  // Add time validation for each document
  const documentsWithTimeValidation = documents.map(doc => ({
    ...doc,
    timeValidation: timeValidationService.validateAccessTime(doc.start_time, doc.end_time)
  }));

  res.json({
    documents: documentsWithTimeValidation,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  });
}));

/**
 * Get specific document details
 */
router.get('/:documentId', authenticateToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;

  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error) {
    console.error('Document fetch error:', error);
    throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
  }

  // Validate access time
  const timeValidation = timeValidationService.validateAccessTime(document.start_time, document.end_time);

  res.json({
    document: {
      id: document.id,
      title: document.title,
      description: document.description,
      originalFilename: document.original_filename,
      fileSize: document.file_size,
      mimeType: document.mime_type,
      startTime: document.start_time,
      endTime: document.end_time,
      status: document.document_status,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      metadata: document.metadata,
      timeValidation
    }
  });
}));

/**
 * Access/download document (requires biometric authentication)
 */
router.post('/:documentId/access', authenticateToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const { biometricData } = req.body;

  // Get document from database
  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error) {
    throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
  }

  // Validate time window
  const timeValidation = timeValidationService.validateAccessTime(document.start_time, document.end_time);
  if (!timeValidation.valid) {
    throw new AppError(`Document access denied: ${timeValidation.status}`, 403, 'ACCESS_TIME_INVALID');
  }

  // TODO: Implement biometric verification
  // For now, we'll skip biometric verification in development
  if (process.env.NODE_ENV === 'production' && !biometricData) {
    throw new AppError('Biometric authentication required', 401, 'BIOMETRIC_REQUIRED');
  }

  try {
    // Download steganographic image from S3
    const downloadResult = await downloadFromS3(document.s3_key);
    if (!downloadResult.success) {
      throw new AppError(`Failed to download document: ${downloadResult.error}`, 500, 'S3_DOWNLOAD_FAILED');
    }

    // Save image temporarily for processing
    const tempImagePath = `/tmp/${crypto.randomUUID()}.png`;
    await import('fs').then(fs => fs.promises.writeFile(tempImagePath, downloadResult.buffer));

    // Extract encrypted data from image
    const extractResult = await steganographyService.extractDataFromImage(tempImagePath);
    if (!extractResult.success) {
      throw new AppError(`Failed to extract document: ${extractResult.error}`, 500, 'EXTRACTION_FAILED');
    }

    // Decrypt document
    const decryptResult = encryptionService.decryptDocument(extractResult.data, document.encryption_key);
    if (!decryptResult.success) {
      throw new AppError(`Failed to decrypt document: ${decryptResult.error}`, 500, 'DECRYPTION_FAILED');
    }

    // Clean up temporary file
    await steganographyService.cleanupTempFile(tempImagePath);

    // Log access
    await supabaseAdmin
      .from('document_access_logs')
      .insert({
        document_id: documentId,
        user_id: req.user.id,
        access_time: new Date().toISOString(),
        access_method: 'download',
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

    // Return document
    res.set({
      'Content-Type': document.mime_type,
      'Content-Disposition': `attachment; filename="${document.original_filename}"`,
      'Content-Length': decryptResult.documentBuffer.length
    });

    res.send(decryptResult.documentBuffer);

  } catch (error) {
    console.error('Document access error:', error);
    throw error;
  }
}));

/**
 * Update document metadata
 */
router.put('/:documentId', authenticateToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const { title, description, startTime, endTime } = req.body;

  const updateData = {};
  
  if (title) updateData.title = title;
  if (description) updateData.description = description;
  
  // Validate new time window if provided
  if (startTime || endTime) {
    const { data: currentDoc } = await supabaseAdmin
      .from('documents')
      .select('start_time, end_time')
      .eq('id', documentId)
      .single();

    const newStartTime = startTime || currentDoc.start_time;
    const newEndTime = endTime || currentDoc.end_time;

    const timeValidation = timeValidationService.validateTimeWindow(newStartTime, newEndTime);
    if (!timeValidation.valid) {
      throw new AppError(`Time window validation failed: ${timeValidation.errors.join(', ')}`, 400, 'TIME_WINDOW_INVALID');
    }

    updateData.start_time = newStartTime;
    updateData.end_time = newEndTime;
  }

  updateData.updated_at = new Date().toISOString();

  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .update(updateData)
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    console.error('Document update error:', error);
    throw new AppError('Failed to update document', 500, 'DOCUMENT_UPDATE_ERROR');
  }

  res.json({
    message: 'Document updated successfully',
    document: {
      id: document.id,
      title: document.title,
      description: document.description,
      startTime: document.start_time,
      endTime: document.end_time,
      updatedAt: document.updated_at,
      timeValidation: timeValidationService.validateAccessTime(document.start_time, document.end_time)
    }
  });
}));

/**
 * Delete document
 */
router.delete('/:documentId', authenticateToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;

  // Get document details
  const { data: document, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('s3_key')
    .eq('id', documentId)
    .single();

  if (fetchError) {
    throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
  }

  // Delete from S3
  const deleteResult = await deleteFromS3(document.s3_key);
  if (!deleteResult.success) {
    console.error('S3 delete error:', deleteResult.error);
    // Continue with database deletion even if S3 deletion fails
  }

  // Delete from database
  const { error: dbError } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (dbError) {
    console.error('Document delete error:', dbError);
    throw new AppError('Failed to delete document', 500, 'DOCUMENT_DELETE_ERROR');
  }

  res.json({
    message: 'Document deleted successfully'
  });
}));

/**
 * Get document access logs
 */
router.get('/:documentId/logs', authenticateToken, asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const offset = (page - 1) * limit;

  const { data: logs, error, count } = await supabaseAdmin
    .from('document_access_logs')
    .select('*')
    .eq('document_id', documentId)
    .order('access_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Access logs fetch error:', error);
    throw new AppError('Failed to fetch access logs', 500, 'LOGS_FETCH_ERROR');
  }

  res.json({
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  });
}));

export default router;