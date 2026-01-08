import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Document processing service for handling PDF and DOC files
 */
export class DocumentService {
  constructor() {
    this.supportedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
  }

  /**
   * Validate document file
   */
  validateDocument(file) {
    const errors = [];

    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check MIME type
    if (!this.supportedMimeTypes.includes(file.mimetype)) {
      errors.push(`Unsupported file type: ${file.mimetype}`);
    }

    // Check file extension
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push(`Unsupported file extension: ${fileExtension}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Process document and extract metadata
   */
  async processDocument(fileBuffer, originalName, mimeType) {
    try {
      let documentInfo = {
        originalName,
        mimeType,
        size: fileBuffer.length,
        hash: this.generateDocumentHash(fileBuffer),
        processedAt: new Date().toISOString()
      };

      // Extract text content and metadata based on file type
      if (mimeType === 'application/pdf') {
        const pdfData = await this.processPDF(fileBuffer);
        documentInfo = { ...documentInfo, ...pdfData };
      } else if (mimeType.includes('word') || mimeType.includes('document')) {
        const docData = await this.processWord(fileBuffer);
        documentInfo = { ...documentInfo, ...docData };
      } else if (mimeType === 'text/plain') {
        const textData = await this.processText(fileBuffer);
        documentInfo = { ...documentInfo, ...textData };
      }

      return {
        success: true,
        documentInfo,
        processedBuffer: fileBuffer
      };
    } catch (error) {
      console.error('Document processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process PDF document
   */
  async processPDF(buffer) {
    try {
      const pdfData = await pdfParse(buffer);
      
      return {
        type: 'pdf',
        pageCount: pdfData.numpages,
        textContent: pdfData.text,
        wordCount: this.countWords(pdfData.text),
        metadata: {
          info: pdfData.info,
          version: pdfData.version
        }
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  /**
   * Process Word document
   */
  async processWord(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const textContent = result.value;
      
      return {
        type: 'word',
        textContent,
        wordCount: this.countWords(textContent),
        warnings: result.messages,
        metadata: {
          extractedText: textContent.length > 0
        }
      };
    } catch (error) {
      throw new Error(`Word document processing failed: ${error.message}`);
    }
  }

  /**
   * Process plain text document
   */
  async processText(buffer) {
    try {
      const textContent = buffer.toString('utf8');
      
      return {
        type: 'text',
        textContent,
        wordCount: this.countWords(textContent),
        lineCount: textContent.split('\n').length,
        metadata: {
          encoding: 'utf8'
        }
      };
    } catch (error) {
      throw new Error(`Text processing failed: ${error.message}`);
    }
  }

  /**
   * Count words in text
   */
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Generate document hash for integrity verification
   */
  generateDocumentHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Verify document integrity
   */
  verifyDocumentIntegrity(buffer, expectedHash) {
    const actualHash = this.generateDocumentHash(buffer);
    return actualHash === expectedHash;
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    // Remove or replace dangerous characters
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }

  /**
   * Generate secure filename
   */
  generateSecureFilename(originalName) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    const sanitizedBaseName = this.sanitizeFilename(baseName);
    
    return `${timestamp}_${random}_${sanitizedBaseName}${extension}`;
  }

  /**
   * Create document preview
   */
  createDocumentPreview(textContent, maxLength = 500) {
    if (!textContent || textContent.length <= maxLength) {
      return textContent || '';
    }

    // Find a good breaking point near the max length
    let breakPoint = maxLength;
    const nearbySpace = textContent.lastIndexOf(' ', maxLength);
    const nearbyPeriod = textContent.lastIndexOf('.', maxLength);
    
    if (nearbyPeriod > maxLength - 100) {
      breakPoint = nearbyPeriod + 1;
    } else if (nearbySpace > maxLength - 50) {
      breakPoint = nearbySpace;
    }

    return textContent.substring(0, breakPoint).trim() + '...';
  }

  /**
   * Extract document statistics
   */
  extractDocumentStats(documentInfo) {
    const stats = {
      size: documentInfo.size,
      type: documentInfo.type,
      wordCount: documentInfo.wordCount || 0,
      hash: documentInfo.hash,
      processedAt: documentInfo.processedAt
    };

    // Add type-specific stats
    if (documentInfo.type === 'pdf') {
      stats.pageCount = documentInfo.pageCount;
    } else if (documentInfo.type === 'text') {
      stats.lineCount = documentInfo.lineCount;
    }

    return stats;
  }

  /**
   * Compress document buffer
   */
  async compressDocument(buffer) {
    try {
      const zlib = await import('zlib');
      const compressed = zlib.gzipSync(buffer);
      
      return {
        success: true,
        compressedBuffer: compressed,
        originalSize: buffer.length,
        compressedSize: compressed.length,
        compressionRatio: (1 - compressed.length / buffer.length) * 100
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Decompress document buffer
   */
  async decompressDocument(compressedBuffer) {
    try {
      const zlib = await import('zlib');
      const decompressed = zlib.gunzipSync(compressedBuffer);
      
      return {
        success: true,
        decompressedBuffer: decompressed
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get supported file types
   */
  getSupportedTypes() {
    return {
      mimeTypes: this.supportedMimeTypes,
      extensions: ['.pdf', '.doc', '.docx', '.txt'],
      maxFileSize: this.maxFileSize,
      maxFileSizeMB: this.maxFileSize / (1024 * 1024)
    };
  }
}

// Export singleton instance
export const documentService = new DocumentService();