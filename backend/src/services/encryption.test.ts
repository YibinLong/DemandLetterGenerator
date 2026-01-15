// Tests for encryption service
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  encryptText,
  decryptText,
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
  encryptFileToBuffer,
  decryptFileFromBuffer,
  hashBuffer,
  generateSecureToken,
} from './encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.resolve(__dirname, '../../data/test-encryption');
const TEST_FILE = path.join(TEST_DIR, 'test-file.txt');
const ENCRYPTED_FILE = path.join(TEST_DIR, 'test-file.enc');
const DECRYPTED_FILE = path.join(TEST_DIR, 'test-file-dec.txt');

beforeAll(() => {
  // Create test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  // Clean up test files
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  if (fs.existsSync(ENCRYPTED_FILE)) fs.unlinkSync(ENCRYPTED_FILE);
  if (fs.existsSync(DECRYPTED_FILE)) fs.unlinkSync(DECRYPTED_FILE);
  if (fs.existsSync(TEST_DIR)) fs.rmdirSync(TEST_DIR);
});

describe('Text Encryption', () => {
  it('should encrypt and decrypt text successfully', () => {
    const plaintext = 'This is a secret message for testing encryption';
    const encrypted = encryptText(plaintext);

    expect(encrypted.encrypted).not.toBe(plaintext);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    const decrypted = decryptText(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext (due to random IV)', () => {
    const plaintext = 'Same message encrypted twice';
    const encrypted1 = encryptText(plaintext);
    const encrypted2 = encryptText(plaintext);

    expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('should handle empty string', () => {
    const plaintext = '';
    const encrypted = encryptText(plaintext);
    const decrypted = decryptText(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should handle unicode characters', () => {
    const plaintext = '日本語テスト 🔐 مرحبا العالم';
    const encrypted = encryptText(plaintext);
    const decrypted = decryptText(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should handle long text', () => {
    const plaintext = 'A'.repeat(100000); // 100KB of text
    const encrypted = encryptText(plaintext);
    const decrypted = decryptText(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should fail decryption with tampered ciphertext', () => {
    const plaintext = 'Secret message';
    const encrypted = encryptText(plaintext);

    // Tamper with the ciphertext
    const tamperedCiphertext = {
      ...encrypted,
      encrypted: encrypted.encrypted.replace(/./g, (c, i) => i === 0 ? 'X' : c),
    };

    expect(() => decryptText(tamperedCiphertext)).toThrow();
  });

  it('should fail decryption with wrong auth tag', () => {
    const plaintext = 'Secret message';
    const encrypted = encryptText(plaintext);

    // Change auth tag
    const wrongAuthTag = {
      ...encrypted,
      authTag: 'AAAAAAAAAAAAAAAAAAAAAA==', // Wrong auth tag
    };

    expect(() => decryptText(wrongAuthTag)).toThrow();
  });
});

describe('Buffer Encryption', () => {
  it('should encrypt and decrypt buffer successfully', () => {
    const originalData = Buffer.from('Binary data for encryption test');
    const encrypted = encryptBuffer(originalData);

    expect(encrypted.encrypted).not.toEqual(originalData);
    expect(encrypted.iv.length).toBe(12); // 96 bits
    expect(encrypted.authTag.length).toBe(16); // 128 bits

    const decrypted = decryptBuffer(encrypted);
    expect(decrypted).toEqual(originalData);
  });

  it('should handle binary data', () => {
    // Create buffer with all possible byte values
    const originalData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
      originalData[i] = i;
    }

    const encrypted = encryptBuffer(originalData);
    const decrypted = decryptBuffer(encrypted);

    expect(decrypted).toEqual(originalData);
  });

  it('should handle large buffers', () => {
    const largeBuffer = Buffer.alloc(1024 * 1024, 'A'); // 1MB
    const encrypted = encryptBuffer(largeBuffer);
    const decrypted = decryptBuffer(encrypted);

    expect(decrypted).toEqual(largeBuffer);
  });
});

describe('File Encryption', () => {
  it('should encrypt and decrypt file successfully', async () => {
    const testContent = 'This is a test file content for encryption testing.\nLine 2 of the file.';
    fs.writeFileSync(TEST_FILE, testContent);

    await encryptFile(TEST_FILE, ENCRYPTED_FILE);

    // Encrypted file should exist and be different from original
    expect(fs.existsSync(ENCRYPTED_FILE)).toBe(true);
    const encryptedContent = fs.readFileSync(ENCRYPTED_FILE);
    const originalContent = fs.readFileSync(TEST_FILE);
    expect(encryptedContent).not.toEqual(originalContent);

    await decryptFile(ENCRYPTED_FILE, DECRYPTED_FILE);

    // Decrypted content should match original
    const decryptedContent = fs.readFileSync(DECRYPTED_FILE, 'utf-8');
    expect(decryptedContent).toBe(testContent);
  });

  it('should encrypt file to buffer and decrypt back', () => {
    const testContent = 'Buffer-based file encryption test';
    fs.writeFileSync(TEST_FILE, testContent);

    const encryptedBuffer = encryptFileToBuffer(TEST_FILE);
    expect(encryptedBuffer.length).toBeGreaterThan(testContent.length);

    const decryptedBuffer = decryptFileFromBuffer(encryptedBuffer);
    expect(decryptedBuffer.toString('utf-8')).toBe(testContent);
  });
});

describe('Hashing', () => {
  it('should produce consistent hash for same input', () => {
    const data = Buffer.from('Test data for hashing');
    const hash1 = hashBuffer(data);
    const hash2 = hashBuffer(data);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 produces 64 hex characters
  });

  it('should produce different hash for different input', () => {
    const data1 = Buffer.from('Data 1');
    const data2 = Buffer.from('Data 2');

    const hash1 = hashBuffer(data1);
    const hash2 = hashBuffer(data2);

    expect(hash1).not.toBe(hash2);
  });

  it('should be sensitive to small changes', () => {
    const data1 = Buffer.from('Test data');
    const data2 = Buffer.from('Test datA'); // Only one character different

    const hash1 = hashBuffer(data1);
    const hash2 = hashBuffer(data2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('Token Generation', () => {
  it('should generate secure random tokens', () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();

    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('should generate tokens of specified length', () => {
    const token16 = generateSecureToken(16);
    const token64 = generateSecureToken(64);

    expect(token16.length).toBe(32); // 16 bytes = 32 hex chars
    expect(token64.length).toBe(128); // 64 bytes = 128 hex chars
  });

  it('should generate cryptographically random tokens', () => {
    // Generate many tokens and ensure they're unique
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateSecureToken());
    }

    // All tokens should be unique
    expect(tokens.size).toBe(1000);
  });
});
