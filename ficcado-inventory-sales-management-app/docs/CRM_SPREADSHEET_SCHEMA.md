# Ficcado CRM Spreadsheet Schema Reference

This document serves as the authoritative schema specification for all **17 CRM Google Sheet tabs** (plus the `Sales Search Index` system lookup tab) used in the Ficcado Inventory & Sales Management Application.

---

## System Overview & Performance Design

The application uses Google Sheets as its primary database. Each CRM module corresponds to a specific tab within the system spreadsheet. 

### Why `Sales Search Index` (`sales_search_index`) is Used in the Application

> [!IMPORTANT]
> **Problem:** 
> As sales, inventory, and customer records grow, scanning hundreds or thousands of rows directly in Google Sheets to find a specific record (e.g., searching for Invoice Number `INV-1024`, customer phone number, or customer name) causes severe latency and risks exceeding Google Sheets API rate limits (60 requests/minute limit).
>
> **Solution & How It Works:**
> 1. **Compact Lookup Index**: The `Sales Search Index` tab stores lightweight key-to-row mappings: `[searchKey, rowIndex, moduleKey]`.
> 2. **Direct Row Fetching**: When an admin searches for an invoice or phone number, the app queries this compact index tab first to retrieve the exact 1-based `rowIndex` in the main tab, then fetches **only that single row** instead of downloading the entire sheet.
> 3. **Real-Time Upsert & Rebuild**: Every create/update action in the app automatically upserts into the search index. Admins can also trigger a full index rebuild on demand from the Admin Control Centre (`POST /api/setup/rebuild-search-index`).

---

## 17 CRM Spreadsheet Tabs & Column Definitions

Below is the complete list of all 17 CRM spreadsheet tabs, their corresponding module keys, column counts, and exact column headers without any omissions.

---

### 1. Items Management
- **Sheet Tab Name:** `Items Management`
- **Module Key:** `items`
- **Total Columns:** 11
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Item Name` — Unique name of the item.
  3. `Item Type` — Category/type (e.g. Tops, Bottoms, Accessories).
  4. `Price of Item` — Retail selling price.
  5. `Cost Price` — Cost price of the item for profitability calculation.
  6. `Available Sizes` — Comma-separated list of sizes (e.g. `S, M, L, XL`).
  7. `Created By` — Admin name who created the item.
  8. `Created At` — ISO timestamp of item creation.
  9. `Updated By` — Admin name who last updated the item.
  10. `Updated At` — ISO timestamp of last update.
  11. `Current Status` — Status of the item (`Active` / `Inactive`).

---

### 2. Inventory Management
- **Sheet Tab Name:** `Inventory Management`
- **Module Key:** `inventory`
- **Total Columns:** 8
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Item Name` — Name of the item.
  3. `Size` — Specific size variant (e.g. `M`).
  4. `Total Quantity Available` — Current available stock count.
  5. `Added By (Admin)` — Admin who added/updated stock.
  6. `Updated At` — ISO timestamp of last inventory update.
  7. `Updated By (Admin)` — Admin who performed last update.
  8. `Created At` — ISO timestamp when stock entry was created.

---

### 3. Warehouse Management
- **Sheet Tab Name:** `Warehouse Management`
- **Module Key:** `warehouse`
- **Total Columns:** 10
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Warehouse Location` — Physical warehouse/storage location name.
  3. `Handler Name` — Warehouse handler or contact person.
  4. `Item Name` — Item stored at this warehouse.
  5. `Size` — Item size variant.
  6. `Quantity` — Quantity stored at this warehouse location.
  7. `Created By` — Creator admin name.
  8. `Created At` — ISO timestamp of entry creation.
  9. `Updated By` — Admin who updated this record.
  10. `Updated At` — ISO timestamp of last update.

---

### 4. Sales Management
- **Sheet Tab Name:** `Sales Management`
- **Module Key:** `sales`
- **Total Columns:** 29
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Invoice Number` — Unique invoice identifier (e.g. `INV-1001`).
  3. `Sale Status` — Status (`Completed`, `Pending`, `Cancelled`).
  4. `Customer Name` — Full name of customer.
  5. `Customer Phone Number` — Customer contact number.
  6. `Customer Address` — Delivery/billing address.
  7. `Total Number of Items Purchased` — Count of items in order.
  8. `Item(s) Name(s)` — Comma-separated list of purchased item names.
  9. `Size(s) Chosen` — Comma-separated list of item sizes.
  10. `Item Prices` — Comma-separated list of item prices.
  11. `Total Amount` — Total transaction value.
  12. `Payment Status` — Status (`Paid`, `Unpaid`, `Partial`).
  13. `Mode of Payment` — Payment method (e.g. `UPI`, `Cash`, `Card`).
  14. `Transaction ID` — Reference payment transaction ID.
  15. `Created At` — ISO timestamp of sale creation.
  16. `Created By (Admin)` — Admin who recorded the sale.
  17. `Updated At` — ISO timestamp of last update.
  18. `Updated By` — Admin who updated the sale.
  19. `Version` — Order state revision version integer.
  20. `Delivery Status` — Status (`Delivered`, `In Transit`, `Pending`).
  21. `Delivery Charge Toggle` — Indicator (`ON` / `OFF`).
  22. `Delivery Charge Amount` — Numeric delivery charge.
  23. `Fulfilment Request Status` — Fulfilment state (`Requested`, `Fulfilled`, `Direct`).
  24. `Fulfilment Source` — Source warehouse/store location.
  25. `Sale Closed By` — Admin who finalized/closed the sale.
  26. `Discount` — Total discount amount applied.
  27. `Customer Email` — Customer email address.
  28. `Received By` — Admin/person who received payment.
  29. `Remarks` — Additional notes or remarks.

