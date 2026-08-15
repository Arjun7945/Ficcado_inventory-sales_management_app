/**
 * app/api/sheet-config/global/route.ts
 *
 * Global Sheet Configuration management endpoint (Part 8 implementation).
 * Handles connectivity testing, tab existence checks, fresh tab generation,
 * destructive regeneration ("Remove all & regenerate"), and reference updates ("Don't remove & use it").
 */

import { requireAuth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheetsClient';
import { updateGlobalSpreadsheetId } from '@/lib/google/sheetConfig';
import { getRegisteredModules, getRequiredTabNames } from '@/lib/google/moduleRegistry';
import { formatAllSheets } from '@/lib/google/sheetFormatter';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

function extractSpreadsheetId(input: string): string {
  const trimmed = (input || '').trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

function columnLetter(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, rawSpreadsheetId, confirmationText, oldSpreadsheetId } = body;
    const targetId = extractSpreadsheetId(rawSpreadsheetId);

    if (!targetId) {
      return Response.json(
        { error: 'Spreadsheet ID is required.', detail: 'Please enter a valid Google Spreadsheet ID or URL.' },
        { status: 400 }
      );
    }

    const sheets = await getSheetsClient();

    // 1. Connection check
    let meta;
    try {
      meta = await sheets.spreadsheets.get({ spreadsheetId: targetId });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('access')) {
        return Response.json(
          {
            error: "Couldn't access that spreadsheet — make sure it's shared with the service account as Editor first.",
            detail: msg,
          },
          { status: 403 }
        );
      }
      return Response.json(
        {
          error: `Can't find spreadsheet with ID '${targetId}'. Double check the Spreadsheet ID and permissions.`,
          detail: msg,
        },
        { status: 422 }
      );
    }

    const existingSheetObjs = meta.data.sheets ?? [];
    const existingTabs = existingSheetObjs.map((s) => s.properties?.title).filter(Boolean) as string[];
    const requiredTabs = getRequiredTabNames();

    // Check matching required tabs
    const matchingTabs = requiredTabs.filter((tab) => existingTabs.includes(tab));
    // A spreadsheet is considered "fresh" if it has 0 of the required tabs (or only a single blank default tab like Sheet1)
    const isFresh = matchingTabs.length === 0;

    if (action === 'check') {
      return Response.json({
        success: true,
        spreadsheetId: targetId,
        isFresh,
        existingTabs,
        requiredTabs,
        matchingTabCount: matchingTabs.length,
        totalRequiredCount: requiredTabs.length,
      });
    }

    const registeredModules = getRegisteredModules();

    // 2. Action: Fresh Generation
    if (action === 'generate-fresh') {
      const requests: any[] = [];
      for (const mod of registeredModules) {
        if (!existingTabs.includes(mod.tabName)) {
          requests.push({ addSheet: { properties: { title: mod.tabName } } });
        }
      }

      if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: targetId,
          requestBody: { requests },
        });
      }

      // Populate headers
      for (const mod of registeredModules) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: targetId,
          range: `${mod.tabName}!A1:${columnLetter(mod.headers.length)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [mod.headers] },
        });
      }

      // Apply formatting
      try {
        await formatAllSheets(targetId);
      } catch (fErr) {
        console.error('[global-sheet-config] Failed to apply formatting:', fErr);
      }

      // Propagate new ID
      await updateGlobalSpreadsheetId(targetId, admin.name);

      // Log Activity
      await logActivity({
        adminName: admin.name,
        action: 'updated',
        module: 'Sheet Configuration',
        recordId: targetId,
        moduleKey: 'sheet_config',
        customMessage: `Admin ${admin.name} updated the Sheet Configuration spreadsheet from ${oldSpreadsheetId || 'previous'} to ${targetId} using 'Fresh Generation'.`,
      });

      return Response.json({
        success: true,
        spreadsheetId: targetId,
        message: `Successfully generated all ${registeredModules.length} module tabs and updated Sheet Configuration.`,
      });
    }

    // 3. Action: Remove All & Regenerate (Destructive)
    if (action === 'remove-and-regenerate') {
      if (confirmationText !== 'REMOVE') {
        return Response.json(
          { error: "Secondary confirmation failed. You must type 'REMOVE' to execute this action." },
          { status: 400 }
        );
      }

      // Step A: Add a temporary sheet to prevent Google Sheets 0-sheet error
      const tempSheetTitle = '__temp_fica_reset__';
      const addTempRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tempSheetTitle } } }],
        },
      });

      const tempSheetId = addTempRes.data.replies?.[0]?.addSheet?.properties?.sheetId;

      // Step B: Delete all previous sheets
      const deleteRequests: any[] = [];
      for (const sheetObj of existingSheetObjs) {
        if (sheetObj.properties?.sheetId !== undefined) {
          deleteRequests.push({ deleteSheet: { sheetId: sheetObj.properties.sheetId } });
        }
      }

      // Step C: Add all required module sheets
      for (const mod of registeredModules) {
        deleteRequests.push({ addSheet: { properties: { title: mod.tabName } } });
      }

      // Step D: Delete temp sheet if it exists
      if (tempSheetId !== undefined) {
        deleteRequests.push({ deleteSheet: { sheetId: tempSheetId } });
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetId,
        requestBody: { requests: deleteRequests },
      });

      // Step E: Write headers for all fresh module sheets
      for (const mod of registeredModules) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: targetId,
          range: `${mod.tabName}!A1:${columnLetter(mod.headers.length)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [mod.headers] },
        });
      }

      // Step F: Format all sheets
      try {
        await formatAllSheets(targetId);
      } catch (fErr) {
        console.error('[global-sheet-config] Failed formatting on regenerate:', fErr);
      }

      // Step G: Propagate new ID
      await updateGlobalSpreadsheetId(targetId, admin.name);

      // Step H: Activity Log
      await logActivity({
        adminName: admin.name,
        action: 'updated',
        module: 'Sheet Configuration',
        recordId: targetId,
        moduleKey: 'sheet_config',
        customMessage: `Admin ${admin.name} updated the Sheet Configuration spreadsheet from ${oldSpreadsheetId || 'previous'} to ${targetId} using 'Remove all & regenerate.'`,
      });

      return Response.json({
        success: true,
        spreadsheetId: targetId,
        message: `Successfully removed existing tabs, regenerated all ${registeredModules.length} module tabs, and updated Sheet Configuration.`,
      });
    }

    // 4. Action: Don't remove & use it (Reuse Existing)
    if (action === 'use-existing') {
      await updateGlobalSpreadsheetId(targetId, admin.name);

      await logActivity({
        adminName: admin.name,
        action: 'updated',
        module: 'Sheet Configuration',
        recordId: targetId,
        moduleKey: 'sheet_config',
        customMessage: `Admin ${admin.name} updated the Sheet Configuration spreadsheet from ${oldSpreadsheetId || 'previous'} to ${targetId} using 'Don't remove & use it.'`,
      });

      return Response.json({
        success: true,
        spreadsheetId: targetId,
        message: `Updated Sheet Configuration to use existing spreadsheet ${targetId} without modifying tabs or data.`,
      });
    }

    return Response.json({ error: "Invalid action. Must be 'check', 'generate-fresh', 'remove-and-regenerate', or 'use-existing'." }, { status: 400 });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sheet-config/global]', message);
    return Response.json(
      { error: "Couldn't update global Sheet Configuration. Check connection and permissions.", detail: message },
      { status: 500 }
    );
  }
}
