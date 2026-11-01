import argon2 from 'argon2';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const VERSION = 'vault-p1';
const AAD = Buffer.from(VERSION, 'utf8');
const KDF = { type: argon2.argon2id, hashLength: 32, timeCost: 3, memoryCost: 65536, parallelism: 4, raw: true };

async function deriveKey(passphrase, saltBase64url) {
  const salt = Buffer.from(saltBase64url, 'base64url');
  if (salt.length !== 16) throw new Error('Salt must decode to exactly 16 bytes');
  return argon2.hash(passphrase, { ...KDF, salt });
}

function encrypt(plaintext, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([nonce, ciphertext, tag]).toString('base64url')}`;
}

function decrypt(payload, key) {
  const [version, encoded, extra] = payload.split(':');
  if (version !== VERSION || !encoded || extra !== undefined) throw new Error('Invalid payload version');
  const raw = Buffer.from(encoded, 'base64url');
  if (raw.length < 28) throw new Error('Invalid payload');
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(-16);
  const ciphertext = raw.subarray(12, -16);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const passphrase = "@1amThankful2God" //await rl.question('Passphrase (demo only; input visible): ');
  if (!passphrase) throw new Error('Passphrase cannot be empty');
  //const existingSalt = await rl.question('Existing Base64URL salt (Enter to generate new): ');
  const salt = "FK9OM-ZK1_uKpTJ2YKR3mg";//existingSalt.trim() || randomBytes(16).toString('base64url');
  const plaintext = await rl.question('Text to encrypt (Enter for example): ');
  const text = plaintext || 'example plaintext';
  const key = await deriveKey(passphrase, salt);
  const encrypted = encrypt(text, key);
  const restoredKey = await deriveKey(passphrase, salt);
  const recovered = decrypt(encrypted, restoredKey);
  console.log('\nVAULT_SALT =', salt);
  console.log('Derived key (demo only; DO NOT log in production) =', key.toString('base64url'));
  console.log('Encrypted =', encrypted);
  console.log('Decrypted =', recovered);
  console.log('Key derivation reproducible =', key.equals(restoredKey));
  console.log('Round-trip successful =', recovered === text);
  console.log('\nSave the salt and passphrase in a secure recovery location.');
} finally {
  rl.close();
}