---

### 5. Replacement Management
- **Sheet Tab Name:** `Replacement Management`
- **Module Key:** `replacement`
- **Total Columns:** 26
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Invoice Number` — Associated sales invoice number.
  3. `Total Number of Items Purchased` — Updated item count.
  4. `Last Purchased Item(s)` — Previous item(s) replaced.
  5. `Last Purchased Item(s) Size` — Sizes of previous item(s).
  6. `New Item(s)` — Replacement item names selected.
  7. `New Item(s) Size` — Replacement item sizes selected.
  8. `Invoice Status` — Replacement order status.
  9. `Disposition of Old Items` — What was done with replaced items (`Restocked`, `Damaged`, etc.).
  10. `Restock Destination` — Warehouse or location where old items were sent.
  11. `Removed Item from Last Purchase` — Items removed from purchase.
  12. `Sizes of Removed Item from Last Purchase` — Sizes of removed items.
  13. `Number of Removed Item from Last Purchase` — Quantity of removed items.
  14. `New Final Items Selected` — Final set of items after replacement.
  15. `New Final Items Sizes` — Final sizes.
  16. `Number of New Final Items` — Final item count.
  17. `New Final Items Prices Each` — Prices of new final items.
  18. `New Final Items Total Amount` — Final adjusted total amount.
  19. `New Stock Source` — Stock source location for replacement items.
  20. `Created At` — Replacement record creation timestamp.
  21. `Created By` — Admin who recorded replacement.
  22. `Updated At` — Last update timestamp.
  23. `Updated By` — Admin who last updated replacement.
  24. `Version` — Replacement version revision count.
  25. `New Delivery Charge` — Updated delivery charge.
  26. `New Discount` — Updated discount amount.

---

### 6. Return Refund Management
- **Sheet Tab Name:** `Return Refund Management`
- **Module Key:** `return_refund`
- **Total Columns:** 40
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Invoice Number` — Associated sales invoice number.
  3. `Item Verification Status` — Verification state of returned goods.
  4. `Refund Status` — Status (`Completed`, `Pending`, `Rejected`).
  5. `Refund Amount` — Total monetary refund amount.
  6. `Refund Completed Date & Time` — Timestamp of refund completion.
  7. `Transaction ID` — Refund payment transaction ID.
  8. `Mode of Refund` — Refund payment method (e.g. `UPI`, `Bank Transfer`).
  9. `Disposition of Returned Items` — Condition/destination of returned items.
  10. `Restock Destination` — Destination warehouse if restocked.
  11. `Returned Item(s)` — Names of returned items.
  12. `Returned Item Size(s)` — Sizes of returned items.
  13. `Returned Item Quantity(ies)` — Quantities returned.
  14. `Price Charged (Returned Items)` — Original price charged for returned items.
  15. `New Final Items Selected` — Remaining items retained by customer.
  16. `New Final Items Sizes` — Retained item sizes.
  17. `Number of New Final Items` — Quantity of retained items.
  18. `New Final Items Prices Each` — Unit prices of retained items.
  19. `New Discount Applied` — Adjusted discount after refund.
  20. `New Final Items Total Amount` — Final adjusted order amount.
  21. `Created At` — Timestamp of return request creation.
  22. `Created By` — Admin who processed return/refund.
  23. `Updated At` — Timestamp of last update.
  24. `Updated By` — Admin who updated record.
  25. `Version` — Return record version.
  26. `Customer Name` — Customer full name.
  27. `Customer Phone Number` — Customer phone number.
  28. `Customer Address` — Customer address.
  29. `Customer Email` — Customer email ID.
  30. `Original Purchased Items` — Items originally ordered.
  31. `Original Item Sizes` — Sizes originally ordered.
  32. `Original Item Quantities` — Quantities originally ordered.
  33. `Original Item Prices` — Prices originally charged.
  34. `Original Discount` — Original discount amount.
  35. `Original Delivery Charge` — Original delivery charge.
  36. `Original Total Amount` — Original order total.
  37. `Original Sale Created At` — Original sale timestamp.
  38. `Original Sale Created By` — Original sale creator admin.
  39. `Reason for Return` — Detailed customer return reason.
  40. `Closed By` — Admin who closed the return/refund case.

