/**
 * lib/google/sheetsClient.ts
 * Server-side Google API client.
 * Reads GOOGLE_SERVICE_ACCOUNT_KEY from env — never hardcoded.
 */
import { google } from 'googleapis';

/** Parse the service account JSON from the environment variable. */
function getServiceAccountKey(): Record<string, any> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is not set. ' +
        'Add it to .env.local (development) or Netlify environment variables (production).'
    );
  }
  try {
    const creds = JSON.parse(raw);
    if (creds.private_key && typeof creds.private_key === 'string') {
      // Replace literal \n string with actual newline characters if needed
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
    return creds;
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. ' +
        'Ensure the env var contains the raw JSON of the service account key file.'
    );
  }
}

/** Cached GoogleAuth instance (module-level, reused across requests in the same process). */
let _auth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  if (!_auth) {
    const credentials = getServiceAccountKey();
    _auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }
  return _auth;
}

/** Returns an authenticated Google Sheets API client. */
export async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

/** Returns an authenticated Google Drive API client. */
export async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}
