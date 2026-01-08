import crypto from 'crypto';
import { promisify } from 'util';

/**
 * Encryption service for securing documents before steganographic embedding
 * Uses AES-256-GCM for authenticated encryption
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
  }

  // Generate a cryptographically secure random key
  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  // Generate a random initialization vector
  generateIV() {
    return crypto.randomBytes(this.ivLength);
  }

  // Generate a random salt for key derivation
  generateSalt() {
    return crypto.randomBytes(this.saltLength);
  }

  // Derive key from password using PBKDF2
  async deriveKeyFromPassword(password, salt, iterations = 100000) {
    const pbkdf2 = promisify(crypto.pbkdf2);
    return await pbkdf2(password, salt, iterations, this.keyLength, 'sha256');
  }

  // Encrypt data with a given key
  encrypt(data, key) {
    try {
      const iv = this.generateIV();
      const cipher = crypto.createCipher(this.algorithm, key, { iv });
      
      let encrypted = cipher.update(data);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const tag = cipher.getAuthTag();
      
      // Combine IV, tag, and encrypted data
      const result = Buffer.concat([iv, tag, encrypted]);
      
      return {
        success: true,
        data: result,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Decrypt data with a given key
  decrypt(encryptedData, key) {
    try {
      // Extract IV, tag, and encrypted data
      const iv = encryptedData.slice(0, this.ivLength);
      const tag = encryptedData.slice(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = encryptedData.slice(this.ivLength + this.tagLength);
      
      const decipher = crypto.createDecipher(this.algorithm, key, { iv });
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return {
        success: true,
        data: decrypted
      };
    } catch (error) {
      console.error('Decryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Encrypt data with password-based encryption
  async encryptWithPassword(data, password) {
    try {
      const salt = this.generateSalt();
      const key = await this.deriveKeyFromPassword(password, salt);
      
      const encryptionResult = this.encrypt(data, key);
      if (!encryptionResult.success) {
        return encryptionResult;
      }

      // Prepend salt to encrypted data
      const result = Buffer.concat([salt, encryptionResult.data]);
      
      return {
        success: true,
        data: result,
        salt: salt.toString('hex')
      };
    } catch (error) {
      console.error('Password encryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Decrypt data with password-based encryption
  async decryptWithPassword(encryptedData, password) {
    try {
      // Extract salt and encrypted data
      const salt = encryptedData.slice(0, this.saltLength);
      const encrypted = encryptedData.slice(this.saltLength);
      
      const key = await this.deriveKeyFromPassword(password, salt);
      
      return this.decrypt(encrypted, key);
    } catch (error) {
      console.error('Password decryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate a secure document encryption key for a user
  generateDocumentKey(userId, documentId) {
    const input = `${userId}:${documentId}:${Date.now()}`;
    const hash = crypto.createHash('sha256').update(input).digest();
    return hash;
  }

  // Create a secure hash of data
  createHash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  // Verify data integrity using hash
  verifyHash(data, expectedHash, algorithm = 'sha256') {
    const actualHash = this.createHash(data, algorithm);
    return actualHash === expectedHash;
  }

  // Generate a secure random token
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Encrypt document with metadata
  async encryptDocument(documentBuffer, userId, documentId, password = null) {
    try {
      // Create document metadata
      const metadata = {
        userId,
        documentId,
        timestamp: Date.now(),
        size: documentBuffer.length,
        checksum: this.createHash(documentBuffer)
      };

      // Combine metadata and document
      const metadataBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
      const metadataLength = Buffer.alloc(4);
      metadataLength.writeUInt32BE(metadataBuffer.length, 0);
      
      const combinedData = Buffer.concat([
        metadataLength,
        metadataBuffer,
        documentBuffer
      ]);

      // Encrypt with password or generated key
      let encryptionResult;
      if (password) {
        encryptionResult = await this.encryptWithPassword(combinedData, password);
      } else {
        const key = this.generateDocumentKey(userId, documentId);
        encryptionResult = this.encrypt(combinedData, key);
      }

      if (!encryptionResult.success) {
        return encryptionResult;
      }

      return {
        success: true,
        encryptedData: encryptionResult.data,
        metadata: {
          ...metadata,
          encrypted: true,
          encryptionMethod: password ? 'password' : 'key'
        }
      };
    } catch (error) {
      console.error('Document encryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Decrypt document and extract metadata
  async decryptDocument(encryptedData, userId, documentId, password = null) {
    try {
      // Decrypt data
      let decryptionResult;
      if (password) {
        decryptionResult = await this.decryptWithPassword(encryptedData, password);
      } else {
        const key = this.generateDocumentKey(userId, documentId);
        decryptionResult = this.decrypt(encryptedData, key);
      }

      if (!decryptionResult.success) {
        return decryptionResult;
      }

      const decryptedData = decryptionResult.data;

      // Extract metadata
      const metadataLength = decryptedData.readUInt32BE(0);
      const metadataBuffer = decryptedData.slice(4, 4 + metadataLength);
      const documentBuffer = decryptedData.slice(4 + metadataLength);

      const metadata = JSON.parse(metadataBuffer.toString('utf8'));

      // Verify integrity
      const actualChecksum = this.createHash(documentBuffer);
      if (actualChecksum !== metadata.checksum) {
        return {
          success: false,
          error: 'Document integrity check failed'
        };
      }

      // Verify ownership
      if (metadata.userId !== userId) {
        return {
          success: false,
          error: 'Document ownership verification failed'
        };
      }

      return {
        success: true,
        document: documentBuffer,
        metadata
      };
    } catch (error) {
      console.error('Document decryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new EncryptionService();