---

### 7. Admin Information
- **Sheet Tab Name:** `Admin Information`
- **Module Key:** `admin_info`
- **Total Columns:** 10
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Admin Name` — Full name of admin user.
  3. `Phone Number` — Contact phone number.
  4. `Email ID` — Admin login email address.
  5. `Notifications` — Notification settings preference.
  6. `Password Hash` — Secure hashed password string.
  7. `Created At` — Timestamp of account creation.
  8. `Created By` — Admin who created account.
  9. `Updated At` — Timestamp of last profile update.
  10. `Updated By` — Admin who modified profile.

---

### 8. Keep Notes
- **Sheet Tab Name:** `Keep Notes`
- **Module Key:** `keep_notes`
- **Total Columns:** 6
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Note Content` — Text content of note.
  3. `Created By (Admin)` — Admin who wrote the note.
  4. `Created At` — Creation timestamp.
  5. `Updated By` — Admin who updated note.
  6. `Updated At` — Last update timestamp.

---

### 9. Activity Log
- **Sheet Tab Name:** `Activity Log`
- **Module Key:** `activity_log`
- **Total Columns:** 8
- **Column List:**
  1. `Id` — Sequential log ID.
  2. `Admin Name` — Admin performing the action.
  3. `Action` — Action name (e.g. `CREATE_SALE`, `UPDATE_STOCK`).
  4. `Module` — Human-readable module name.
  5. `Module Key` — System module key identifier.
  6. `Record ID` — ID or invoice number of affected record.
  7. `Timestamp` — Action timestamp.
  8. `Message` — Detailed activity message.

---

### 10. Damaged Products
- **Sheet Tab Name:** `Damaged Products`
- **Module Key:** `damaged_products`
- **Total Columns:** 11
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Invoice Number` — Related invoice number (if applicable).
  3. `Item Name` — Name of damaged item.
  4. `Size` — Item size variant.
  5. `Quantity` — Quantity marked as damaged.
  6. `Customer Name` — Customer name (if returned damaged).
  7. `Reason/Notes` — Explanation of damage.
  8. `Created At` — Timestamp when logged.
  9. `Created By` — Admin who logged damaged item.
  10. `Updated At` — Timestamp of last update.
  11. `Updated By` — Admin who updated record.

---

### 11. Inventory History
- **Sheet Tab Name:** `Inventory History`
- **Module Key:** `inventory_history`
- **Total Columns:** 12
- **Column List:**
  1. `Id` — Sequential history record number.
  2. `Item Name` — Item name.
  3. `Size` — Item size.
  4. `Quantity Change` — Stock delta (e.g. `+10`, `-2`).
  5. `Affected Sheet` — Target sheet (`Inventory` / `Warehouse`).
  6. `Handler (if Warehouse)` — Warehouse handler name if applicable.
  7. `Transaction Type` — Type (`Restock`, `Sale Deduct`, `Return Restock`, `Manual Adjustment`).
  8. `Related Invoice Number` — Associated invoice number if tied to sale/return.
  9. `Resulting Balance` — Calculated balance after change.
  10. `Created At` — Audit entry creation timestamp.
  11. `Created By` — Admin who initiated inventory movement.
  12. `Notes` — Additional remarks.

---

### 12. Customer Information
- **Sheet Tab Name:** `Customer Information`
- **Module Key:** `customer_info`
- **Total Columns:** 11
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Customer Name` — Customer full name.
  3. `Phone Number` — Customer phone number.
  4. `Address` — Customer primary address.
  5. `Email ID` — Customer email address.
  6. `Total Orders Placed` — Total count of orders by customer.
  7. `Invoice Numbers` — Comma-separated list of associated invoice numbers.
  8. `Created At` — Record creation timestamp.
  9. `Created By` — Admin who recorded customer.
  10. `Updated At` — Last update timestamp.
  11. `Updated By` — Admin who updated customer details.

