import crypto from 'crypto';

/**
 * Encryption service for document security
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
  }

  /**
   * Generate a cryptographically secure random key
   */
  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Generate a random initialization vector
   */
  generateIV() {
    return crypto.randomBytes(this.ivLength);
  }

  /**
   * Generate a random salt for key derivation
   */
  generateSalt() {
    return crypto.randomBytes(this.saltLength);
  }

  /**
   * Derive key from password using PBKDF2
   */
  deriveKeyFromPassword(password, salt, iterations = 100000) {
    return crypto.pbkdf2Sync(password, salt, iterations, this.keyLength, 'sha256');
  }

  /**
   * Encrypt document data
   */
  encryptDocument(documentBuffer, userPassword = null) {
    try {
      // Generate encryption components
      const key = userPassword ? 
        this.deriveKeyFromPassword(userPassword, this.generateSalt()) : 
        this.generateKey();
      const iv = this.generateIV();
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from('biosteg-locker-document', 'utf8'));

      // Encrypt the document
      let encrypted = cipher.update(documentBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Create encrypted package
      const encryptedPackage = {
        encrypted,
        iv,
        tag,
        key: userPassword ? null : key, // Only store key if not password-derived
        salt: userPassword ? this.generateSalt() : null,
        algorithm: this.algorithm,
        timestamp: Date.now()
      };

      // Serialize the package
      const serialized = this.serializeEncryptedPackage(encryptedPackage);

      return {
        success: true,
        encryptedData: serialized,
        key: key.toString('hex'),
        metadata: {
          algorithm: this.algorithm,
          timestamp: encryptedPackage.timestamp,
          size: serialized.length
        }
      };
    } catch (error) {
      console.error('Encryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Decrypt document data
   */
  decryptDocument(encryptedData, key = null, userPassword = null) {
    try {
      // Deserialize encrypted package
      const encryptedPackage = this.deserializeEncryptedPackage(encryptedData);
      
      // Determine decryption key
      let decryptionKey;
      if (userPassword && encryptedPackage.salt) {
        decryptionKey = this.deriveKeyFromPassword(userPassword, encryptedPackage.salt);
      } else if (key) {
        decryptionKey = Buffer.from(key, 'hex');
      } else if (encryptedPackage.key) {
        decryptionKey = encryptedPackage.key;
      } else {
        throw new Error('No valid decryption key provided');
      }

      // Create decipher
      const decipher = crypto.createDecipher(encryptedPackage.algorithm, decryptionKey);
      decipher.setAAD(Buffer.from('biosteg-locker-document', 'utf8'));
      decipher.setAuthTag(encryptedPackage.tag);

      // Decrypt the document
      let decrypted = decipher.update(encryptedPackage.encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return {
        success: true,
        documentBuffer: decrypted,
        metadata: {
          algorithm: encryptedPackage.algorithm,
          timestamp: encryptedPackage.timestamp,
          size: decrypted.length
        }
      };
    } catch (error) {
      console.error('Decryption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Serialize encrypted package to buffer
   */
  serializeEncryptedPackage(encryptedPackage) {
    const metadata = {
      algorithm: encryptedPackage.algorithm,
      timestamp: encryptedPackage.timestamp,
      ivLength: encryptedPackage.iv.length,
      tagLength: encryptedPackage.tag.length,
      encryptedLength: encryptedPackage.encrypted.length,
      hasKey: !!encryptedPackage.key,
      hasSalt: !!encryptedPackage.salt,
      keyLength: encryptedPackage.key ? encryptedPackage.key.length : 0,
      saltLength: encryptedPackage.salt ? encryptedPackage.salt.length : 0
    };

    const metadataJson = JSON.stringify(metadata);
    const metadataBuffer = Buffer.from(metadataJson, 'utf8');
    const metadataLengthBuffer = Buffer.alloc(4);
    metadataLengthBuffer.writeUInt32BE(metadataBuffer.length, 0);

    // Combine all components
    const components = [
      metadataLengthBuffer,
      metadataBuffer,
      encryptedPackage.iv,
      encryptedPackage.tag,
      encryptedPackage.encrypted
    ];

    if (encryptedPackage.key) {
      components.push(encryptedPackage.key);
    }

    if (encryptedPackage.salt) {
      components.push(encryptedPackage.salt);
    }

    return Buffer.concat(components);
  }

  /**
   * Deserialize encrypted package from buffer
   */
  deserializeEncryptedPackage(serializedData) {
    let offset = 0;

    // Read metadata length
    const metadataLength = serializedData.readUInt32BE(offset);
    offset += 4;

    // Read metadata
    const metadataBuffer = serializedData.slice(offset, offset + metadataLength);
    const metadata = JSON.parse(metadataBuffer.toString('utf8'));
    offset += metadataLength;

    // Read IV
    const iv = serializedData.slice(offset, offset + metadata.ivLength);
    offset += metadata.ivLength;

    // Read tag
    const tag = serializedData.slice(offset, offset + metadata.tagLength);
    offset += metadata.tagLength;

    // Read encrypted data
    const encrypted = serializedData.slice(offset, offset + metadata.encryptedLength);
    offset += metadata.encryptedLength;

    // Read key if present
    let key = null;
    if (metadata.hasKey) {
      key = serializedData.slice(offset, offset + metadata.keyLength);
      offset += metadata.keyLength;
    }

    // Read salt if present
    let salt = null;
    if (metadata.hasSalt) {
      salt = serializedData.slice(offset, offset + metadata.saltLength);
      offset += metadata.saltLength;
    }

    return {
      algorithm: metadata.algorithm,
      timestamp: metadata.timestamp,
      iv,
      tag,
      encrypted,
      key,
      salt
    };
  }

  /**
   * Generate document hash for integrity verification
   */
  generateDocumentHash(documentBuffer) {
    return crypto.createHash('sha256').update(documentBuffer).digest('hex');
  }

  /**
   * Verify document integrity
   */
  verifyDocumentIntegrity(documentBuffer, expectedHash) {
    const actualHash = this.generateDocumentHash(documentBuffer);
    return actualHash === expectedHash;
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(length = 32) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Encrypt sensitive metadata
   */
  encryptMetadata(metadata, key) {
    try {
      const iv = this.generateIV();
      const cipher = crypto.createCipher(this.algorithm, key);
      
      const metadataJson = JSON.stringify(metadata);
      let encrypted = cipher.update(metadataJson, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const tag = cipher.getAuthTag();
      
      return {
        success: true,
        encryptedMetadata: Buffer.concat([iv, tag, encrypted]).toString('base64')
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Decrypt sensitive metadata
   */
  decryptMetadata(encryptedMetadata, key) {
    try {
      const buffer = Buffer.from(encryptedMetadata, 'base64');
      
      const iv = buffer.slice(0, this.ivLength);
      const tag = buffer.slice(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = buffer.slice(this.ivLength + this.tagLength);
      
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      const metadata = JSON.parse(decrypted.toString('utf8'));
      
      return {
        success: true,
        metadata
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();