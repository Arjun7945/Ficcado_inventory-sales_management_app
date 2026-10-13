/**
 * app/api/email/send-report/route.ts
 * POST — send an immediate email report to all admins with email notifications enabled.
 * Body: { module?: string }  (optional — if omitted, sends all modules as sheets in one workbook)
 *
 * Uses Nodemailer with the Gmail app-password stored encrypted in AppMeta.
 * Recipient list is pulled dynamically from the Admin Information Sheet.
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { getAppMeta, decryptValue } from '@/lib/google/appMeta';
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

const MODULES_TO_SEND = [
  'items',
  'inventory',
  'warehouse',
  'sales',
  'replacement',
  'return_refund',
  'customer_info',
  'inventory_history',
  'damaged_products',
  'notes',
  'activity_logs',
];

const MODULE_HEADERS: Record<string, string[]> = {
  items:             ['S.No', 'Item Name', 'Item Type', 'Price', 'Available Sizes', 'Created By', 'Created At', 'Updated By', 'Updated At', 'Status'],
  inventory:         ['S.No', 'Item Name', 'Size', 'Total Quantity Available', 'Added By', 'Updated At', 'Updated By', 'Created At'],
  warehouse:         ['S.No', 'Warehouse Location', 'Handler Name', 'Item Name', 'Size', 'Quantity', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  sales:             ['S.No', 'Invoice Number', 'Sale Status', 'Customer Name', 'Customer Phone', 'Customer Address', 'Total Items', 'Item Names', 'Sizes Chosen', 'Item Prices', 'Total Amount', 'Payment Status', 'Mode of Payment', 'Transaction ID', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version', 'Delivery Status', 'Delivery Charge Toggle', 'Delivery Charge Amount', 'Fulfilment Status', 'Fulfilment Source', 'Sale Closed By', 'Discount', 'Customer Email'],
  replacement:       ['S.No', 'Invoice Number', 'Total Items', 'Last Items', 'Last Sizes', 'New Items', 'New Sizes', 'Invoice Status', 'Disposition', 'Restock Destination', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'],
  return_refund:     ['S.No', 'Invoice Number', 'Verification Status', 'Refund Status', 'Refund Amount', 'Refund Completed At', 'Transaction ID', 'Mode of Refund', 'Disposition', 'Restock Destination', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  customer_info:     ['S.No', 'Customer Name', 'Phone Number', 'Address', 'Email ID', 'Total Orders', 'Invoice Numbers', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  inventory_history: ['S.No', 'Item Name', 'Size', 'Quantity Change', 'Affected Sheet', 'Handler', 'Transaction Type', 'Related Invoice', 'Resulting Balance', 'Created By', 'Created At', 'Notes'],
  damaged_products:  ['S.No', 'Invoice Number', 'Item Name', 'Size', 'Quantity', 'Customer Name', 'Reason Notes', 'Logged By', 'Logged At'],
  notes:             ['S.No', 'Note Content', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  activity_logs:     ['S.No', 'Admin Name', 'Action', 'Module', 'Module Key', 'Record ID', 'Logged At', 'Message'],
};

async function getEmailConfig() {
  const [sender, encryptedPass] = await Promise.all([
    getAppMeta('gmail_sender'),
    getAppMeta('gmail_password_enc'),
  ]);

  if (!encryptedPass) {
    throw new Error('Gmail app password is not configured. Complete the Setup Wizard Step 3 first.');
  }

  const pass = decryptValue(encryptedPass);
  return { sender: sender || 'ficcado@gmail.com', pass };
}

async function getAdminRecipients(): Promise<string[]> {
  const rows = await readAllRows('admin_info');
  // col 4 = notifications, col 3 = email
  return rows.slice(1)
    .filter((r) => r[4] !== 'Disabled' && r[3])
    .map((r) => r[3]);
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const body      = await request.json().catch(() => ({}));
    const moduleKey = body.module as string | undefined;
    const modulesToExport = moduleKey ? [moduleKey] : MODULES_TO_SEND;

    const { sender, pass } = await getEmailConfig();
    const recipients       = await getAdminRecipients();

    if (!recipients.length) {
      return Response.json({ error: 'No admin has email notifications enabled. Enable notifications for at least one admin first.' }, { status: 400 });
    }

    // Build one XLSX workbook with a tab per module
    const wb = XLSX.utils.book_new();
    for (const key of modulesToExport) {
      if (!MODULE_HEADERS[key]) continue;
      try {
        const rows = await readAllRows(key);
        const ws   = XLSX.utils.aoa_to_sheet([MODULE_HEADERS[key], ...rows.slice(1)]);
        ws['!cols'] = MODULE_HEADERS[key].map((h) => ({ wch: Math.max(h.length + 2, 16) }));
        XLSX.utils.book_append_sheet(wb, ws, key.replace(/_/g, ' ').slice(0, 31));
      } catch {
        // Module not yet configured — skip silently
      }
    }

    const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const dateStr  = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const filename = `Ficcado-Daily-Report-${new Date().toISOString().split('T')[0]}.xlsx`;

    const transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   587,
      secure: false,
      auth:   { user: sender, pass },
    });

    await transporter.sendMail({
      from:        `"Ficcado App" <${sender}>`,
      to:          recipients.join(', '),
      subject:     `Ficcado Daily Report — ${dateStr}`,
      text:        `Hello,\n\nPlease find attached the Ficcado daily inventory and sales report for ${dateStr}.\n\nThis report was triggered by ${admin.name} from the Ficcado Management App.\n\n— Ficcado System`,
      attachments: [{ filename, content: buf }],
    });

    return Response.json({ success: true, message: `Report sent to ${recipients.length} admin(s).`, recipients });
  } catch (err) {
    return Response.json({ error: 'Failed to send report.', detail: (err as Error).message }, { status: 500 });
  }
}