---

### 13. Sales Log
- **Sheet Tab Name:** `Sales Log`
- **Module Key:** `sales_log`
- **Total Columns:** 9
- **Column List:**
  1. `Id` — Sequential record number.
  2. `Module` — Affected module (`Sales`, `Replacement`, `Return`).
  3. `Operation` — Operation performed (`CREATE`, `UPDATE`, `CANCEL`).
  4. `Related Invoice Number` — Invoice number linked to log.
  5. `Log Message` — Audit detail message.
  6. `Created At` — Creation timestamp.
  7. `Created By` — Admin who initiated operation.
  8. `Updated At` — Last update timestamp.
  9. `Updated By` — Admin who updated entry.

---

### 14. Expense Management
- **Sheet Tab Name:** `Expense Management`
- **Module Key:** `expenses`
- **Total Columns:** 11
- **Column List:**
  1. `Id` — Sequential expense record number.
  2. `Admin Name` — Admin who incurred or recorded expense.
  3. `Expense Category` — Predefined category (e.g. `Utilities`, `Rent`, `Logistics`).
  4. `Custom Category` — Custom category string if custom chosen.
  5. `Description` — Detailed description of expense.
  6. `Amount` — Expense amount value.
  7. `Date of Expense` — Date when expense occurred.
  8. `Created At` — Record creation timestamp.
  9. `Created By` — Admin who logged expense.
  10. `Updated At` — Last update timestamp.
  11. `Updated By` — Admin who updated expense.

---

### 15. Vendor Management
- **Sheet Tab Name:** `Vendor Management`
- **Module Key:** `vendors`
- **Total Columns:** 12
- **Column List:**
  1. `Id` — Sequential vendor record number.
  2. `Vendor Name` — Full name or business name of vendor.
  3. `Vendor Type` — Category of vendor (e.g. `Fabric Supplier`, `Logistics`).
  4. `Custom Vendor Type` — Custom vendor type if custom selected.
  5. `Contact Number(s)` — Contact phone number(s).
  6. `Email ID` — Vendor email address.
  7. `Purpose/Use` — Purpose or goods/services supplied.
  8. `Total Amount Paid` — Cumulative total amount paid to vendor.
  9. `Created At` — Record creation timestamp.
  10. `Created By` — Admin who added vendor.
  11. `Updated At` — Last update timestamp.
  12. `Updated By` — Admin who updated vendor profile.

---

### 16. Vendor Payment Log
- **Sheet Tab Name:** `Vendor Payment Log`
- **Module Key:** `vendor_payments`
- **Total Columns:** 7
- **Column List:**
  1. `Id` — Sequential payment record number.
  2. `Vendor Name` — Recipient vendor name.
  3. `Amount` — Payment amount.
  4. `Date` — Date payment was issued.
  5. `Note` — Payment notes or reference details.
  6. `Created At` — Record creation timestamp.
  7. `Created By` — Admin who recorded payment.

---

### 17. Announcements Log
- **Sheet Tab Name:** `Announcements Log`
- **Module Key:** `announcements`
- **Total Columns:** 8
- **Column List:**
  1. `Id` — Sequential announcement ID.
  2. `Subject` — Email/broadcast subject header.
  3. `Target Audience` — Target recipient group (e.g. `All Customers`).
  4. `Recipients Count` — Total targeted recipients count.
  5. `Sent Count` — Successfully sent emails count.
  6. `Failed Count` — Failed dispatch count.
  7. `Created At` — Broadcast creation timestamp.
  8. `Created By` — Admin who sent announcement.

---

## System Lookup Tab: Sales Search Index

### 18. Sales Search Index *(System Tab)*
- **Sheet Tab Name:** `Sales Search Index`
- **Module Key:** `sales_search_index`
- **Total Columns:** 3
- **Column List:**
  1. `searchKey` — Lowercase normalized search term (e.g. invoice number, customer phone number, customer name).
  2. `rowIndex` — 1-based sheet row index in the target module sheet.
  3. `moduleKey` — Target module identifier (e.g. `sales`, `inventory`, `items`, `customer_info`).
