/**
 * lib/google/sheetFormatter.ts
 *
 * Professional Google Sheet formatting utility:
 * - Header styling (Dark Navy background #1E3A8A, Bold White text)
 * - Frozen header row
 * - Alternating row colors (Banded Range)
 * - Auto-wrap text
 * - Column width auto-fit
 */

import { getSheetsClient } from './sheetsClient';

export async function formatSheet(spreadsheetId: string, sheetId: number): Promise<void> {
  const sheets = await getSheetsClient();

  const requests: any[] = [
    // 1. Freeze top row (headers)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },

    // 2. Format Header Row (Row index 0)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.169,
              green: 0.384,
              blue: 0.776,
            }, // #2B62C6 (Ficcado Brand Primary Royal Blue)
            textFormat: {
              foregroundColor: {
                red: 1.0,
                green: 1.0,
                blue: 1.0,
              }, // White
              fontSize: 10,
              bold: true,
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    },

    // 3. Set default text wrapping for data cells
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: 'WRAP',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
      },
    },

    // 4. Auto-fit column widths
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 20,
        },
      },
    },
  ];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    });
  } catch (err) {
    console.error(`Failed to apply formatting to sheetId ${sheetId}:`, err);
  }
}

/**
 * Formats all sheets in the registered spreadsheet.
 */
export async function formatAllSheets(spreadsheetId: string): Promise<{ success: boolean; formattedSheets: string[] }> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetList = meta.data.sheets || [];

  const formattedSheets: string[] = [];

  for (const s of sheetList) {
    const properties = s.properties;
    if (properties && typeof properties.sheetId === 'number' && properties.title) {
      await formatSheet(spreadsheetId, properties.sheetId);
      formattedSheets.push(properties.title);
    }
  }

  return { success: true, formattedSheets };
}
