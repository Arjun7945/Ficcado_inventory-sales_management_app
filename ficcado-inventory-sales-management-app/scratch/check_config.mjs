import { google } from 'googleapis';
import fs from 'fs';

async function check() {
  try {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const lines = envFile.split('\n');

    let spreadsheetId = '';
    let sheetTab = '';
    let serviceAccountKeyStr = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...val] = trimmed.split('=');
      const valStr = val.join('=');
      if (key === 'BOOTSTRAP_SPREADSHEET_ID') spreadsheetId = valStr.trim();
      if (key === 'BOOTSTRAP_SHEET_NAME') sheetTab = valStr.trim();
      if (key === 'GOOGLE_SERVICE_ACCOUNT_KEY') serviceAccountKeyStr = valStr.trim();
    }

    const keyObj = JSON.parse(serviceAccountKeyStr);

    console.log('Active Bootstrap Spreadsheet ID:', spreadsheetId);
    console.log('Active Bootstrap Sheet Name:', sheetTab);

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: keyObj.client_email,
        private_key: keyObj.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Check SheetConfig tab in bootstrap spreadsheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `SheetConfig!A:F`,
    });

    const rows = res.data.values ?? [];
    console.log(`\n--- SheetConfig Tab Rows Count: ${rows.length} ---`);
    for (let i = 0; i < rows.length; i++) {
      console.log(`Row ${i + 1}:`, JSON.stringify(rows[i]));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();
