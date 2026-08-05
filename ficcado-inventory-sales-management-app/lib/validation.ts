/**
 * lib/validation.ts
 *
 * Shared form validation layer.
 * Every form in the application uses these schema definitions.
 * Every required field and constraint produces a SPECIFIC, field-level user message.
 */

import { z } from 'zod';

// ─── Reusable field validators ───────────────────────────────────────────────

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
  availableSizes: z.array(z.enum(['XS', 'S', 'M', 'L', 'XL'] as const)).min(1, 'Select at least one size variant'),
  currentStatus:  z.string().default('In Stock'),
});
export type ItemInput = z.infer<typeof ItemSchema>;

/** Inventory Management */
export const InventorySchema = z.object({
  itemName:               requiredString('Item name'),
  size:                   z.enum(['XS', 'S', 'M', 'L', 'XL'] as const, 'Select a valid size variant (XS, S, M, L, XL)'),
  totalQuantityAvailable: positiveNumber('Total quantity'),
});
export type InventoryInput = z.infer<typeof InventorySchema>;

/** Warehouse Management */
export const WarehouseFlatItemSchema = z.object({
  itemName: requiredString('Item name'),
  size:     z.string().min(1, 'Size is required'),
  qty:      z.coerce.number().min(1, 'Quantity must be at least 1 piece'),
});

export const WarehouseItemSizeSchema = z.object({
  size:     z.string().min(1, 'Size is required'),
  quantity: positiveNumber('Quantity'),
});

export const WarehouseNestedItemSchema = z.object({
  itemName: requiredString('Item name'),
  sizes:    z.array(WarehouseItemSizeSchema).min(1, 'Enter at least one size quantity'),
});

export const WarehouseSchema = z.object({
  warehouseLocation: requiredString('Warehouse location'),
  handlerName:       requiredString('Handler name'),
  items:             z.array(z.union([WarehouseFlatItemSchema, WarehouseNestedItemSchema])).min(1, 'Select at least one item and enter a quantity'),
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
                             size:     z.string(),
                             qty:      z.coerce.number(),
                           })).optional(),
  totalAmount:             positiveNumber('Total amount'),
  paymentStatus:           z.string().default('Paid'),
  modeOfPayment:           z.string().optional().default('N/A'),
  transactionId:           z.string().optional().default('N/A'),
  saleStatus:              z.string().default('Not Provided / Order Only Placed'),
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
  lastPurchasedItems:      z.union([z.array(z.string()), z.string()]),
  lastPurchasedItemsSizes: z.union([z.array(z.string()), z.string()]),
  newItems:                z.union([z.array(z.string()), z.string()]),
  newItemsSizes:           z.union([z.array(z.string()), z.string()]),
  invoiceStatus:           z.string().default('Replacement Approved'),
  dispositionOfOldItems:   z.string().optional(),
  restockDestination:      z.string().optional(),
});
export type ReplacementInput = z.infer<typeof ReplacementSchema>;

/** Return/Refund Management */
export const ReturnRefundSchema = z.object({
  invoiceNumber:              requiredString('Invoice number'),
  itemVerificationStatus:     z.string().default('No Damage'),
  refundStatus:               requiredString('Refund status'),
  refundAmount:               positiveNumber('Refund amount'),
  refundCompletedAt:          z.string().optional(),
  transactionId:              z.string().optional(),
  modeOfRefund:               z.string().optional(),
  dispositionOfReturnedItems: z.string().optional(),
  restockDestination:         z.string().optional(),
});
export type ReturnRefundInput = z.infer<typeof ReturnRefundSchema>;

/** Damaged Products Management */
export const DamagedProductSchema = z.object({
  invoiceNumber: z.string().optional(),
  itemName:      requiredString('Item name'),
  size:          z.string().min(1, 'Select a valid size'),
  quantity:      positiveNumber('Quantity'),
  customerName:  z.string().optional(),
  reasonNotes:   z.string().optional(),
});
export type DamagedProductInput = z.infer<typeof DamagedProductSchema>;

/** Inventory History Tracker */
export const InventoryHistorySchema = z.object({
  itemName:             requiredString('Item name'),
  size:                 z.string().min(1, 'Size is required'),
  quantityChange:       z.coerce.number(),
  affectedSheet:        z.string(),
  handler:              z.string().optional(),
  transactionType:      z.string(),
  relatedInvoiceNumber: z.string().optional(),
  resultingBalance:     z.coerce.number(),
  notes:                z.string().optional(),
});
export type InventoryHistoryInput = z.infer<typeof InventoryHistorySchema>;

/** Admin Profile / Create Admin */
export const AdminSchema = z.object({
  adminName:     requiredString('Admin name'),
  phoneNumber:   z.string().min(1, 'Phone number is required'),
  emailId:       z.string().email('Enter a valid email address'),
  notifications: z.string().default('Enabled'),
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
  username:  z.string().min(3, 'Username must be at least 3 characters'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  claimCode: z.string().optional(),
});
export type ClaimInput = z.infer<typeof ClaimSchema>;

/** Sheet Configuration */
export const SheetConfigSchema = z.object({
  moduleKey:     requiredString('Module key'),
  displayName:   requiredString('Display name'),
  spreadsheetId: z.string().min(15, 'Enter a valid Google Spreadsheet ID'),
  tabName:       requiredString('Tab name'),
});
export type SheetConfigInput = z.infer<typeof SheetConfigSchema>;

/** Keep Notes */
export const NoteSchema = z.object({
  noteContent: z.string().min(1, 'Note content is required').max(5000, 'Note must be 5000 characters or fewer'),
});
export type NoteInput = z.infer<typeof NoteSchema>;

// ─── Validation helper ────────────────────────────────────────────────────────

export interface ValidationResult<T> {
  valid:        boolean;
  data?:        T;
  errors:       Record<string, string>;
  errorMessage: string;
}

/**
 * Validate data against a Zod schema.
 * Returns { valid: true, data } on success, or { valid: false, errors, errorMessage } on failure.
 * Errors are keyed by field name with specific, user-friendly messages.
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true, data: result.data, errors: {}, errorMessage: '' };
  }

  const errors: Record<string, string> = {};
  const messages: string[] = [];

  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!errors[path]) {
      errors[path] = issue.message;
      if (issue.message && !messages.includes(issue.message)) {
        messages.push(issue.message);
      }
    }
  }

  const errorMessage = messages.length > 0
    ? messages.join('. ')
    : 'Validation failed. Please check the required fields.';

  return { valid: false, errors, errorMessage };
}
