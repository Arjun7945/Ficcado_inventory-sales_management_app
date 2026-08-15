/**
 * lib/google/moduleRegistry.ts
 *
 * Central source of truth for all module registrations in the Ficcado application.
 * Dynamic module checks and sheet initialization derive directly from this registry.
 */

export interface ModuleDefinition {
  key: string;
  displayName: string;
  tabName: string;
  headers: string[];
}

export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  items: {
    key: 'items',
    displayName: 'Items Management Sheet',
    tabName: 'Items Management',
    headers: ['S.No', 'Item Name', 'Item Type', 'Price of Item', 'Available Sizes', 'Created By', 'Created At', 'Updated By', 'Updated At', 'Current Status'],
  },
  inventory: {
    key: 'inventory',
    displayName: 'Inventory Management Sheet',
    tabName: 'Inventory Management',
    headers: ['S.No', 'Item Name', 'Size', 'Total Quantity Available', 'Added By (Admin)', 'Updated At', 'Updated By (Admin)', 'Created At'],
  },
  warehouse: {
    key: 'warehouse',
    displayName: 'Warehouse Management Sheet',
    tabName: 'Warehouse Management',
    headers: ['S.No', 'Warehouse Location', 'Handler Name', 'Item Name', 'Size', 'Quantity', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  },
  sales: {
    key: 'sales',
    displayName: 'Sales Management Sheet',
    tabName: 'Sales Management',
    headers: ['S.No', 'Invoice Number', 'Sale Status', 'Customer Name', 'Customer Phone Number', 'Customer Address', 'Total Number of Items Purchased', 'Item(s) Name(s)', 'Size(s) Chosen', 'Item Prices', 'Total Amount', 'Payment Status', 'Mode of Payment', 'Transaction ID', 'Created At', 'Created By (Admin)', 'Updated At', 'Updated By', 'Version', 'Delivery Status', 'Delivery Charge Toggle', 'Delivery Charge Amount', 'Fulfilment Request Status', 'Fulfilment Source', 'Sale Closed By', 'Discount', 'Customer Email'],
  },
  replacement: {
    key: 'replacement',
    displayName: 'Replacement Management Sheet',
    tabName: 'Replacement Management',
    headers: ['S.No', 'Invoice Number', 'Total Number of Items Purchased', 'Last Purchased Item(s)', 'Last Purchased Item(s) Size', 'New Item(s)', 'New Item(s) Size', 'Invoice Status', 'Disposition of Old Items', 'Restock Destination', 'Removed Item from Last Purchase', 'Sizes of Removed Item from Last Purchase', 'Number of Removed Item from Last Purchase', 'New Final Items Selected', 'New Final Items Sizes', 'Number of New Final Items', 'New Final Items Prices Each', 'New Final Items Total Amount', 'New Stock Source', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version', 'New Delivery Charge', 'New Discount'],
  },
  return_refund: {
    key: 'return_refund',
    displayName: 'Return/Refund Management Sheet',
    tabName: 'Return Refund Management',
    headers: ['S.No', 'Invoice Number', 'Item Verification Status', 'Refund Status', 'Refund Amount', 'Refund Completed Date & Time', 'Transaction ID', 'Mode of Refund', 'Disposition of Returned Items', 'Restock Destination', 'Returned Item(s)', 'Returned Item Size(s)', 'Returned Item Quantity(ies)', 'Price Charged (Returned Items)', 'New Final Items Selected', 'New Final Items Sizes', 'Number of New Final Items', 'New Final Items Prices Each', 'New Discount Applied', 'New Final Items Total Amount', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version', 'Customer Name', 'Customer Phone Number', 'Customer Address', 'Customer Email', 'Original Purchased Items', 'Original Item Sizes', 'Original Item Quantities', 'Original Item Prices', 'Original Discount', 'Original Delivery Charge', 'Original Total Amount', 'Original Sale Created At', 'Original Sale Created By', 'Reason for Return', 'Closed By'],
  },
  admin_info: {
    key: 'admin_info',
    displayName: 'Admin Information Sheet',
    tabName: 'Admin Information',
    headers: ['S.No', 'Admin Name', 'Phone Number', 'Email ID', 'Notifications', 'Password Hash', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  },
  keep_notes: {
    key: 'keep_notes',
    displayName: 'Keep Notes Sheet',
    tabName: 'Keep Notes',
    headers: ['S.No', 'Note Content', 'Created By (Admin)', 'Created At', 'Updated By', 'Updated At'],
  },
  activity_log: {
    key: 'activity_log',
    displayName: 'Activity Log Sheet',
    tabName: 'Activity Log',
    headers: ['S.No', 'Admin Name', 'Action', 'Module', 'Module Key', 'Record ID', 'Timestamp', 'Message'],
  },
  damaged_products: {
    key: 'damaged_products',
    displayName: 'Damaged Products Management Sheet',
    tabName: 'Damaged Products',
    headers: ['S.No', 'Invoice Number', 'Item Name', 'Size', 'Quantity', 'Customer Name', 'Reason/Notes', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  },
  inventory_history: {
    key: 'inventory_history',
    displayName: 'Inventory History Tracker Sheet',
    tabName: 'Inventory History',
    headers: ['S.No', 'Item Name', 'Size', 'Quantity Change', 'Affected Sheet', 'Handler (if Warehouse)', 'Transaction Type', 'Related Invoice Number', 'Resulting Balance', 'Created At', 'Created By', 'Notes'],
  },
  customer_info: {
    key: 'customer_info',
    displayName: 'Customer Information Management Sheet',
    tabName: 'Customer Information',
    headers: ['S.No', 'Customer Name', 'Phone Number', 'Address', 'Email ID', 'Total Orders Placed', 'Invoice Numbers', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  },
  sales_log: {
    key: 'sales_log',
    displayName: 'Sales Log Audit Sheet',
    tabName: 'Sales Log',
    headers: ['S.No', 'Module', 'Operation', 'Related Invoice Number', 'Log Message', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  },
  sales_search_index: {
    key: 'sales_search_index',
    displayName: 'Sales Search Index Sheet',
    tabName: 'Sales Search Index',
    headers: ['searchKey', 'rowIndex', 'moduleKey'],
  },
};

/** Get array of all registered module definitions. */
export function getRegisteredModules(): ModuleDefinition[] {
  return Object.values(MODULE_REGISTRY);
}

/** Get list of expected tab names derived dynamically from the live module registry. */
export function getRequiredTabNames(): string[] {
  return getRegisteredModules().map((m) => m.tabName);
}

/** Get dictionary of MODULE_HEADERS keyed by module key. */
export function getModuleHeadersMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const def of getRegisteredModules()) {
    map[def.key] = def.headers;
  }
  return map;
}

/** Get dictionary of MODULE_DISPLAY_NAMES keyed by module key. */
export function getModuleDisplayNamesMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of getRegisteredModules()) {
    map[def.key] = def.displayName;
  }
  return map;
}

/** Get dictionary of MODULE_TAB_NAMES keyed by module key. */
export function getModuleTabNamesMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of getRegisteredModules()) {
    map[def.key] = def.tabName;
  }
  return map;
}
