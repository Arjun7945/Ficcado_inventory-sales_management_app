-- ==============================================================================
-- Ficcado Inventory & Sales Management App - CRM Database & Spreadsheet Schema
-- ==============================================================================
-- This SQL schema defines all 17 CRM Spreadsheet Tabs as relational SQL tables,
-- alongside the system search index table.
--
-- SPECIAL NOTE ON "Sales Search Index" (sales_search_index):
-- ------------------------------------------------------------------------------
-- WHY IT IS USED IN THE APPLICATION:
-- Scanning hundreds or thousands of rows directly in Google Sheets to find a
-- specific record (e.g. looking up an invoice number "INV-1024", customer name,
-- or phone number) causes severe latency and risks hitting Google API rate limits
-- (60 requests/min).
--
-- HOW IT WORKS:
-- 1. Fast Lookups: The `sales_search_index` table acts as a lightweight lookup
--    index storing key-to-row mappings: (searchKey, rowIndex, moduleKey).
-- 2. Direct Row Fetching: When searching for a record, the system queries this
--    compact index first to determine the exact row index (rowIndex) in the
--    target sheet, then fetches ONLY that single row rather than downloading
--    the whole sheet.
-- 3. Real-time Maintenance: Updates/creates automatically maintain index entries.
--    Admins can also rebuild the index on demand via POST /api/setup/rebuild-search-index.
-- ==============================================================================

-- 1. Items Management (Tab: "Items Management", Module Key: "items")
CREATE TABLE IF NOT EXISTS items_management (
    id INT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    item_type VARCHAR(100),
    price_of_item DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    available_sizes VARCHAR(255),
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    current_status VARCHAR(50) DEFAULT 'Active'
);

