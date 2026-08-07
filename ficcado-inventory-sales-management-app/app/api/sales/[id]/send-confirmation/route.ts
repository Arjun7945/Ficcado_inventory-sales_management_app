/**
 * app/api/sales/[id]/send-confirmation/route.ts
 * POST — send a Gmail order-confirmation email to the customer.
 *
 * Uses:
 *  - generateInvoicePdf() from lib/invoiceGenerator (same function as PDF download — never duplicated)
 *  - Nodemailer with Gmail SMTP config from AppMeta (same as send-report route)
 *
 * Error responses are specific per failure type (no email, SMTP failure, missing config).
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { getAppMeta, decryptValue } from '@/lib/google/appMeta';
import { generateInvoicePdf, type InvoiceSaleData } from '@/lib/invoiceGenerator';
import { logActivity } from '@/lib/activityLogger';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

const COL = {
  invoiceNumber:        1,
  customerName:         3,
  customerPhone:        4,
  customerAddress:      5,
  totalItems:           6,
  itemNames:            7,
  sizes:                8,
  itemPrices:           9,
  totalAmount:          10,
  paymentStatus:        11,
  modeOfPayment:        12,
  transactionId:        13,
  createdAt:            14,
  deliveryChargeToggle: 20,
  deliveryChargeAmount: 21,
  discount:             25,
  customerEmail:        26,
};

async function getEmailConfig() {
  const [sender, encryptedPass] = await Promise.all([
    getAppMeta('gmail_sender'),
    getAppMeta('gmail_password_enc'),
  ]);

  if (!encryptedPass) {
    throw new Error('Gmail app password is not configured. Complete Setup Wizard Step 3 first.');
  }

  const pass = decryptValue(encryptedPass);
  return { sender: sender || 'ficcado@gmail.com', pass };
}

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // `id` here is the invoice number (e.g. "FIC-42")
  const { id: invoiceNumber } = await params;

  let admin;
  try {
    admin = await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Auth required.' }, { status: 401 });
  }

  try {
    // 1. Load the sale row
    const salesRows = await readAllRows('sales');
    const match = salesRows.slice(1).find((r) => r[COL.invoiceNumber] === invoiceNumber);

    if (!match) {
      return Response.json(
        { error: `No sale found with invoice number '${invoiceNumber}'.` },
        { status: 404 }
      );
    }

    const customerEmail = (match[COL.customerEmail] ?? '').trim();

    // 2. Guard: no email on file
    if (!customerEmail) {
      return Response.json(
        {
          error: 'No email on file for this customer — add one via phone lookup or edit the customer record.',
          noEmail: true,
        },
        { status: 400 }
      );
    }

    const saleData: InvoiceSaleData = {
      invoiceNumber:        match[COL.invoiceNumber]        ?? invoiceNumber,
      customerName:         match[COL.customerName]         ?? '',
      customerPhone:        match[COL.customerPhone]        ?? '',
      customerAddress:      match[COL.customerAddress]      ?? '',
      customerEmail,
      itemNames:            match[COL.itemNames]            ?? '',
      sizes:                match[COL.sizes]                ?? '',
      itemPrices:           match[COL.itemPrices]           ?? '',
      totalItems:           match[COL.totalItems]           ?? '1',
      totalAmount:          match[COL.totalAmount]          ?? '0',
      discount:             parseFloat(match[COL.discount]  ?? '0') || 0,
      deliveryChargeToggle: match[COL.deliveryChargeToggle] === 'true',
      deliveryChargeAmount: parseFloat(match[COL.deliveryChargeAmount] ?? '0') || 0,
      paymentStatus:        match[COL.paymentStatus]        ?? '',
      modeOfPayment:        match[COL.modeOfPayment]        ?? '',
      transactionId:        match[COL.transactionId]        ?? '',
      createdAt:            match[COL.createdAt]            ?? '',
    };

    // 3. Generate the invoice PDF (same function as download route — not duplicated)
    const pdfBuffer = await generateInvoicePdf(saleData);

    // 4. Load email config
    const { sender, pass } = await getEmailConfig();

    // 5. Parse line items & prices for professional table layout
    const names = saleData.itemNames.split(',').map((n) => n.trim()).filter(Boolean);
    const sizes = saleData.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const prices = (saleData.itemPrices || '').split(',').map((p) => parseFloat(p.trim()) || 0);

    const itemsMap = new Map<string, { item: string; size: string; qty: number; unitPrice: number }>();
    for (let i = 0; i < names.length; i++) {
      const sz = sizes[i] ?? sizes[0] ?? '—';
      const pr = prices[i] ?? (prices.length === 1 ? prices[0] : 0);
      const key = `${names[i].toLowerCase()}:${sz.toLowerCase()}:${pr}`;
      const existing = itemsMap.get(key);
      if (existing) {
        existing.qty += 1;
      } else {
        itemsMap.set(key, { item: names[i], size: sz, qty: 1, unitPrice: pr });
      }
    }
    const lineItems = Array.from(itemsMap.values());

    const grandTotalVal = parseFloat(saleData.totalAmount) || 0;
    const discountVal = saleData.discount || 0;
    const delivChargeVal = saleData.deliveryChargeToggle ? saleData.deliveryChargeAmount : 0;
    const rawItemsSubtotal = lineItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    const itemsSubtotal = rawItemsSubtotal > 0 ? rawItemsSubtotal : (grandTotalVal - delivChargeVal + discountVal);

    // Table rows HTML
    const tableRowsHtml = lineItems.map((li) => {
      const fallbackPrice = lineItems.length > 0 ? itemsSubtotal / lineItems.reduce((sum, i) => sum + i.qty, 0) : 0;
      const unitPrice = li.unitPrice > 0 ? li.unitPrice : fallbackPrice;
      const lineTotal = unitPrice * li.qty;
      return `
        <tr style="border-bottom: 1px solid #E2DCC9;">
          <td style="padding: 10px; font-weight: 600; color: #22261E;">${li.item}</td>
          <td style="padding: 10px; text-align: center; color: #6B6A5E;">${li.size}</td>
          <td style="padding: 10px; text-align: center; font-weight: 600; color: #22261E;">${li.qty}</td>
          <td style="padding: 10px; text-align: right; color: #22261E;">₹${unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 10px; text-align: right; font-weight: 700; color: #2B62C6;">₹${lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    const discountRowHtml = discountVal > 0 ? `
      <tr>
        <td colspan="4" style="padding: 6px 10px; text-align: right; color: #B0403A; font-weight: 600;">Discount Applied:</td>
        <td style="padding: 6px 10px; text-align: right; color: #B0403A; font-weight: 700;">-₹${discountVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    ` : '';

    const deliveryRowHtml = delivChargeVal > 0 ? `
      <tr>
        <td colspan="4" style="padding: 6px 10px; text-align: right; color: #6B6A5E;">Delivery Charge:</td>
        <td style="padding: 6px 10px; text-align: right; color: #22261E; font-weight: 600;">+₹${delivChargeVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    ` : '';

    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #F4F0E5; padding: 30px; color: #22261E;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 10px; padding: 28px; border: 1px solid #E2DCC9;">
          <div style="border-bottom: 2px solid #2B62C6; padding-bottom: 14px; margin-bottom: 20px;">
            <h1 style="color: #2B62C6; margin: 0; font-size: 22px; font-weight: 800;">FICCADO CLOTHING</h1>
            <p style="margin: 4px 0 0 0; color: #6B6A5E; font-size: 13px;">Official Order Confirmation & Invoice</p>
          </div>

          <p style="font-size: 15px; margin-bottom: 16px;">Hi <strong>${saleData.customerName}</strong>,</p>
          <p style="font-size: 14px; color: #444; line-height: 1.5;">Thank you for shopping with Ficcado Clothing! 🎉 We have received your order <strong>${invoiceNumber}</strong> and it is being prepared for shipment.</p>

          <div style="margin: 24px 0;">
            <h3 style="font-size: 15px; color: #2B62C6; margin-bottom: 10px;">Purchased Items</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background-color: #2B62C6; color: #FFFFFF;">
                  <th style="padding: 8px 10px; text-align: left;">Item</th>
                  <th style="padding: 8px 10px; text-align: center;">Size</th>
                  <th style="padding: 8px 10px; text-align: center;">Qty</th>
                  <th style="padding: 8px 10px; text-align: right;">Price</th>
                  <th style="padding: 8px 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
                <tr>
                  <td colspan="4" style="padding: 10px 10px 4px 10px; text-align: right; color: #6B6A5E; font-weight: 600;">Subtotal:</td>
                  <td style="padding: 10px 10px 4px 10px; text-align: right; color: #22261E; font-weight: 600;">₹${itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                ${discountRowHtml}
                ${deliveryRowHtml}
                <tr style="border-top: 2px solid #2B62C6;">
                  <td colspan="4" style="padding: 10px; text-align: right; color: #2B62C6; font-weight: 800; font-size: 15px;">Grand Total:</td>
                  <td style="padding: 10px; text-align: right; color: #2B62C6; font-weight: 800; font-size: 16px;">₹${grandTotalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="background-color: #F9F8F5; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 13px;">
            <p style="margin: 0 0 6px 0;"><strong>Payment Status:</strong> ${saleData.paymentStatus} (${saleData.modeOfPayment})</p>
            <p style="margin: 0;"><strong>Delivery Address:</strong> ${saleData.customerAddress}</p>
          </div>

          <p style="font-size: 13px; color: #6B6A5E; margin-bottom: 20px;">A PDF copy of your invoice is attached to this email for your accounting and purchase records.</p>

          <div style="border-top: 1px solid #E2DCC9; paddingTop: 14px; text-align: center; font-size: 12px; color: #6B6A5E;">
            <p style="margin: 0;">Warm regards,<br><strong>The Ficcado Team</strong><br><a href="https://www.ficcado.store" style="color: #2B62C6; text-decoration: none;">www.ficcado.store</a></p>
          </div>
        </div>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   587,
      secure: false,
      auth:   { user: sender, pass },
    });

    await transporter.sendMail({
      from:        `"Ficcado Clothing" <${sender}>`,
      to:          customerEmail,
      subject:     `Order Confirmed — Invoice ${invoiceNumber} | Ficcado Clothing`,
      html:        htmlBody,
      attachments: [
        {
          filename:    `${invoiceNumber}.pdf`,
          content:     pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    // Log Activity for Confirmation Email Send
    const logMsg = `Administrator '${admin.name}' successfully sent an official order confirmation email with attached PDF invoice '${invoiceNumber}' to customer '${saleData.customerName}' (${customerEmail}) containing ${saleData.itemNames || 'purchased items'} (Grand Total: ₹${saleData.totalAmount}) on ${new Date().toLocaleString('en-IN')}.`;

    logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Sales Management',
      moduleKey: 'sales',
      recordId: invoiceNumber,
      customMessage: logMsg,
    }).catch(() => {});

    return Response.json({
      success: true,
      message: `Confirmation email sent to ${customerEmail}.`,
      sentTo:  customerEmail,
    });
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown error';

    // Surface specific SMTP / config errors
    if (message.includes('Invalid login') || message.includes('535')) {
      return Response.json(
        { error: 'Gmail login failed. Check that the app password in Setup Wizard Step 3 is correct.', detail: message },
        { status: 500 }
      );
    }
    if (message.includes('getaddrinfo') || message.includes('ECONNREFUSED')) {
      return Response.json(
        { error: 'Could not connect to Gmail SMTP. Check your internet connection or try again shortly.', detail: message },
        { status: 500 }
      );
    }
    if (message.includes('not configured')) {
      return Response.json({ error: message }, { status: 503 });
    }

    return Response.json(
      { error: 'Failed to send confirmation email.', detail: message },
      { status: 500 }
    );
  }
}
