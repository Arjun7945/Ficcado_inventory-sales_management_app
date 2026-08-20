/**
 * scratch/check_config.ts
 */
import { getBootstrapSpreadsheetId, SHEET_CONFIG_TAB } from '../lib/google/bootstrap';
import { getSheetsClient } from '../lib/google/sheetsClient';

async function check() {
  try {
    const { spreadsheetId } = await getBootstrapSpreadsheetId();
    console.log('Bootstrap Spreadsheet ID:', spreadsheetId);
    const sheets = await getSheetsClient();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_CONFIG_TAB}!A:F`,
    });

    const rows = res.data.values ?? [];
    console.log(`SheetConfig tab (${SHEET_CONFIG_TAB}) total rows: ${rows.length}`);
    for (let i = 0; i < rows.length; i++) {
      console.log(`Row ${i + 1}:`, JSON.stringify(rows[i]));
    }
  } catch (err: any) {
    console.error('Error fetching SheetConfig:', err);
  }
}

check();
