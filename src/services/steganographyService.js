import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Node.js wrapper for Python steganography service
 */
export class SteganographyService {
  constructor() {
    this.pythonScript = path.join(__dirname, 'steganography.py');
    this.tempDir = path.join(__dirname, '../../temp');
    this.ensureTempDir();
  }

  /**
   * Ensure temp directory exists
   */
  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  /**
   * Execute Python steganography script
   */
  async executePythonScript(args) {
    return new Promise((resolve, reject) => {
      const python = spawn('python', [this.pythonScript, ...args]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${stdout}`));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  /**
   * Generate unique filename
   */
  generateUniqueFilename(extension = '.png') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}_${random}${extension}`;
  }

  /**
   * Create a carrier image for steganography
   */
  async createCarrierImage(width = 1920, height = 1080) {
    try {
      const filename = this.generateUniqueFilename('.png');
      const outputPath = path.join(this.tempDir, filename);

      const result = await this.executePythonScript([
        'create_carrier',
        outputPath,
        width.toString(),
        height.toString()
      ]);

      if (!result.success) {
        throw new Error('Failed to create carrier image');
      }

      return {
        success: true,
        imagePath: outputPath,
        filename
      };
    } catch (error) {
      console.error('Error creating carrier image:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Hide encrypted document data in an image
   */
  async hideDataInImage(carrierImagePath, encryptedData) {
    try {
      const filename = this.generateUniqueFilename('.png');
      const outputPath = path.join(this.tempDir, filename);

      // Convert encrypted data to base64 for Python script
      const dataBase64 = Buffer.from(encryptedData).toString('base64');

      const result = await this.executePythonScript([
        'hide',
        carrierImagePath,
        dataBase64,
        outputPath
      ]);

      if (!result.success) {
        throw new Error('Failed to hide data in image');
      }

      return {
        success: true,
        stegoImagePath: outputPath,
        filename
      };
    } catch (error) {
      console.error('Error hiding data in image:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract hidden data from steganographic image
   */
  async extractDataFromImage(stegoImagePath) {
    try {
      const result = await this.executePythonScript([
        'extract',
        stegoImagePath
      ]);

      if (!result.success) {
        throw new Error('Failed to extract data from image');
      }

      // Convert base64 back to buffer
      const extractedData = Buffer.from(result.data, 'base64');

      return {
        success: true,
        data: extractedData
      };
    } catch (error) {
      console.error('Error extracting data from image:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error cleaning up temp file:', error);
    }
  }

  /**
   * Clean up old temporary files (older than 1 hour)
   */
  async cleanupOldTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > oneHour) {
          await this.cleanupTempFile(filePath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old temp files:', error);
    }
  }

  /**
   * Validate image file
   */
  async validateImageFile(imagePath) {
    try {
      const stats = await fs.stat(imagePath);
      
      // Check file size (max 50MB)
      if (stats.size > 50 * 1024 * 1024) {
        return { valid: false, error: 'Image file too large (max 50MB)' };
      }

      // Check if file exists and is readable
      await fs.access(imagePath, fs.constants.R_OK);

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid or inaccessible image file' };
    }
  }

  /**
   * Get image capacity for data storage
   */
  async getImageCapacity(imagePath) {
    try {
      // This is a rough estimation - actual capacity depends on image dimensions
      const stats = await fs.stat(imagePath);
      const estimatedCapacity = Math.floor(stats.size * 0.1); // Rough estimate: 10% of image size
      
      return {
        success: true,
        estimatedCapacity
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
export const steganographyService = new SteganographyService();

// Cleanup old temp files every hour
setInterval(() => {
  steganographyService.cleanupOldTempFiles();
}, 60 * 60 * 1000);