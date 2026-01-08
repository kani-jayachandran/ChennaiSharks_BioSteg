import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import sharp from 'sharp';

/**
 * Steganography service using OpenCV Python scripts
 * Embeds encrypted documents into carrier images
 */
class SteganographyService {
  constructor() {
    this.tempDir = join(process.cwd(), 'temp');
    this.pythonScriptPath = join(process.cwd(), 'src', 'python');
    this.ensureTempDir();
    this.ensurePythonScripts();
  }

  // Ensure temp directory exists
  ensureTempDir() {
    if (!existsSync(this.tempDir)) {
      import('fs').then(fs => fs.mkdirSync(this.tempDir, { recursive: true }));
    }
  }

  // Create Python scripts for steganography
  ensurePythonScripts() {
    if (!existsSync(this.pythonScriptPath)) {
      import('fs').then(fs => fs.mkdirSync(this.pythonScriptPath, { recursive: true }));
    }

    // Create embed script
    const embedScript = `
import cv2
import numpy as np
import sys
import json
import base64

def embed_data_in_image(image_path, data, output_path):
    """Embed binary data into an image using LSB steganography"""
    try:
        # Read the carrier image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image file")
        
        # Convert data to binary
        if isinstance(data, str):
            data = data.encode('utf-8')
        
        # Convert to binary string
        binary_data = ''.join(format(byte, '08b') for byte in data)
        
        # Add delimiter to mark end of data
        binary_data += '1111111111111110'  # 16-bit delimiter
        
        # Check if image can hold the data
        total_pixels = img.shape[0] * img.shape[1] * img.shape[2]
        if len(binary_data) > total_pixels:
            raise ValueError("Image too small to hold the data")
        
        # Flatten image
        flat_img = img.flatten()
        
        # Embed data using LSB
        for i, bit in enumerate(binary_data):
            flat_img[i] = (flat_img[i] & 0xFE) | int(bit)
        
        # Reshape back to original shape
        stego_img = flat_img.reshape(img.shape)
        
        # Save the steganographic image
        success = cv2.imwrite(output_path, stego_img)
        if not success:
            raise ValueError("Could not save steganographic image")
        
        return True
        
    except Exception as e:
        print(f"Error in embed_data_in_image: {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python embed.py <image_path> <data_file> <output_path>", file=sys.stderr)
        sys.exit(1)
    
    image_path = sys.argv[1]
    data_file = sys.argv[2]
    output_path = sys.argv[3]
    
    try:
        # Read data from file
        with open(data_file, 'rb') as f:
            data = f.read()
        
        # Embed data
        if embed_data_in_image(image_path, data, output_path):
            print(json.dumps({"success": True, "message": "Data embedded successfully"}))
        else:
            print(json.dumps({"success": False, "error": "Failed to embed data"}))
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
`;

    // Create extract script
    const extractScript = `
import cv2
import numpy as np
import sys
import json

def extract_data_from_image(image_path):
    """Extract binary data from steganographic image using LSB"""
    try:
        # Read the steganographic image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image file")
        
        # Flatten image
        flat_img = img.flatten()
        
        # Extract LSBs
        binary_data = ""
        delimiter = '1111111111111110'
        
        for pixel in flat_img:
            binary_data += str(pixel & 1)
            
            # Check for delimiter
            if binary_data.endswith(delimiter):
                binary_data = binary_data[:-len(delimiter)]
                break
        
        # Convert binary to bytes
        if len(binary_data) % 8 != 0:
            # Pad with zeros if necessary
            binary_data += '0' * (8 - len(binary_data) % 8)
        
        # Convert to bytes
        data = bytearray()
        for i in range(0, len(binary_data), 8):
            byte = binary_data[i:i+8]
            if len(byte) == 8:
                data.append(int(byte, 2))
        
        return bytes(data)
        
    except Exception as e:
        print(f"Error in extract_data_from_image: {str(e)}", file=sys.stderr)
        return None

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract.py <image_path> <output_file>", file=sys.stderr)
        sys.exit(1)
    
    image_path = sys.argv[1]
    output_file = sys.argv[2]
    
    try:
        # Extract data
        data = extract_data_from_image(image_path)
        
        if data is not None:
            # Save extracted data
            with open(output_file, 'wb') as f:
                f.write(data)
            
            print(json.dumps({"success": True, "message": "Data extracted successfully"}))
        else:
            print(json.dumps({"success": False, "error": "Failed to extract data"}))
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
`;

    // Write Python scripts
    writeFileSync(join(this.pythonScriptPath, 'embed.py'), embedScript);
    writeFileSync(join(this.pythonScriptPath, 'extract.py'), extractScript);
  }