-- 2. Inventory Management (Tab: "Inventory Management", Module Key: "inventory")
CREATE TABLE IF NOT EXISTS inventory_management (
    id INT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    size VARCHAR(50) NOT NULL,
    total_quantity_available INT DEFAULT 0,
    added_by_admin VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by_admin VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Warehouse Management (Tab: "Warehouse Management", Module Key: "warehouse")
CREATE TABLE IF NOT EXISTS warehouse_management (
    id INT PRIMARY KEY,
    warehouse_location VARCHAR(255) NOT NULL,
    handler_name VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    quantity INT DEFAULT 0,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Sales Management (Tab: "Sales Management", Module Key: "sales")
CREATE TABLE IF NOT EXISTS sales_management (
    id INT PRIMARY KEY,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    sale_status VARCHAR(50) DEFAULT 'Completed',
    customer_name VARCHAR(255) NOT NULL,
    customer_phone_number VARCHAR(50),
    customer_address TEXT,
    total_number_of_items_purchased INT DEFAULT 0,
    items_names TEXT,
    sizes_chosen TEXT,
    item_prices TEXT,
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    payment_status VARCHAR(50) DEFAULT 'Paid',
    mode_of_payment VARCHAR(50),
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_admin VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    version INT DEFAULT 1,
    delivery_status VARCHAR(50) DEFAULT 'Delivered',
    delivery_charge_toggle VARCHAR(10) DEFAULT 'OFF',
    delivery_charge_amount DECIMAL(10, 2) DEFAULT 0.00,
    fulfilment_request_status VARCHAR(50),
    fulfilment_source VARCHAR(100),
    sale_closed_by VARCHAR(100),
    discount DECIMAL(10, 2) DEFAULT 0.00,
    customer_email VARCHAR(255),
    received_by VARCHAR(100),
    remarks TEXT
);

-- 5. Replacement Management (Tab: "Replacement Management", Module Key: "replacement")
CREATE TABLE IF NOT EXISTS replacement_management (
    id INT PRIMARY KEY,
    invoice_number VARCHAR(100) NOT NULL,
    total_number_of_items_purchased INT DEFAULT 0,
    last_purchased_items TEXT,
    last_purchased_items_size TEXT,
    new_items TEXT,
    new_items_size TEXT,
    invoice_status VARCHAR(50) DEFAULT 'Replaced',
    disposition_of_old_items VARCHAR(100),
    restock_destination VARCHAR(100),
    removed_item_from_last_purchase TEXT,
    sizes_of_removed_item_from_last_purchase TEXT,
    number_of_removed_item_from_last_purchase INT DEFAULT 0,
    new_final_items_selected TEXT,
    new_final_items_sizes TEXT,
    number_of_new_final_items INT DEFAULT 0,
    new_final_items_prices_each TEXT,
    new_final_items_total_amount DECIMAL(10, 2) DEFAULT 0.00,
    new_stock_source VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    version INT DEFAULT 1,
    new_delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
    new_discount DECIMAL(10, 2) DEFAULT 0.00
);

-- 6. Return Refund Management (Tab: "Return Refund Management", Module Key: "return_refund")
CREATE TABLE IF NOT EXISTS return_refund_management (
    id INT PRIMARY KEY,
    invoice_number VARCHAR(100) NOT NULL,
    item_verification_status VARCHAR(50),
    refund_status VARCHAR(50) DEFAULT 'Completed',
    refund_amount DECIMAL(10, 2) DEFAULT 0.00,
    refund_completed_date_time TIMESTAMP,
    transaction_id VARCHAR(100),
    mode_of_refund VARCHAR(50),
    disposition_of_returned_items VARCHAR(100),
    restock_destination VARCHAR(100),
    returned_items TEXT,
    returned_item_sizes TEXT,
    returned_item_quantities TEXT,
    price_charged_returned_items DECIMAL(10, 2) DEFAULT 0.00,
    new_final_items_selected TEXT,
    new_final_items_sizes TEXT,
    number_of_new_final_items INT DEFAULT 0,
    new_final_items_prices_each TEXT,
    new_discount_applied DECIMAL(10, 2) DEFAULT 0.00,
    new_final_items_total_amount DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    version INT DEFAULT 1,
    customer_name VARCHAR(255),
    customer_phone_number VARCHAR(50),
    customer_address TEXT,
    customer_email VARCHAR(255),
    original_purchased_items TEXT,
    original_item_sizes TEXT,
    original_item_quantities TEXT,
    original_item_prices TEXT,
    original_discount DECIMAL(10, 2) DEFAULT 0.00,
    original_delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
    original_total_amount DECIMAL(10, 2) DEFAULT 0.00,
    original_sale_created_at TIMESTAMP,
    original_sale_created_by VARCHAR(100),
    reason_for_return TEXT,
    closed_by VARCHAR(100)
);

-- 7. Admin Information (Tab: "Admin Information", Module Key: "admin_info")
CREATE TABLE IF NOT EXISTS admin_information (
    id INT PRIMARY KEY,
    admin_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    email_id VARCHAR(255) UNIQUE NOT NULL,
    notifications VARCHAR(50) DEFAULT 'Enabled',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- 8. Keep Notes (Tab: "Keep Notes", Module Key: "keep_notes")
CREATE TABLE IF NOT EXISTS keep_notes (
    id INT PRIMARY KEY,
    note_content TEXT NOT NULL,
    created_by_admin VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 9. Activity Log (Tab: "Activity Log", Module Key: "activity_log")
CREATE TABLE IF NOT EXISTS activity_log (
    id INT PRIMARY KEY,
    admin_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    module VARCHAR(100),
    module_key VARCHAR(100),
    record_id VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message TEXT
);

-- 10. Damaged Products (Tab: "Damaged Products", Module Key: "damaged_products")
CREATE TABLE IF NOT EXISTS damaged_products (
    id INT PRIMARY KEY,
    invoice_number VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    quantity INT DEFAULT 1,
    customer_name VARCHAR(255),
    reason_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- 11. Inventory History Tracker (Tab: "Inventory History", Module Key: "inventory_history")
CREATE TABLE IF NOT EXISTS inventory_history (
    id INT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    quantity_change INT NOT NULL,
    affected_sheet VARCHAR(100),
    handler_if_warehouse VARCHAR(100),
    transaction_type VARCHAR(50),
    related_invoice_number VARCHAR(100),
    resulting_balance INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    notes TEXT
);

-- 12. Customer Information (Tab: "Customer Information", Module Key: "customer_info")
CREATE TABLE IF NOT EXISTS customer_information (
    id INT PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    address TEXT,
    email_id VARCHAR(255),
    total_orders_placed INT DEFAULT 0,
    invoice_numbers TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- 13. Sales Log Audit (Tab: "Sales Log", Module Key: "sales_log")
CREATE TABLE IF NOT EXISTS sales_log (
    id INT PRIMARY KEY,
    module VARCHAR(100) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    related_invoice_number VARCHAR(100),
    log_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- 14. Expense Management (Tab: "Expense Management", Module Key: "expenses")
CREATE TABLE IF NOT EXISTS expense_management (
    id INT PRIMARY KEY,
    admin_name VARCHAR(255) NOT NULL,
    expense_category VARCHAR(100) NOT NULL,
    custom_category VARCHAR(100),
    description TEXT,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    date_of_expense VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- 15. Vendor Management (Tab: "Vendor Management", Module Key: "vendors")
CREATE TABLE IF NOT EXISTS vendor_management (
    id INT PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_type VARCHAR(100),
    custom_vendor_type VARCHAR(100),
    contact_numbers VARCHAR(255),
    email_id VARCHAR(255),
    purpose_use TEXT,
    total_amount_paid DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- 16. Vendor Payment Log (Tab: "Vendor Payment Log", Module Key: "vendor_payments")
CREATE TABLE IF NOT EXISTS vendor_payment_log (
    id INT PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    date VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

-- 17. Announcements Log (Tab: "Announcements Log", Module Key: "announcements")
CREATE TABLE IF NOT EXISTS announcements_log (
    id INT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    target_audience VARCHAR(100),
    recipients_count INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

-- 18. Sales Search Index (Tab: "Sales Search Index", Module Key: "sales_search_index")
-- [System Lookup Index Table]
CREATE TABLE IF NOT EXISTS sales_search_index (
    search_key VARCHAR(255) NOT NULL,
    row_index INT NOT NULL,
    module_key VARCHAR(100) NOT NULL,
    PRIMARY KEY (search_key, module_key)
);
