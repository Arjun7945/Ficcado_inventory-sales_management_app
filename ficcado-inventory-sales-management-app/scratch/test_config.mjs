import { google } from 'googleapis';
import fs from 'fs';

async function check() {
  try {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const lines = envFile.split('\n');

    let spreadsheetId = '';
    let serviceAccountKeyStr = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...val] = trimmed.split('=');
      const valStr = val.join('=');
      if (key === 'BOOTSTRAP_SPREADSHEET_ID') spreadsheetId = valStr.trim();
      if (key === 'GOOGLE_SERVICE_ACCOUNT_KEY') serviceAccountKeyStr = valStr.trim();
    }

    const keyObj = JSON.parse(serviceAccountKeyStr);

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: keyObj.client_email,
        private_key: keyObj.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `SheetConfig!A:F`,
    });

    const rows = res.data.values ?? [];
    console.log(`Live SheetConfig tab rows count: ${rows.length}`);

    // Test new parsing logic
    const map = new Map();
    let dominantSpreadsheetId = '';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      const module_key = String(row[0] ?? '').trim();
      if (!module_key || module_key.toLowerCase() === 'module_key' || module_key.toLowerCase() === 'module key') {
        continue;
      }

      const display_name = String(row[1] ?? module_key).trim();
      const sheet_id     = String(row[2] ?? '').trim();
      const tab_name     = String(row[3] ?? module_key).trim();

      if (sheet_id && !dominantSpreadsheetId) dominantSpreadsheetId = sheet_id;

      if (module_key && sheet_id && tab_name) {
        map.set(module_key, { moduleKey: module_key, displayName: display_name, spreadsheetId: sheet_id, tabName: tab_name });
      }
    }

    console.log('\n--- Parsed Module Config Map ---');
    console.log('Total entries mapped:', map.size);
    console.log('Contains "items":', map.has('items'));
    console.log('Contains "inventory":', map.has('inventory'));
    console.log('Contains "sales":', map.has('sales'));
    console.log('Contains "expenses":', map.has('expenses'));
    console.log('Contains "vendors":', map.has('vendors'));

    if (map.has('items')) {
      console.log('\nItems Module Config:', JSON.stringify(map.get('items')));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();
