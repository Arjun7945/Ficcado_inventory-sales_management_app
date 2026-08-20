import { readAllRows } from '../lib/google/moduleSheet';
import { getSheetConfig } from '../lib/google/sheetConfig';

async function test() {
  try {
    console.log('Testing getSheetConfig...');
    const config = await getSheetConfig();
    console.log('Config entries count:', config.size);
    for (const [key, val] of config.entries()) {
      console.log(`  Module: ${key} -> Tab: ${val.tabName}, SheetID: ${val.spreadsheetId}`);
    }

    console.log('\nTesting readAllRows("items")...');
    const rows = await readAllRows('items');
    console.log('Successfully read items rows. Count:', rows.length);
  } catch (err: any) {
    console.error('Error during test:', err);
  }
}

test();
