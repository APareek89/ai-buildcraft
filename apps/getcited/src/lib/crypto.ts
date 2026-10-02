import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for opt-in stored BYO keys (Self Serve). The key comes from
 * KEY_ENCRYPTION_SECRET (32-byte base64). Ciphertext/iv/authTag are stored separately;
 * plaintext keys are NEVER persisted or logged. Only used server-side.
 */

function secretKey(): Buffer {
  const raw = process.env.KEY_ENCRYPTION_SECRET;
  if (!raw) throw new Error("KEY_ENCRYPTION_SECRET is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`KEY_ENCRYPTION_SECRET must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

export interface EncryptedValue {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export function encryptSecret(plaintext: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(v: EncryptedValue): string {
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(v.iv, "base64"));
  decipher.setAuthTag(Buffer.from(v.authTag, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(v.ciphertext, "base64")), decipher.final()]);
  return dec.toString("utf8");
}
