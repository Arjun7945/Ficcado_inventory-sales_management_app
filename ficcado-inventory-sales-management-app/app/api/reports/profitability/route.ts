/**
 * app/api/reports/profitability/route.ts
 *
 * GET /api/reports/profitability
 *
 * Query Params:
 *  - timeframe: 'daily' | 'weekly' | 'monthly' | 'custom'
 *  - startDate: 'YYYY-MM-DD'
 *  - endDate:   'YYYY-MM-DD'
 *  - format:    'json' | 'pdf' (default: 'json')
 *
 * Computes (Part 8 B7 Spec):
 *  1. Gross Sales Revenue (Paid Sales)
 *  2. Unpaid Dues / Pending Revenue
 *  3. Cost of Goods Sold (COGS) — using Item Cost Price * sold qty
 *  4. Gross Profit (Gross Revenue - COGS)
 *  5. Operational Expenses — from Expense Management sheet
 *  6. Vendor Payments — from Vendor Payment Log sheet
 *  7. Total Expenses — COGS + Operational Expenses + Vendor Payments
 *  8. Net Profit (Gross Revenue - Total Expenses)
 *  9. Net Margin Percentage
 * 10. Per-Item Profitability Breakdown
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';
import PDFDocument from 'pdfkit';

export const dynamic = 'force-dynamic';

interface ItemCostMap {
  [itemName: string]: { costPrice: number; sellingPrice: number };
}

interface ItemBreakdown {
  itemName:     string;
  quantitySold: number;
  revenue:      number;
  cogs:         number;
  grossProfit:  number;
}

export async function GET(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const adminName = auth.admin?.name || 'Admin';

  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') || 'monthly').toLowerCase();
  const format    = (searchParams.get('format') || 'json').toLowerCase();
  const reqStart  = searchParams.get('startDate') || '';
  const reqEnd    = searchParams.get('endDate') || '';

  // Determine date bounds
  const now = new Date();
  let startISO = '';
  let endISO   = now.toISOString();

  if (timeframe === 'daily') {
    const today = now.toISOString().slice(0, 10);
    startISO = `${today}T00:00:00.000Z`;
    endISO   = `${today}T23:59:59.999Z`;
  } else if (timeframe === 'weekly') {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startISO = startOfWeek.toISOString();
  } else if (timeframe === 'monthly') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startISO = startOfMonth.toISOString();
  } else if (timeframe === 'custom' && reqStart && reqEnd) {
    startISO = `${reqStart}T00:00:00.000Z`;
    endISO   = `${reqEnd}T23:59:59.999Z`;
  }

  try {
    const [salesRows, itemsRows, expenseRows, vendorPaymentRows] = await Promise.all([
      readAllRows('sales').catch(() => []),
      readAllRows('items').catch(() => []),
      readAllRows('expenses').catch(() => []),
      readAllRows('vendor_payments').catch(() => []),
    ]);

    // 1. Build Item Cost Map
    const itemCostMap: ItemCostMap = {};
    if (itemsRows.length > 1) {
      const iMap = buildHeaderMap(itemsRows[0]);
      for (const r of itemsRows.slice(1)) {
        const name = getCellByHeader(r, iMap, 'Item Name');
        const cp   = parseFloat(getCellByHeader(r, iMap, 'Cost Price', '0')) || 0;
        const sp   = parseFloat(getCellByHeader(r, iMap, 'Price of Item', '0')) || 0;
        if (name) {
          itemCostMap[name.toLowerCase()] = { costPrice: cp, sellingPrice: sp };
        }
      }
    }

    // 2. Aggregate Sales & COGS & Discounts
    let paidRevenue       = 0;
    let unpaidDues        = 0;
    let totalCogs         = 0;
    let paidSalesCount    = 0;
    let totalSalesCount   = 0;
    let discountsProvided = 0;
    const itemBreakdownMap: { [key: string]: ItemBreakdown } = {};

    if (salesRows.length > 1) {
      const sMap = buildHeaderMap(salesRows[0]);
      for (const r of salesRows.slice(1)) {
        const createdAt  = getCellByHeader(r, sMap, 'Created At');
        if (startISO && createdAt && (createdAt < startISO || createdAt > endISO)) continue;

        totalSalesCount++;
        const totalAmt   = parseFloat(getCellByHeader(r, sMap, 'Total Amount', '0')) || 0;
        const payStatus  = (getCellByHeader(r, sMap, 'Payment Status') || '').trim().toLowerCase();
        const saleStatus = (getCellByHeader(r, sMap, 'Sale Status') || '').trim().toLowerCase();
        const isPaid     = payStatus === 'paid';
        const isCompleted = saleStatus === 'purchase satisfied and order completed';

        const discountStr = getCellByHeader(r, sMap, 'Discount', '0');
        const discountAmt = parseFloat(discountStr.replace(/[^0-9.]/g, '')) || 0;

        if (isCompleted) {
          discountsProvided += discountAmt;
        }

        if (!isPaid) {
          unpaidDues += totalAmt;
          continue;
        }

        paidRevenue += totalAmt;
        paidSalesCount++;

        // Parse items in this sale
        const itemNamesStr = getCellByHeader(r, sMap, 'Item(s) Name(s)');
        const itemPricesStr= getCellByHeader(r, sMap, 'Item Prices');
        const rawNames     = itemNamesStr.split(',').map((s) => s.trim()).filter(Boolean);

        const itemCounts: { [name: string]: number } = {};
        for (const name of rawNames) {
          itemCounts[name] = (itemCounts[name] || 0) + 1;
        }

        const rawPrices = itemPricesStr ? itemPricesStr.split(',').map((s) => parseFloat(s.trim()) || 0) : [];

        for (const [name, qty] of Object.entries(itemCounts)) {
          const lowerName = name.toLowerCase();
          const costInfo  = itemCostMap[lowerName] || { costPrice: 0, sellingPrice: 0 };
          const unitCost  = costInfo.costPrice;
          const lineCogs  = unitCost * qty;
          const unitPrice = costInfo.sellingPrice || (rawPrices[0] ?? 0);
          const lineRev   = unitPrice * qty;
          const lineProfit= lineRev - lineCogs;

          totalCogs += lineCogs;

          if (!itemBreakdownMap[lowerName]) {
            itemBreakdownMap[lowerName] = {
              itemName:     name,
              quantitySold: 0,
              revenue:      0,
              cogs:         0,
              grossProfit:  0,
            };
          }
          itemBreakdownMap[lowerName].quantitySold += qty;
          itemBreakdownMap[lowerName].revenue      += lineRev;
          itemBreakdownMap[lowerName].cogs         += lineCogs;
          itemBreakdownMap[lowerName].grossProfit  += lineProfit;
        }
      }
    }

    // 3. Aggregate Operational Expenses (from Expense Management)
    let operationalExpenses = 0;
    if (expenseRows.length > 1) {
      const eMap = buildHeaderMap(expenseRows[0]);
      for (const r of expenseRows.slice(1)) {
        const dateOfExpense = getCellByHeader(r, eMap, 'Date of Expense');
        const createdAt     = getCellByHeader(r, eMap, 'Created At');
        const dateCheck     = dateOfExpense ? `${dateOfExpense}T00:00:00.000Z` : createdAt;
        if (startISO && dateCheck && (dateCheck < startISO || dateCheck > endISO)) continue;

        const amt = parseFloat(getCellByHeader(r, eMap, 'Amount', '0')) || 0;
        operationalExpenses += amt;
      }
    }

    // 4. Aggregate Vendor Payments (from Vendor Payment Log)
    let vendorPayments = 0;
    if (vendorPaymentRows.length > 1) {
      const vpMap = buildHeaderMap(vendorPaymentRows[0]);
      for (const r of vendorPaymentRows.slice(1)) {
        const payDate   = getCellByHeader(r, vpMap, 'Date');
        const createdAt = getCellByHeader(r, vpMap, 'Created At');
        const dateCheck = payDate ? `${payDate}T00:00:00.000Z` : createdAt;
        if (startISO && dateCheck && (dateCheck < startISO || dateCheck > endISO)) continue;

        const amt = parseFloat(getCellByHeader(r, vpMap, 'Amount', '0')) || 0;
        vendorPayments += amt;
      }
    }

    // 5. Final Financial Calculations (Part 8 B7 Spec Formula)
    const grossProfit    = paidRevenue - totalCogs;
    const totalExpenses  = totalCogs + operationalExpenses + vendorPayments;
    const netProfit      = paidRevenue - totalExpenses;
    const netMarginPct   = paidRevenue > 0 ? (netProfit / paidRevenue) * 100 : 0;
    const grossMarginPct = paidRevenue > 0 ? (grossProfit / paidRevenue) * 100 : 0;

    const breakdownList  = Object.values(itemBreakdownMap).sort((a, b) => b.revenue - a.revenue);

    const reportData = {
      timeframe,
      period: {
        startDate: startISO.slice(0, 10),
        endDate:   endISO.slice(0, 10),
      },
      summary: {
        paidRevenue,
        unpaidDues,
        totalSalesCount,
        paidSalesCount,
        discountsProvided,
        cogs: totalCogs,
        grossProfit,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        operationalExpenses,
        vendorPayments,
        totalExpenses,
        netProfit,
        netMarginPct: Math.round(netMarginPct * 10) / 10,
      },
      itemBreakdown: breakdownList,
    };

    if (format === 'json') {
      return Response.json(reportData);
    }

    // ── Stream Executive PDF Report via PDFKit ───────────────────────────────
    const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    const chunks: Uint8Array[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    const brandBlue = '#2B62C6';
    const darkInk   = '#22261E';
    const mutedInk  = '#6B6A5E';
    const successGreen = '#2F7D4F';
    const errorRed  = '#B0403A';
    const cardBg    = '#F8FAFC';
    const borderCol = '#E2E8F0';

    // 1. Top Decorative Brand Bar
    doc.rect(0, 0, 595.28, 10).fill(brandBlue);

    // 2. Executive Header Banner
    let currentY = 32;
    doc.fillColor(brandBlue).fontSize(24).font('Helvetica-Bold').text('F I C C A D O', 36, currentY, { characterSpacing: 4 });
    doc.fillColor(mutedInk).fontSize(9).font('Helvetica-Bold').text('EXECUTIVE FINANCIAL PROFITABILITY & MARGIN ANALYSIS REPORT', 36, currentY + 28);

    // Right-aligned report metadata block
    const formattedDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.fillColor(darkInk).fontSize(8.5).font('Helvetica-Bold').text(`REPORT ID: FICCADO-PRF-${Date.now().toString().slice(-6)}`, 340, currentY, { align: 'right' });
    doc.fillColor(mutedInk).fontSize(8).font('Helvetica').text(`Generated: ${formattedDate} | Admin: ${adminName}`, 340, currentY + 14, { align: 'right' });
    doc.fillColor(brandBlue).fontSize(8.5).font('Helvetica-Bold').text(`Timeframe: ${timeframe.toUpperCase()} (${reportData.period.startDate} to ${reportData.period.endDate})`, 340, currentY + 28, { align: 'right' });

    currentY += 48;
    doc.moveTo(36, currentY).lineTo(559.28, currentY).strokeColor(borderCol).lineWidth(1).stroke();
    currentY += 14;

    // 3. Hero Net Profit / Loss Banner Box
    const heroIsProfitable = netProfit >= 0;
    const heroBg    = heroIsProfitable ? '#F0FDF4' : '#FEF2F2';
    const heroBorder= heroIsProfitable ? successGreen : errorRed;
    const heroTextCol= heroIsProfitable ? successGreen : errorRed;

    doc.roundedRect(36, currentY, 523.28, 56, 6).fillAndStroke(heroBg, heroBorder);
    
    doc.fillColor(heroTextCol).fontSize(10).font('Helvetica-Bold').text('NET PROFIT / LOSS (AFTER ALL EXPENSES)', 52, currentY + 12);
    const netFormatted = `Rs. ${netProfit.toLocaleString('en-IN')}`;
    doc.fillColor(heroTextCol).fontSize(20).font('Helvetica-Bold').text(netFormatted, 52, currentY + 26);

    // Hero Margin Badge
    const marginText = `NET MARGIN: ${reportData.summary.netMarginPct}%`;
    doc.roundedRect(380, currentY + 14, 160, 28, 4).fill(heroTextCol);
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold').text(marginText, 380, currentY + 23, { width: 160, align: 'center' });

    currentY += 72;

    // 4. Financial KPI Summary Grid (6 Distinct Sub-Cards)
    doc.fillColor(darkInk).fontSize(11).font('Helvetica-Bold').text('Financial Breakdown & Operational Metrics', 36, currentY);
    currentY += 16;

    const cardW = 166;
    const cardH = 48;
    const gapX  = 12;
    const gapY  = 10;

    const kpiCards = [
      { label: 'Gross Revenue (Paid)', val: `Rs. ${paidRevenue.toLocaleString('en-IN')}`, color: brandBlue, sub: `${paidSalesCount} order(s)` },
      { label: 'Cost of Goods (COGS)', val: `Rs. ${totalCogs.toLocaleString('en-IN')}`, color: darkInk, sub: 'Item cost × qty' },
      { label: 'Gross Profit', val: `Rs. ${grossProfit.toLocaleString('en-IN')}`, color: grossProfit >= 0 ? successGreen : errorRed, sub: `Margin: ${reportData.summary.grossMarginPct}%` },
      { label: 'Operational Expenses', val: `Rs. ${operationalExpenses.toLocaleString('en-IN')}`, color: errorRed, sub: 'Expense Management' },
      { label: 'Vendor Payments', val: `Rs. ${vendorPayments.toLocaleString('en-IN')}`, color: errorRed, sub: 'Vendor Payment Log' },
      { label: 'Total Expenses', val: `Rs. ${totalExpenses.toLocaleString('en-IN')}`, color: errorRed, sub: 'COGS + Ops + Vendors' },
    ];

    for (let idx = 0; idx < kpiCards.length; idx++) {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cX  = 36 + col * (cardW + gapX);
      const cY  = currentY + row * (cardH + gapY);

      doc.roundedRect(cX, cY, cardW, cardH, 4).fillAndStroke(cardBg, borderCol);
      doc.fillColor(mutedInk).fontSize(7.5).font('Helvetica-Bold').text(kpiCards[idx].label.toUpperCase(), cX + 8, cY + 8);
      doc.fillColor(kpiCards[idx].color).fontSize(12).font('Helvetica-Bold').text(kpiCards[idx].val, cX + 8, cY + 20);
      doc.fillColor(mutedInk).fontSize(7).font('Helvetica').text(kpiCards[idx].sub, cX + 8, cY + 35);
    }

    currentY += 2 * (cardH + gapY) + 16;

    // 5. Product-Level Sales & Profitability Breakdown Table
    doc.fillColor(darkInk).fontSize(11).font('Helvetica-Bold').text('Product-Level Profitability Breakdown', 36, currentY);
    currentY += 16;

    // Table Headers
    const colX = [36, 210, 275, 350, 425, 500];
    const colW = [170, 60, 70, 70, 70, 59];

    doc.rect(36, currentY, 523.28, 20).fill(brandBlue);
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
    doc.text('Product Name', colX[0] + 8, currentY + 5);
    doc.text('Qty Sold', colX[1], currentY + 5, { width: colW[1], align: 'center' });
    doc.text('Revenue (Rs)', colX[2], currentY + 5, { width: colW[2], align: 'right' });
    doc.text('COGS (Rs)', colX[3], currentY + 5, { width: colW[3], align: 'right' });
    doc.text('Profit (Rs)', colX[4], currentY + 5, { width: colW[4], align: 'right' });
    doc.text('Margin', colX[5], currentY + 5, { width: colW[5], align: 'right' });

    currentY += 20;

    let totQty = 0;
    let totRev = 0;
    let totCogs= 0;
    let totProf= 0;

    doc.font('Helvetica').fontSize(8.5);

    if (breakdownList.length === 0) {
      doc.rect(36, currentY, 523.28, 24).fill('#FFFFFF').stroke(borderCol);
      doc.fillColor(mutedInk).text('No paid product sales recorded for this timeframe.', 36, currentY + 7, { width: 523.28, align: 'center' });
      currentY += 24;
    } else {
      let rIdx = 0;
      for (const item of breakdownList) {
        if (currentY > 730) {
          doc.addPage();
          doc.rect(0, 0, 595.28, 10).fill(brandBlue);
          currentY = 40;
          doc.rect(36, currentY, 523.28, 20).fill(brandBlue);
          doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
          doc.text('Product Name', colX[0] + 8, currentY + 5);
          doc.text('Qty Sold', colX[1], currentY + 5, { width: colW[1], align: 'center' });
          doc.text('Revenue (Rs)', colX[2], currentY + 5, { width: colW[2], align: 'right' });
          doc.text('COGS (Rs)', colX[3], currentY + 5, { width: colW[3], align: 'right' });
          doc.text('Profit (Rs)', colX[4], currentY + 5, { width: colW[4], align: 'right' });
          doc.text('Margin', colX[5], currentY + 5, { width: colW[5], align: 'right' });
          currentY += 20;
        }

        const bgRow = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        doc.rect(36, currentY, 523.28, 18).fill(bgRow);

        totQty  += item.quantitySold;
        totRev  += item.revenue;
        totCogs += item.cogs;
        totProf += item.grossProfit;

        const margin = item.revenue > 0 ? Math.round((item.grossProfit / item.revenue) * 1000) / 10 : 0;
        const profColor = item.grossProfit >= 0 ? successGreen : errorRed;

        doc.fillColor(darkInk).text(item.itemName, colX[0] + 8, currentY + 4, { width: 160, height: 12 });
        doc.text(String(item.quantitySold), colX[1], currentY + 4, { width: colW[1], align: 'center' });
        doc.text(item.revenue.toLocaleString('en-IN'), colX[2], currentY + 4, { width: colW[2], align: 'right' });
        doc.text(item.cogs.toLocaleString('en-IN'), colX[3], currentY + 4, { width: colW[3], align: 'right' });
        doc.fillColor(profColor).text(item.grossProfit.toLocaleString('en-IN'), colX[4], currentY + 4, { width: colW[4], align: 'right' });
        doc.text(`${margin}%`, colX[5], currentY + 4, { width: colW[5], align: 'right' });

        currentY += 18;
        rIdx++;
      }

      // Summary Totals Footer Row
      doc.rect(36, currentY, 523.28, 22).fill('#E2E8F0');
      doc.fillColor(darkInk).font('Helvetica-Bold').fontSize(8.5);
      doc.text('TOTALS SUMMARY', colX[0] + 8, currentY + 6);
      doc.text(String(totQty), colX[1], currentY + 6, { width: colW[1], align: 'center' });
      doc.text(`Rs. ${totRev.toLocaleString('en-IN')}`, colX[2], currentY + 6, { width: colW[2], align: 'right' });
      doc.text(`Rs. ${totCogs.toLocaleString('en-IN')}`, colX[3], currentY + 6, { width: colW[3], align: 'right' });
      doc.fillColor(totProf >= 0 ? successGreen : errorRed).text(`Rs. ${totProf.toLocaleString('en-IN')}`, colX[4], currentY + 6, { width: colW[4], align: 'right' });
      const overallGrossMargin = totRev > 0 ? Math.round((totProf / totRev) * 1000) / 10 : 0;
      doc.text(`${overallGrossMargin}%`, colX[5], currentY + 6, { width: colW[5], align: 'right' });

      currentY += 22;
    }

    // 6. Page Numbers & Confidentiality Footer (Applied on every page)
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      doc.moveTo(36, 800).lineTo(559.28, 800).strokeColor(borderCol).lineWidth(0.5).stroke();
      doc.fillColor(mutedInk).fontSize(8).font('Helvetica')
         .text('Ficcado Inventory & Sales Management System • Confidential Financial Report', 36, 806);
      doc.text(`Page ${i + 1} of ${pageRange.count}`, 340, 806, { align: 'right' });
    }

    doc.end();

    await new Promise<void>((resolve) => doc.on('end', () => resolve()));

    const pdfBuffer = Buffer.concat(chunks);
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ficcado_profitability_${timeframe}.pdf"`,
      },
    });
  } catch (err: any) {
    return Response.json({ error: 'Failed to generate profitability report.', detail: err?.message }, { status: 500 });
  }
}
