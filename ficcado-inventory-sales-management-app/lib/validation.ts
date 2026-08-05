/**
 * lib/validation.ts
 *
 * Shared form validation layer (Phase 8a).
 *
 * Every form in the app uses these schema definitions.
 * Every required field and format constraint produces a SPECIFIC, field-level
 * message — never a generic "Invalid input."
 *
 * Rules per DESIGN.md Section 3.1:
 *  - Be specific, not generic
 *  - Name the actual cause when known
 *  - No stack traces or raw codes in UI messages
 */

import { z } from 'zod';

// ─── Reusable field validators ───────────────────────────────────────────────

const phoneNumber = z
  .string()
  .regex(/^\d{10}$/, 'Enter a 10-digit phone number');

const emailAddress = z
  .string()
  .email('Enter a valid email address');

const requiredString = (fieldName: string) =>
  z.string().min(1, `${fieldName} is required`);

const positiveNumber = (fieldName: string) =>
  z.coerce
    .number()
    .min(0, `${fieldName} must be 0 or greater`);

// ─── Module schemas ───────────────────────────────────────────────────────────

/** Items Management */
export const ItemSchema = z.object({
  itemName:       requiredString('Item name'),
  itemType:       requiredString('Item type'),
  priceOfItem:    positiveNumber('Price'),
  availableSizes: z.array(z.enum(['XS', 'S', 'M', 'L', 'XL'] as const)).min(1, 'Select at least one size'),
  currentStatus:  z.enum(['In Stock', 'Out of Stock'] as const, 'Select a valid status'),
});
export type ItemInput = z.infer<typeof ItemSchema>;

/** Inventory Management */
export const InventorySchema = z.object({
  itemName:               requiredString('Item name'),
  size:                   z.enum(['XS', 'S', 'M', 'L', 'XL'] as const, 'Select a valid size'),
  totalQuantityAvailable: positiveNumber('Total quantity'),
});
export type InventoryInput = z.infer<typeof InventorySchema>;

/** Warehouse Management */
export const WarehouseItemSizeSchema = z.object({
  size:     z.enum(['XS', 'S', 'M', 'L', 'XL'] as const),
  quantity: positiveNumber('Quantity'),
});

export const WarehouseItemSchema = z.object({
  itemName: requiredString('Item name'),
  sizes:    z.array(WarehouseItemSizeSchema).min(1, 'Enter at least one size quantity'),
});

export const WarehouseSchema = z.object({
  warehouseLocation: requiredString('Warehouse location'),
  handlerName:       requiredString('Handler name'),
  items:             z.array(WarehouseItemSchema).min(1, 'Select at least one item'),
});
export type WarehouseInput = z.infer<typeof WarehouseSchema>;

/** Sales Management */
export const SalesSchema = z.object({
  customerName:            requiredString('Customer name'),
  customerPhoneNumber:     z.string().min(1, 'Customer phone number is required'),
  customerAddress:         requiredString('Customer address'),
  totalNumberOfItems:      positiveNumber('Total number of items'),
  itemNames:               z.union([z.array(z.string()).min(1), z.string().min(1)]),
  sizesChosen:             z.union([z.array(z.string()).min(1), z.string().min(1)]),
  items:                   z.array(z.object({
                             itemName: z.string(),
                             size: z.string(),
                             qty: z.coerce.number(),
                           })).optional(),
  totalAmount:             positiveNumber('Total amount'),
  paymentStatus:           z.string().default('Paid'),
  modeOfPayment:           z.string().optional().default('N/A'),
  transactionId:           z.string().optional().default('N/A'),
  saleStatus:              z.string().default('Purchase Satisfied'),
  deliveryStatus:          z.string().default('Packed & Ready for Shipment'),
  deliveryChargeToggle:    z.boolean().default(false),
  deliveryChargeAmount:    z.coerce.number().min(0).default(0),
  fulfilmentStatus:        z.string().default('Normal'),
  fulfilmentSource:        requiredString('Fulfilment source'),
}).refine(
  (data) => {
    if (data.paymentStatus === 'Paid' && data.modeOfPayment !== 'Cash' && data.modeOfPayment !== 'N/A' && !data.transactionId) {
      return false;
    }
    return true;
  },
  {
    message: 'Transaction ID is required for digital payments',
    path: ['transactionId'],
  }
).refine(
  (data) => {
    if (data.deliveryChargeToggle && data.deliveryChargeAmount <= 0) {
      return false;
    }
    return true;
  },
  {
    message: 'Delivery charge amount must be greater than 0 when delivery charge is enabled',
    path: ['deliveryChargeAmount'],
  }
);
export type SalesInput = z.infer<typeof SalesSchema>;

