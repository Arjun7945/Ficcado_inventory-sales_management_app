/**
 * lib/google/appMeta.ts
 *
 * Reads and writes key/value pairs in the AppMeta tab of the bootstrap spreadsheet.
 *
 * Known keys:
 *   superadmin_claimed    — 'true' once the Superadmin has self-claimed
 *   superadmin_username   — the Superadmin's chosen username (plain text)
 *   superadmin_password_hash — bcrypt hash of the Superadmin's password
 *   setup_completed       — 'true' once all 4 wizard steps are done
 *   gmail_sender          — sender email address (e.g. arjunpslxi@gmail.com)
 *   gmail_password_enc    — AES-256 encrypted Gmail app password
 *   report_send_time      — HH:MM for daily scheduled report (24h)
 */

import { getSheetsClient } from './sheetsClient';
import { getBootstrapSpreadsheetId, APP_META_TAB } from './bootstrap';

/** Read all AppMeta rows and return as a plain key→value map. */
async function readAllMeta(): Promise<Map<string, string>> {
  const { spreadsheetId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${APP_META_TAB}!A:C`,
  });

  const rows = res.data.values ?? [];
  const map = new Map<string, string>();

  for (let i = 1; i < rows.length; i++) {
    const [key, value] = rows[i];
    if (key) map.set(String(key), value ? String(value) : '');
  }

  return map;
}

/**
 * Get the value for a single AppMeta key.
 * Returns undefined if the key doesn't exist.
 */
export async function getAppMeta(key: string): Promise<string | undefined> {
  const map = await readAllMeta();
  return map.get(key);
}

/**
 * Get multiple AppMeta keys in one sheet read.
 */
export async function getAppMetaMulti(
  keys: string[]
): Promise<Record<string, string | undefined>> {
  const map = await readAllMeta();
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    result[key] = map.get(key);
  }
  return result;
}

/**
 * Set (upsert) a key/value pair in AppMeta.
 * If the key already exists, updates in place. Otherwise appends.
 */
export async function setAppMeta(key: string, value: string): Promise<void> {
  const { spreadsheetId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();

  // Read existing rows to find if the key already exists
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${APP_META_TAB}!A:A`,
  });

  const rows = res.data.values ?? [];
  const updatedAt = new Date().toISOString();

  // Row index (1-based) where this key lives (skip header at index 0)
  let existingRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      existingRowIndex = i + 1; // +1 because Sheets rows are 1-indexed
      break;
    }
  }

  if (existingRowIndex > 0) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${APP_META_TAB}!A${existingRowIndex}:C${existingRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, value, updatedAt]] },
    });
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${APP_META_TAB}!A:C`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, value, updatedAt]] },
    });
  }
}

/**
 * Derive a simple symmetric encryption key from the service account key.
 * This is used to encrypt the Gmail app password at rest in the spreadsheet.
 *
 * SECURITY TRADEOFF (documented as required by spec Phase 0, Step 3):
 * The encryption key is derived from GOOGLE_SERVICE_ACCOUNT_KEY, which is
 * also stored as an env var. This means the encrypted value is only as safe
 * as the env var itself. For this deployment model (Netlify env vars +
 * service account restricted to this project's sheets), this is an acceptable
 * tradeoff — the Gmail password is not in plaintext in the sheet, and access
 * requires both the env var and the sheet to be compromised simultaneously.
 * If a higher security posture is needed, replace with a dedicated
 * ENCRYPTION_SECRET env var.
 */
export function deriveEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '';
  // Use the private_key_id as the basis for a 32-byte key
  const match = raw.match(/"private_key_id"\s*:\s*"([a-f0-9]+)"/);
  const seed = match ? match[1] : raw.slice(0, 64);
  // Pad/truncate to exactly 32 bytes for AES-256
  const buf = Buffer.alloc(32, 0);
  Buffer.from(seed, 'hex').copy(buf);
  return buf;
}

/**
 * Encrypt a short string (e.g., Gmail app password) using AES-256-CBC.
 * Returns a hex string: `iv:ciphertext`.
 */
export function encryptValue(plaintext: string): string {
  // Dynamic import to keep this server-side only
  const crypto = require('crypto') as typeof import('crypto');
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value previously encrypted with encryptValue().
 */
export function decryptValue(ciphertext: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  const key = deriveEncryptionKey();
  const [ivHex, dataHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