  // Generate a suitable carrier image if none provided
  async generateCarrierImage(width = 1024, height = 768) {
    try {
      const filename = `carrier_${randomBytes(8).toString('hex')}.png`;
      const filepath = join(this.tempDir, filename);

      // Create a random noise image using Sharp
      const buffer = Buffer.alloc(width * height * 3);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }

      await sharp(buffer, {
        raw: {
          width: width,
          height: height,
          channels: 3
        }
      })
      .png()
      .toFile(filepath);

      return filepath;
    } catch (error) {
      console.error('Error generating carrier image:', error);
      throw new Error('Failed to generate carrier image');
    }
  }

  // Embed encrypted document into image
  async embedDocument(encryptedData, carrierImagePath = null) {
    const tempId = randomBytes(8).toString('hex');
    const dataFile = join(this.tempDir, `data_${tempId}.bin`);
    const outputFile = join(this.tempDir, `stego_${tempId}.png`);
    
    let actualCarrierPath = carrierImagePath;

    try {
      // Generate carrier image if not provided
      if (!actualCarrierPath) {
        actualCarrierPath = await this.generateCarrierImage();
      }

      // Write encrypted data to temporary file
      writeFileSync(dataFile, encryptedData);

      // Run Python embedding script
      const result = await this.runPythonScript('embed.py', [
        actualCarrierPath,
        dataFile,
        outputFile
      ]);

      if (!result.success) {
        throw new Error(result.error || 'Embedding failed');
      }

      // Read the steganographic image
      const stegoImageBuffer = readFileSync(outputFile);

      // Cleanup temporary files
      this.cleanup([dataFile, outputFile]);
      if (!carrierImagePath) {
        this.cleanup([actualCarrierPath]);
      }

      return {
        success: true,
        imageBuffer: stegoImageBuffer,
        size: stegoImageBuffer.length
      };

    } catch (error) {
      console.error('Embedding error:', error);
      
      // Cleanup on error
      this.cleanup([dataFile, outputFile]);
      if (!carrierImagePath) {
        this.cleanup([actualCarrierPath]);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Extract encrypted document from steganographic image
  async extractDocument(stegoImageBuffer) {
    const tempId = randomBytes(8).toString('hex');
    const imageFile = join(this.tempDir, `stego_${tempId}.png`);
    const outputFile = join(this.tempDir, `extracted_${tempId}.bin`);

    try {
      // Write steganographic image to temporary file
      writeFileSync(imageFile, stegoImageBuffer);

      // Run Python extraction script
      const result = await this.runPythonScript('extract.py', [
        imageFile,
        outputFile
      ]);

      if (!result.success) {
        throw new Error(result.error || 'Extraction failed');
      }

      // Read extracted data
      const extractedData = readFileSync(outputFile);

      // Cleanup temporary files
      this.cleanup([imageFile, outputFile]);

      return {
        success: true,
        data: extractedData
      };

    } catch (error) {
      console.error('Extraction error:', error);
      
      // Cleanup on error
      this.cleanup([imageFile, outputFile]);

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Run Python script with arguments
  async runPythonScript(scriptName, args = []) {
    return new Promise((resolve, reject) => {
      const scriptPath = join(this.pythonScriptPath, scriptName);
      const pythonProcess = spawn('python', [scriptPath, ...args]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (error) {
            resolve({ success: true, message: stdout.trim() });
          }
        } else {
          try {
            const error = JSON.parse(stderr.trim());
            resolve(error);
          } catch (parseError) {
            resolve({ 
              success: false, 
              error: stderr.trim() || `Process exited with code ${code}` 
            });
          }
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to start Python process: ${error.message}`
        });
      });
    });
  }

  // Cleanup temporary files
  cleanup(files) {
    files.forEach(file => {
      try {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      } catch (error) {
        console.warn(`Failed to cleanup file ${file}:`, error.message);
      }
    });
  }
}

export default new SteganographyService();