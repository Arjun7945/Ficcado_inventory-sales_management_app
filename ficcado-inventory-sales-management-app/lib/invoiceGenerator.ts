/**
 * lib/invoiceGenerator.ts
 *
 * Reusable server-side PDF invoice generator.
 * Superimposes dynamic sale invoice data with pixel-perfect alignment
 * directly over assets/invoice/ficcado_invoice_page.png template artwork.
 *
 * Includes:
 *  - Clear "BILLED TO" & "INVOICE DETAILS" section headers.
 *  - Dark solid items table with white text headers.
 *  - Dedicated Payment Information Table for Payment Status, Mode, & Reference ID.
 *  - 'Rs.' currency formatting for clean, artifact-free rendering.
 *
 * Returns a Buffer — never writes to disk.
 * Called by both the PDF download route and the Gmail confirmation email.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface InvoiceSaleData {
  invoiceNumber:        string;
  customerName:         string;
  customerPhone:        string;
  customerAddress:      string;
  customerEmail?:       string;
  itemNames:            string;   // comma-separated
  sizes:                string;   // comma-separated
  itemPrices?:          string;   // comma-separated unit prices
  totalItems:           string;
  totalAmount:          string;   // post-discount grand total
  discount:             number;   // raw discount amount (0 if none)
  deliveryChargeToggle: boolean;
  deliveryChargeAmount: number;
  paymentStatus:        string;
  modeOfPayment:        string;
  transactionId:        string;
  createdAt:            string;
}

// Brand colors matching DESIGN.md
const BRAND_PRIMARY   = '#2B62C6';
const INK             = '#22261E';
const INK_MUTED       = '#6B6A5E';
const SUCCESS         = '#2F7D4F';
const ERROR           = '#B0403A';
const WARNING         = '#B8862B';

export interface InvoiceLineItem {
  item: string;
  size: string;
  qty: number;
  unitPrice: number;
}

/** Parse comma-separated item names, sizes, and prices into an array of line items with quantities and unit prices. */
function buildLineItems(itemNames: string, sizes: string, itemPrices?: string): InvoiceLineItem[] {
  const names = itemNames.split(',').map((s) => s.trim()).filter(Boolean);
  const szArr = sizes.split(',').map((s) => s.trim()).filter(Boolean);
  const prArr = (itemPrices || '').split(',').map((p) => parseFloat(p.trim()) || 0);

  const itemsMap = new Map<string, InvoiceLineItem>();

  for (let i = 0; i < names.length; i++) {
    const rawName = names[i];
    const rawSize = szArr[i] ?? szArr[0] ?? '—';
    const unitPrice = prArr[i] ?? (prArr.length === 1 ? prArr[0] : 0);

    // Parse potential quantity indicators like "(x2)" or "(2)" if present in legacy strings
    const match = rawName.match(/\(x?(\d+)\)/i) || rawSize.match(/\(x?(\d+)\)/i);
    const parsedQty = match ? (parseInt(match[1], 10) || 1) : 1;
    const cleanName = rawName.replace(/\(x?\d+\)/gi, '').trim();
    const cleanSize = rawSize.replace(/\(x?\d+\)/gi, '').trim();

    const key = `${cleanName.toLowerCase()}:${cleanSize.toLowerCase()}:${unitPrice}`;
    const existing = itemsMap.get(key);
    if (existing) {
      existing.qty += parsedQty;
    } else {
      itemsMap.set(key, { item: cleanName, size: cleanSize, qty: parsedQty, unitPrice });
    }
  }

  return Array.from(itemsMap.values());
}

