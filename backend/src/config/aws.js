import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Validate required AWS environment variables
const requiredAwsVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET'];
const missingAwsVars = requiredAwsVars.filter(varName => !process.env[varName]);

if (missingAwsVars.length > 0) {
  throw new Error(`Missing required AWS environment variables: ${missingAwsVars.join(', ')}`);
}

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Create S3 instance
export const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: {
    Bucket: process.env.AWS_S3_BUCKET
  }
});

// S3 configuration
export const S3_CONFIG = {
  bucket: process.env.AWS_S3_BUCKET,
  region: process.env.AWS_REGION,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/bmp'],
  signedUrlExpiry: 3600 // 1 hour
};

// Test S3 connection
export const testS3Connection = async () => {
  try {
    await s3.headBucket({ Bucket: S3_CONFIG.bucket }).promise();
    console.log('✅ AWS S3 connection successful');
    return true;
  } catch (error) {
    console.error('❌ AWS S3 connection failed:', error.message);
    return false;
  }
};

// Generate signed URL for secure access
export const generateSignedUrl = (key, operation = 'getObject', expires = S3_CONFIG.signedUrlExpiry) => {
  return s3.getSignedUrl(operation, {
    Bucket: S3_CONFIG.bucket,
    Key: key,
    Expires: expires
  });
};

// Upload file to S3
export const uploadToS3 = async (key, buffer, contentType) => {
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'service': 'biosteg-locker'
      }
    };

    const result = await s3.upload(params).promise();
    return {
      success: true,
      location: result.Location,
      key: result.Key,
      etag: result.ETag
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Download file from S3
export const downloadFromS3 = async (key) => {
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: key
    };

    const result = await s3.getObject(params).promise();
    return {
      success: true,
      body: result.Body,
      contentType: result.ContentType,
      metadata: result.Metadata
    };
  } catch (error) {
    console.error('S3 download error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete file from S3
export const deleteFromS3 = async (key) => {
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: key
    };

    await s3.deleteObject(params).promise();
    return { success: true };
  } catch (error) {
    console.error('S3 delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};