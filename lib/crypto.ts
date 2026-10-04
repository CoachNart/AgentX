import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not configured.');
  return createHash('sha256').update(raw).digest();
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function decrypt(payload: string) {
  const [iv, tag, data] = payload.split('.');
  if (!iv || !tag || !data) throw new Error('Invalid encrypted payload.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
export function randomToken(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
export function pkceChallenge(verifier: string) { return createHash('sha256').update(verifier).digest('base64url'); }