// Document encryption service for data at rest
// Uses AES-256-GCM for authenticated encryption
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256 bits for AES-256

// Get encryption key from environment or derive from a master secret
const getEncryptionKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_SECRET must be set in production');
    }
    // Use a default for development (not secure for production!)
    return crypto.scryptSync('dev-encryption-key', 'dev-salt-value', KEY_LENGTH);
  }
  // Derive key from secret using scrypt
  return crypto.scryptSync(secret, 'steno-demand-letter-generator', KEY_LENGTH);
};

// Derive a key using scrypt with a random salt
const deriveKey = (password: string, salt: Buffer): Buffer => {
  return crypto.scryptSync(password, salt, KEY_LENGTH);
};

// Encrypt text data
export const encryptText = (plaintext: string): { encrypted: string; iv: string; authTag: string } => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

// Decrypt text data
export const decryptText = (encryptedData: { encrypted: string; iv: string; authTag: string }): string => {
  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

// Encrypt a buffer (for file encryption)
export const encryptBuffer = (buffer: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { encrypted, iv, authTag };
};

// Decrypt a buffer
export const decryptBuffer = (encryptedData: { encrypted: Buffer; iv: Buffer; authTag: Buffer }): Buffer => {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, encryptedData.iv);
  decipher.setAuthTag(encryptedData.authTag);

  return Buffer.concat([decipher.update(encryptedData.encrypted), decipher.final()]);
};

// Encrypt a file and save it with encryption metadata
export const encryptFile = async (inputPath: string, outputPath: string): Promise<void> => {
  const buffer = fs.readFileSync(inputPath);
  const { encrypted, iv, authTag } = encryptBuffer(buffer);

  // Create a combined format: [iv][authTag][encrypted data]
  const combined = Buffer.concat([iv, authTag, encrypted]);
  fs.writeFileSync(outputPath, combined);
};

// Decrypt an encrypted file
export const decryptFile = async (inputPath: string, outputPath: string): Promise<void> => {
  const combined = fs.readFileSync(inputPath);

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decrypted = decryptBuffer({ encrypted, iv, authTag });
  fs.writeFileSync(outputPath, decrypted);
};

// Encrypt a file and return the combined buffer (for storage)
export const encryptFileToBuffer = (inputPath: string): Buffer => {
  const buffer = fs.readFileSync(inputPath);
  const { encrypted, iv, authTag } = encryptBuffer(buffer);

  // Create a combined format: [iv][authTag][encrypted data]
  return Buffer.concat([iv, authTag, encrypted]);
};

// Decrypt a combined buffer back to original data
export const decryptFileFromBuffer = (combined: Buffer): Buffer => {
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  return decryptBuffer({ encrypted, iv, authTag });
};

// Generate a random file encryption key (for per-file encryption)
export const generateFileKey = (): string => {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
};

// Hash a file for integrity checking
export const hashFile = (filePath: string): string => {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

// Hash a buffer for integrity checking
export const hashBuffer = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

// Verify file integrity
export const verifyFileIntegrity = (filePath: string, expectedHash: string): boolean => {
  const actualHash = hashFile(filePath);
  return crypto.timingSafeEqual(
    Buffer.from(actualHash, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
};

// Secure random string generation for tokens, etc.
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};
