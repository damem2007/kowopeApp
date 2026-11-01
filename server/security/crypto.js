import crypto from 'node:crypto'
import dotenv from 'dotenv'

dotenv.config()

const rawKey = process.env.VAULT_KEY || process.env.LEDGERLY_ENCRYPTION_KEY
if (!rawKey) throw new Error('VAULT_KEY is required to encrypt Ledgerly data.')
const encryptionKey = crypto.createHash('sha256').update(rawKey).digest()
const prefix = 'kowope:v1:'

export function encryptValue(value) {
  if (value === null || value === undefined || value === '') return value ?? ''
  if (String(value).startsWith(prefix)) return String(value)
  const initializationVector = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, initializationVector)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `${prefix}${initializationVector.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptValue(value) {
  if (value === null || value === undefined || value === '' || !String(value).startsWith(prefix)) return value ?? ''
  const [, version, ivText, tagText, encryptedText] = String(value).split(':')
  if (version !== 'v1') throw new Error('Unsupported encrypted value version.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivText, 'base64'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8')
}

export const decryptFields = (record, fields) => record ? Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fields.includes(key) ? decryptValue(value) : value])) : record
export const businessFields = ['name', 'address', 'email', 'phone', 'payment_instructions']
export const invoiceFields = ['client_name', 'client_email', 'client_address', 'description', 'payment_instructions']
export const clientFields = ['name', 'email', 'company', 'address', 'phone', 'notes']
