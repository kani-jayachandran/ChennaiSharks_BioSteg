#!/usr/bin/env python3
"""
Steganography service for hiding and extracting documents in images
Uses LSB (Least Significant Bit) technique with OpenCV
"""

import cv2
import numpy as np
import sys
import json
import base64
import os
from typing import Tuple, Optional

class SteganographyService:
    def __init__(self):
        self.delimiter = "###END_OF_DATA###"
        self.header_size = 32  # Size for storing data length
    
    def hide_data_in_image(self, image_path: str, data: bytes, output_path: str) -> bool:
        """
        Hide binary data in an image using LSB steganography
        
        Args:
            image_path: Path to carrier image
            data: Binary data to hide
            output_path: Path for output steganographic image
            
        Returns:
            bool: Success status
        """
        try:
            # Read the carrier image
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not read image: {image_path}")
            
            # Convert data to binary string
            data_with_delimiter = data + self.delimiter.encode()
            binary_data = ''.join(format(byte, '08b') for byte in data_with_delimiter)
            data_length = len(binary_data)
            
            # Check if image can hold the data
            max_capacity = image.shape[0] * image.shape[1] * image.shape[2]
            if data_length > max_capacity:
                raise ValueError(f"Image too small to hold data. Need {data_length} bits, have {max_capacity}")
            
            # Flatten image for easier processing
            flat_image = image.flatten()
            
            # Hide data length in first 32 bits
            length_binary = format(data_length, '032b')
            for i in range(32):
                flat_image[i] = (flat_image[i] & 0xFE) | int(length_binary[i])
            
            # Hide actual data
            for i, bit in enumerate(binary_data):
                pixel_index = i + 32
                flat_image[pixel_index] = (flat_image[pixel_index] & 0xFE) | int(bit)
            
            # Reshape back to original image shape
            stego_image = flat_image.reshape(image.shape)
            
            # Save steganographic image
            success = cv2.imwrite(output_path, stego_image)
            if not success:
                raise ValueError(f"Could not save image: {output_path}")
            
            return True
            
        except Exception as e:
            print(f"Error hiding data: {str(e)}", file=sys.stderr)
            return False
    
    def extract_data_from_image(self, image_path: str) -> Optional[bytes]:
        """
        Extract hidden data from steganographic image
        
        Args:
            image_path: Path to steganographic image
            
        Returns:
            bytes: Extracted data or None if failed
        """
        try:
            # Read the steganographic image
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not read image: {image_path}")
            
            # Flatten image
            flat_image = image.flatten()
            
            # Extract data length from first 32 bits
            length_binary = ''
            for i in range(32):
                length_binary += str(flat_image[i] & 1)
            
            data_length = int(length_binary, 2)
            
            # Validate data length
            if data_length <= 0 or data_length > len(flat_image) - 32:
                raise ValueError("Invalid data length extracted")
            
            # Extract binary data
            binary_data = ''
            for i in range(data_length):
                pixel_index = i + 32
                binary_data += str(flat_image[pixel_index] & 1)
            
            # Convert binary to bytes
            extracted_bytes = bytearray()
            for i in range(0, len(binary_data), 8):
                byte_chunk = binary_data[i:i+8]
                if len(byte_chunk) == 8:
                    extracted_bytes.append(int(byte_chunk, 2))
            
            # Find delimiter and extract actual data
            extracted_data = bytes(extracted_bytes)
            delimiter_bytes = self.delimiter.encode()
            
            if delimiter_bytes in extracted_data:
                actual_data = extracted_data.split(delimiter_bytes)[0]
                return actual_data
            else:
                raise ValueError("Delimiter not found in extracted data")
                
        except Exception as e:
            print(f"Error extracting data: {str(e)}", file=sys.stderr)
            return None
    
    def create_carrier_image(self, width: int = 1920, height: int = 1080) -> np.ndarray:
        """
        Create a random carrier image for steganography
        
        Args:
            width: Image width
            height: Image height
            
        Returns:
            numpy.ndarray: Generated carrier image
        """
        # Create random noise image
        image = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
        
        # Add some structure to make it look more natural
        # Add gradient
        for i in range(height):
            for j in range(width):
                image[i, j] = image[i, j] * (0.7 + 0.3 * (i + j) / (height + width))
        
        # Apply Gaussian blur for smoother appearance
        image = cv2.GaussianBlur(image, (5, 5), 0)
        
        return image.astype(np.uint8)

def main():
    """
    Command line interface for steganography operations
    """
    if len(sys.argv) < 2:
        print("Usage: python steganography.py <command> [args...]")
        print("Commands:")
        print("  hide <image_path> <data_base64> <output_path>")
        print("  extract <image_path>")
        print("  create_carrier <output_path> [width] [height]")
        sys.exit(1)
    
    stego = SteganographyService()
    command = sys.argv[1]
    
    try:
        if command == "hide":
            if len(sys.argv) != 5:
                raise ValueError("hide command requires: image_path data_base64 output_path")
            
            image_path = sys.argv[2]
            data_base64 = sys.argv[3]
            output_path = sys.argv[4]
            
            # Decode base64 data
            data = base64.b64decode(data_base64)
            
            success = stego.hide_data_in_image(image_path, data, output_path)
            result = {"success": success, "output_path": output_path if success else None}
            print(json.dumps(result))
            
        elif command == "extract":
            if len(sys.argv) != 3:
                raise ValueError("extract command requires: image_path")
            
            image_path = sys.argv[2]
            extracted_data = stego.extract_data_from_image(image_path)
            
            if extracted_data:
                # Encode to base64 for safe transport
                data_base64 = base64.b64encode(extracted_data).decode('utf-8')
                result = {"success": True, "data": data_base64}
            else:
                result = {"success": False, "data": None}
            
            print(json.dumps(result))
            
        elif command == "create_carrier":
            if len(sys.argv) < 3:
                raise ValueError("create_carrier command requires: output_path [width] [height]")
            
            output_path = sys.argv[2]
            width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
            height = int(sys.argv[4]) if len(sys.argv) > 4 else 1080
            
            carrier_image = stego.create_carrier_image(width, height)
            success = cv2.imwrite(output_path, carrier_image)
            
            result = {"success": success, "output_path": output_path if success else None}
            print(json.dumps(result))
            
        else:
            raise ValueError(f"Unknown command: {command}")
            
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()