export async function generateInvoicePdf(sale: InvoiceSaleData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // Read background template image into Node Buffer
    const publicTemplatePath = path.join(process.cwd(), 'public', 'assets', 'invoice', 'ficcado_invoice_page.png');
    const rootTemplatePath   = path.join(process.cwd(), 'assets', 'invoice', 'ficcado_invoice_page.png');
    let templateBuffer: Buffer | null = null;
    try {
      if (fs.existsSync(publicTemplatePath)) {
        templateBuffer = fs.readFileSync(publicTemplatePath);
      } else if (fs.existsSync(rootTemplatePath)) {
        templateBuffer = fs.readFileSync(rootTemplatePath);
      }
    } catch (e) {
      console.warn('[invoiceGenerator] Template image read notice:', e);
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595.28 pt
    const PH = doc.page.height;  // 841.89 pt
    const L  = 45;               // left margin
    const R  = PW - 45;          // right margin

    // ── 1. Draw Background Template Image ──────────────────────────────────
    if (templateBuffer) {
      doc.image(templateBuffer, 0, 0, { width: PW, height: PH });
    }

    // ── 2. BILLED TO & INVOICE DETAILS Section Headers ─────────────────────
    const sectionHeaderY = 135;

    // Left Section Header: BILLED TO
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(BRAND_PRIMARY)
      .text('BILLED TO:', L, sectionHeaderY);

    // Right Section Header: INVOICE DETAILS
    const metaX = 380;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(BRAND_PRIMARY)
      .text('INVOICE DETAILS:', metaX, sectionHeaderY);

    // Divider line under section headers
    doc
      .moveTo(L, sectionHeaderY + 16)
      .lineTo(R, sectionHeaderY + 16)
      .strokeColor('#E2DCC9')
      .lineWidth(1)
      .stroke();

    // ── 3. Customer & Meta Details ─────────────────────────────────────────
    let y = sectionHeaderY + 24;

    // Left Column: Customer Details
    doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor(INK)
      .text(sale.customerName, L, y);

    y += 16;
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(INK_MUTED)
      .text(`Phone: ${sale.customerPhone}`, L, y);

    y += 14;
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(INK_MUTED)
      .text(sale.customerAddress, L, y, { width: 260, lineGap: 3 });

    if (sale.customerEmail) {
      const addrLines = Math.max(1, Math.ceil(sale.customerAddress.length / 40));
      y += 14 * addrLines + 2;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(BRAND_PRIMARY)
        .text(sale.customerEmail, L, y);
    }

    // Right Column: Invoice Meta Details
    let rightY = sectionHeaderY + 24;
    const invoiceDate = sale.createdAt
      ? new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text('Invoice No:', metaX, rightY);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(BRAND_PRIMARY)
      .text(sale.invoiceNumber, metaX + 75, rightY);

    rightY += 18;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text('Invoice Date:', metaX, rightY);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK_MUTED)
      .text(invoiceDate, metaX + 75, rightY);

    // ── 4. Items Table Header Bar ──────────────────────────────────────────
    const tableHeaderY = Math.max(y + 24, 275);
    const barHeight    = 24;

    // Dark solid header bar
    doc
      .rect(L - 2, tableHeaderY - 5, R - L + 4, barHeight)
      .fillColor('#1A1A1A')
      .fill();

    // White bold text
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#FFFFFF');

    doc.text('Item',     L + 6,   tableHeaderY, { width: 180 });
    doc.text('Size',     L + 210, tableHeaderY, { width: 40, align: 'center' });
    doc.text('Quantity', L + 270, tableHeaderY, { width: 55, align: 'center' });
    doc.text('Price',    L + 355, tableHeaderY, { width: 65, align: 'right' });
    doc.text('Total',    L + 440, tableHeaderY, { width: 65, align: 'right' });

    // ── 5. Item Data Rows ──────────────────────────────────────────────────
    const lineItems   = buildLineItems(sale.itemNames, sale.sizes, sale.itemPrices);
    const grandTotal  = parseFloat(sale.totalAmount) || 0;
    const discount    = sale.discount || 0;
    const delivCharge = sale.deliveryChargeToggle ? (sale.deliveryChargeAmount || 0) : 0;
    const orderSubtotal = grandTotal - delivCharge + discount;
    const totalPieces   = lineItems.reduce((sum, li) => sum + li.qty, 0);

    const storedItemsSubtotal = lineItems.reduce((sum, li) => sum + (li.unitPrice * li.qty), 0);
    const useStoredPrices = storedItemsSubtotal > 0;
    const fallbackUnitPrice = totalPieces > 0 ? orderSubtotal / totalPieces : 0;
    const itemsSubtotal = useStoredPrices ? storedItemsSubtotal : orderSubtotal;

    let rowY = tableHeaderY + 28;
    lineItems.forEach((li, idx) => {
      const unitPrice = useStoredPrices && li.unitPrice > 0 ? li.unitPrice : fallbackUnitPrice;
      const lineTotal = unitPrice * li.qty;

      // Alternating row tint
      const bgColor = idx % 2 === 0 ? '#F9F8F5' : '#FFFFFF';
      doc
        .rect(L - 2, rowY - 5, R - L + 4, 24)
        .fillColor(bgColor)
        .fill();

      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(INK);

      doc.text(li.item,                                L + 6,   rowY, { width: 180 });
      doc.text(li.size,                                L + 210, rowY, { width: 40, align: 'center' });
      doc.text(String(li.qty),                         L + 270, rowY, { width: 55, align: 'center' });
      doc.text(`Rs. ${unitPrice.toFixed(2)}`,          L + 355, rowY, { width: 65, align: 'right' });
      doc.text(`Rs. ${lineTotal.toFixed(2)}`,          L + 440, rowY, { width: 65, align: 'right' });

      rowY += 24;
    });

    // Table bottom line
    doc
      .moveTo(L - 2, rowY)
      .lineTo(R + 2, rowY)
      .strokeColor('#D0C9B6')
      .lineWidth(0.75)
      .stroke();

    // ── 6. Totals Breakdown Block (Right-Aligned) ───────────────────────────
    const totalsLabelX = R - 170;
    const totalsValX   = R - 65;
    let totalsY        = rowY + 16;

    function totalsRow(label: string, value: string, bold = false, color = INK) {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .fillColor(INK_MUTED)
        .text(label, totalsLabelX, totalsY, { width: 100, align: 'right' });
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .fillColor(color)
        .text(value, totalsValX, totalsY, { width: 65, align: 'right' });
      totalsY += 18;
    }

    totalsRow('Subtotal', `Rs. ${itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

    if (discount > 0) {
      totalsRow('Discount', `- Rs. ${discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, false, '#B0403A');
    }

    if (delivCharge > 0) {
      totalsRow('Delivery Charge', `Rs. ${delivCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    }

    // Divider line before Grand Total
    doc
      .moveTo(totalsLabelX + 15, totalsY - 2)
      .lineTo(R + 2, totalsY - 2)
      .strokeColor(INK)
      .lineWidth(1)
      .stroke();

    totalsY += 4;
    totalsRow(
      'Grand Total',
      `Rs. ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      true,
      SUCCESS
    );

    // ── 7. Dedicated Payment Information Table ─────────────────────────────
    const paymentTableY = totalsY + 16;
    const pBarHeight    = 20;

    // Payment Table Outer Border Box
    doc
      .rect(L - 2, paymentTableY - 4, R - L + 4, 60)
      .strokeColor('#E2DCC9')
      .lineWidth(1)
      .stroke();

    // Payment Table Header Bar
    doc
      .rect(L - 2, paymentTableY - 4, R - L + 4, pBarHeight)
      .fillColor('#2B62C6')
      .fill();

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#FFFFFF');

    const pColX = {
      status: L + 10,
      mode:   L + 180,
      ref:    L + 340,
    };

    doc.text('PAYMENT STATUS', pColX.status, paymentTableY);
    doc.text('PAYMENT MODE',   pColX.mode,   paymentTableY);
    doc.text('TRANSACTION / REFERENCE ID', pColX.ref, paymentTableY);

    // Payment Values Row
    const pValY = paymentTableY + 24;

    // Status Badge Color
    const statusColor = sale.paymentStatus === 'Paid' ? SUCCESS : sale.paymentStatus === 'Not Paid' ? ERROR : WARNING;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(statusColor)
      .text(sale.paymentStatus || 'Not Paid', pColX.status, pValY);

    const isPaid = sale.paymentStatus === 'Paid';
    const displayMode = isPaid ? ((sale.modeOfPayment && sale.modeOfPayment !== 'N/A') ? sale.modeOfPayment : 'Cash') : 'N/A';
    const displayTxn  = (isPaid && displayMode !== 'Cash' && sale.transactionId && sale.transactionId !== 'N/A') ? sale.transactionId : 'N/A';

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(displayMode, pColX.mode, pValY);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK_MUTED)
      .text(displayTxn, pColX.ref, pValY);

    doc.end();
  });
}
