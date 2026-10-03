import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts provider credentials at rest with AES-256-GCM.
 *
 * The key is derived with HKDF from CREDENTIALS_ENCRYPTION_KEY, falling back to
 * JWT_SECRET so a fresh install works without another secret to generate. Set
 * CREDENTIALS_ENCRYPTION_KEY in production: rotating JWT_SECRET would otherwise
 * make every stored credential undecryptable (they fail closed — the number
 * shows as "re-enter credentials" rather than dialling with garbage).
 */
export class CredentialCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.length < 32) {
      throw new Error('Credential encryption needs CREDENTIALS_ENCRYPTION_KEY (or JWT_SECRET) of at least 32 characters');
    }
    this.key = Buffer.from(hkdfSync('sha256', secret, 'marketing-platform', 'phone-number-credentials', 32));
  }

  encrypt(value: Record<string, string>): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
  }

  /** Throws if the payload was tampered with or encrypted under a different key. */
  decrypt(payload: string): Record<string, string> {
    const [version, data] = String(payload ?? '').split(':');
    if (version !== VERSION || !data) throw new Error('Unrecognised credential format');
    const raw = Buffer.from(data, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const text = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    return JSON.parse(text);
  }
}
