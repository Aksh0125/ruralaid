import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const bucketName = process.env.S3_BUCKET_NAME || 'ruralaid-prescriptions';
const region = process.env.S3_REGION || 'us-east-1';

// Setup S3 Client with custom endpoint support (e.g. MinIO, LocalStack, R2)
const s3Config: any = {
  region,
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.forcePathStyle = true; // necessary for MinIO/LocalStack
}

export const s3Client = process.env.AWS_ACCESS_KEY_ID ? new S3Client(s3Config) : null;

/**
 * Uploads a file buffer directly to S3 as a private object.
 */
export async function uploadVideoBuffer(
  objectKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  if (!s3Client) {
    console.log(`[S3 MOCK UPLOAD] Mock upload of key: ${objectKey} (${buffer.length} bytes, type: ${mimeType})`);
    return;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    Body: buffer,
    ContentType: mimeType,
    // S3 objects are private by default
  });

  await s3Client.send(command);
}

/**
 * Generates a time-limited presigned GET URL for an object in S3.
 * Default expiration: 15 minutes (900 seconds).
 */
export async function getSignedDownloadUrl(objectKey: string): Promise<string> {
  if (!s3Client) {
    // Return a mock URL for development
    return `https://mock-s3-presigned-url.local/${bucketName}/${objectKey}?token=mock-expired-in-15m`;
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  // Expire in 15 minutes (900 seconds)
  return getSignedUrl(s3Client, command, { expiresIn: 900 });
}