/** Replacement Management */
export const ReplacementSchema = z.object({
  invoiceNumber:           requiredString('Invoice number'),
  totalNumberOfItems:      positiveNumber('Total number of items'),
  lastPurchasedItems:      z.array(z.string()).min(1, 'At least one item required'),
  lastPurchasedItemsSizes: z.array(z.string()).min(1, 'At least one size required'),
  newItems:                z.array(z.string()).min(1, 'At least one new item required'),
  newItemsSizes:           z.array(z.string()).min(1, 'At least one new size required'),
  invoiceStatus:           z.enum([
                             'Replacement Approved',
                             'Replacement Dispatched',
                             'Replacement Received',
                             'Satisfied / Completed Order'
                           ] as const).default('Replacement Approved'),
  dispositionOfOldItems:   z.enum(['Returned to Inventory', 'Sent to Damaged Products'] as const).optional(),
  restockDestination:      z.string().optional(),
});
export type ReplacementInput = z.infer<typeof ReplacementSchema>;

/** Return/Refund Management */
export const ReturnRefundSchema = z.object({
  invoiceNumber:              requiredString('Invoice number'),
  itemVerificationStatus:     z.enum(['No Damage', 'Damage Found on Returned Item(s)'] as const, 'Select a valid verification status'),
  refundStatus:               requiredString('Refund status'),
  refundAmount:               positiveNumber('Refund amount'),
  refundCompletedAt:          z.string().optional(),
  transactionId:              z.string().optional(),
  modeOfRefund:               z.enum(['Cash', 'UPI', 'Card', 'Bank Transfer'] as const, 'Select a valid refund mode'),
  dispositionOfReturnedItems: z.enum(['Returned to Inventory', 'Sent to Damaged Products'] as const).optional(),
  restockDestination:         z.string().optional(),
});
export type ReturnRefundInput = z.infer<typeof ReturnRefundSchema>;

/** Damaged Products Management */
export const DamagedProductSchema = z.object({
  invoiceNumber: z.string().optional(),
  itemName:      requiredString('Item name'),
  size:          z.enum(['XS', 'S', 'M', 'L', 'XL'] as const, 'Select a valid size'),
  quantity:      positiveNumber('Quantity'),
  customerName:  z.string().optional(),
  reasonNotes:   z.string().optional(),
});
export type DamagedProductInput = z.infer<typeof DamagedProductSchema>;

/** Inventory History Tracker */
export const InventoryHistorySchema = z.object({
  itemName:             requiredString('Item name'),
  size:                 z.enum(['XS', 'S', 'M', 'L', 'XL'] as const),
  quantityChange:       z.coerce.number(),
  affectedSheet:        z.enum(['Inventory', 'Warehouse'] as const),
  handler:              z.string().optional(),
  transactionType:      z.enum([
                          'Sale Deduction',
                          'Replacement — Old Item Restock',
                          'Replacement — New Item Deduction',
                          'Refund Restock',
                          'Warehouse Allocation',
                          'Warehouse Deallocation',
                          'Damaged Disposal',
                          'Manual Adjustment'
                        ] as const),
  relatedInvoiceNumber: z.string().optional(),
  resultingBalance:     z.coerce.number(),
  notes:                z.string().optional(),
});
export type InventoryHistoryInput = z.infer<typeof InventoryHistorySchema>;

/** Admin Profile / Create Admin */
export const AdminSchema = z.object({
  adminName:     requiredString('Admin name'),
  phoneNumber:   phoneNumber,
  emailId:       emailAddress,
  notifications: z.enum(['Enabled', 'Disabled']).default('Enabled'),
  password:      z.string().min(8, 'Password must be at least 8 characters').optional(),
});
export type AdminInput = z.infer<typeof AdminSchema>;

/** Login */
export const LoginSchema = z.object({
  username: requiredString('Username or email'),
  password: requiredString('Password'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** Superadmin claim */
export const ClaimSchema = z.object({
  username:  z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be 50 characters or fewer')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscores, dots, and hyphens'),
  password:  z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  claimCode: z.string().optional(),
});
export type ClaimInput = z.infer<typeof ClaimSchema>;

/** Sheet Configuration */
export const SheetConfigSchema = z.object({
  moduleKey:     requiredString('Module key'),
  displayName:   requiredString('Display name'),
  spreadsheetId: z.string()
    .min(20, 'Enter a valid Google Spreadsheet ID (at least 20 characters)')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Spreadsheet ID contains invalid characters'),
  tabName: requiredString('Tab name'),
});
export type SheetConfigInput = z.infer<typeof SheetConfigSchema>;

/** Keep Notes */
export const NoteSchema = z.object({
  noteContent: z.string().min(1, 'Note content is required').max(5000, 'Note must be 5000 characters or fewer'),
});
export type NoteInput = z.infer<typeof NoteSchema>;

// ─── Validation helper ────────────────────────────────────────────────────────

export interface ValidationResult<T> {
  valid:  boolean;
  data?:  T;
  errors: Record<string, string>;
}

/**
 * Validate data against a Zod schema.
 * Returns { valid: true, data } on success, or { valid: false, errors } on failure.
 * Errors are keyed by field name with specific, user-friendly messages.
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true, data: result.data, errors: {} };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }

  return { valid: false, errors };
}
