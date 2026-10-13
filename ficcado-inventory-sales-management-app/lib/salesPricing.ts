/**
 * lib/salesPricing.ts
 *
 * Consolidated pricing and total amount calculation module.
 * Used identically across sale creation, sale update, replacement, and return/refund paths.
 */

export interface PricingCalculationItem {
  unitPrice: number;
  qty: number;
}

export interface PricingCalculationParams {
  items: PricingCalculationItem[] | number; // Array of item prices & quantities, OR subtotal number
  discount?: number;
  deliveryChargeToggle?: boolean;
  deliveryChargeAmount?: number;
  deliveryCharge?: number;
}

export interface PricingBreakdown {
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  grandTotal: number;
}

/**
 * Consolidate sale total amount calculation logic.
 * Formula: Grand Total = Math.max(0, Subtotal - Discount + Delivery Charge)
 */
export function calculateSaleTotalAmount(params: PricingCalculationParams): PricingBreakdown {
  const subtotal = typeof params.items === 'number'
    ? (isNaN(params.items) ? 0 : params.items)
    : params.items.reduce((sum, item) => sum + ((parseFloat(String(item.unitPrice)) || 0) * (parseInt(String(item.qty), 10) || 1)), 0);

  const discount = Math.max(0, parseFloat(String(params.discount || 0)) || 0);

  let deliveryCharge = 0;
  if (params.deliveryCharge !== undefined) {
    deliveryCharge = Math.max(0, parseFloat(String(params.deliveryCharge || 0)) || 0);
  } else if (params.deliveryChargeToggle) {
    deliveryCharge = Math.max(0, parseFloat(String(params.deliveryChargeAmount || 0)) || 0);
  }

  const grandTotal = Math.max(0, subtotal - discount + deliveryCharge);

  return {
    subtotal,
    discount,
    deliveryCharge,
    grandTotal,
  };
}
