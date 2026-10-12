import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const dataDir = () => process.env.ABJ_DATA_DIR || join(homedir(), '.abj-odoo-mcp');
const file = (name) => join(dataDir(), name);

export async function atomicJson(name, value) {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const target = file(name);
  const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    const { unlink } = await import('node:fs/promises');
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function readJson(name) {
  try {
    const path = file(name);
    if (process.platform !== 'win32' && ((await stat(path)).mode & 0o077)) {
      throw new Error(`${path} must only be readable by its owner (chmod 600)`);
    }
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function hashSecret(secret, salt) {
  return scryptSync(secret, Buffer.from(salt, 'hex'), 64).toString('hex');
}

export function equalHash(secret, salt, expected) {
  const actual = Buffer.from(hashSecret(secret, salt), 'hex');
  const saved = Buffer.from(expected, 'hex');
  return actual.length === saved.length && timingSafeEqual(actual, saved);
}

export async function initialize(password) {
  if (await readJson('server.json')) throw new Error('Server already initialized; credentials unchanged');
  if (password.length < 6) throw new Error('Admin password must be at least 6 characters');
  const token = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const config = {
    salt,
    adminHash: hashSecret(password, salt),
    tokenHash: createHash('sha256').update(token).digest('hex'),
    encryptionKey: randomBytes(32).toString('hex'),
    csrfToken: randomBytes(32).toString('base64url'),
  };
  await atomicJson('server.json', config);
  await atomicJson('connections.json', []);
  return token;
}

export function verifyToken(token, config) {
  const actual = createHash('sha256').update(token).digest();
  return timingSafeEqual(actual, Buffer.from(config.tokenHash, 'hex'));
}

export function encrypt(secret, config) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(config.encryptionKey, 'hex'), nonce);
  const content = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), content].map((part) => part.toString('base64url')).join('.');
}

export function decrypt(ciphertext, config) {
  const [nonce, tag, content] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(config.encryptionKey, 'hex'), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
}
