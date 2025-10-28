# 📄 MCP Perfex CRM - Invoice System Documentation

## 🔍 Overview

This document provides comprehensive documentation for the Invoice System in your MCP Perfex CRM. Based on the analysis of your code, here's everything you need to know about invoice creation, management, and the issues you're experiencing.

## 🚨 **Critical Issue Analysis**

### **Problem with Invoice Creation**
Based on Claude's error message: *"Invoice creation failed due to a technical issue with the CRM system"* and your observation that *"when he did it he is making paid"*, here are the identified issues:

1. **Amount Handling Bug**: The system may be automatically marking invoices as paid upon creation
2. **Status Logic Error**: The create_invoice function sets status to `5` (Draft) but payment logic might override this
3. **Missing Validation**: No proper validation for amount vs payment status

## 📊 **Invoice Status System**

### **Status Codes & Meanings**
```typescript
enum InvoiceStatus {
  UNPAID = 1,           // Not paid, within due date
  PAID = 2,             // Fully paid
  PARTIALLY_PAID = 3,   // Partial payment received
  OVERDUE = 4,          // Past due date, unpaid
  DRAFT = 5,            // Not sent to client yet
  CANCELLED = 6         // Cancelled invoice
}
```

### **Status Flow**
```
Draft (5) → Unpaid (1) → Partially Paid (3) → Paid (2)
    ↓           ↓
Cancelled (6)  Overdue (4)
```

## 🛠️ **Available Invoice Tools**

### **1. get_invoices**
**Purpose**: List invoices with filtering
**Parameters**:
- `limit` (number): Max results (default: 100)
- `offset` (number): Pagination offset (default: 0)
- `status` (string): Filter by status (unpaid, paid, overdue, draft, partially_paid, cancelled)
- `client_id` (number): Filter by specific client
- `date_from` (string): Start date (YYYY-MM-DD)
- `date_to` (string): End date (YYYY-MM-DD)
- `search` (string): Search invoice number or client name

**Example Usage**:
```json
{
  "status": "unpaid",
  "client_id": 123,
  "limit": 50
}
```

### **2. get_invoice**
**Purpose**: Get detailed invoice information including items and payments
**Parameters**:
- `invoice_id` (number): Invoice ID (required)

**Returns**: Complete invoice details with:
- Invoice information
- Client details
- Line items
- Payment history
- Tax information

### **3. create_invoice** ⚠️ **PROBLEMATIC**
**Purpose**: Create new invoice
**Parameters**:
- `client_id` (number): Client ID (required)
- `date` (string): Invoice date (YYYY-MM-DD)
- `duedate` (string): Due date (YYYY-MM-DD)
- `currency` (string): Currency code (default: EUR)
- `discount_percent` (number): Discount percentage
- `discount_total` (number): Fixed discount amount
- `discount_type` (string): "percent" or "fixed"
- `adjustment` (number): Manual adjustment
- `terms` (string): Terms and conditions
- `clientnote` (string): Client note
- `adminnote` (string): Admin note
- `items` (array): Invoice items

**Items Structure**:
```json
{
  "items": [
    {
      "description": "Service Description",
      "long_description": "Detailed description",
      "qty": 1,
      "rate": 500.00,
      "unit": "hours"
    }
  ]
}
```

**⚠️ Known Issues**:
- Creates invoices with status `5` (Draft)
- Auto-generates invoice numbers (INV-000001 format)
- May have payment status conflicts

### **4. update_invoice_status**
**Purpose**: Change invoice status
**Parameters**:
- `invoice_id` (number): Invoice ID (required)
- `status` (string): New status (required)

**Valid Status Values**:
- `unpaid` → Status 1
- `paid` → Status 2
- `partially_paid` → Status 3
- `overdue` → Status 4
- `draft` → Status 5
- `cancelled` → Status 6

### **5. add_invoice_payment** ⚠️ **AUTO-PAYMENT RISK**
**Purpose**: Record payment for invoice
**Parameters**:
- `invoice_id` (number): Invoice ID (required)
- `amount` (number): Payment amount (required)
- `paymentdate` (string): Payment date (YYYY-MM-DD)
- `paymentmode` (string): Payment method (bank, cash, paypal, etc.)
- `transactionid` (string): Transaction reference
- `note` (string): Payment note

**⚠️ Automatic Status Updates**:
- If payment >= total → Status = `2` (Paid)
- If 0 < payment < total → Status = `3` (Partially Paid)
- This might be causing the "auto-paid" issue

### **6. send_invoice**
**Purpose**: Mark invoice as sent to client
**Parameters**:
- `invoice_id` (number): Invoice ID (required)

### **7. delete_invoice**
**Purpose**: Delete invoice (with safety checks)
**Parameters**:
- `invoice_id` (number): Invoice ID (required)
- `reason` (string): Deletion reason

**Safety Features**:
- Cannot delete if payments exist
- Requires payment removal first
- Logs deletion with reason

### **8. get_invoice_statistics**
**Purpose**: Get comprehensive statistics
**Parameters**:
- `year` (number): Filter by year (default: current)
- `month` (number): Filter by month (1-12)
- `client_id` (number): Filter by client

## 💾 **Database Structure**

### **Main Tables**
1. **`tblinvoices`** - Main invoice data
2. **`tblinvoiceitems`** - Invoice line items
3. **`tblinvoicepaymentrecords`** - Payment records
4. **`tblinvoices_tax`** - Tax information

### **Key Fields in tblinvoices**
```sql
- id (Primary Key)
- clientid (Foreign Key to tblclients)
- number (Invoice Number)
- date (Invoice Date)
- duedate (Due Date)
- currency (Currency Code)
- subtotal (Subtotal Amount)
- total_tax (Tax Amount)
- total (Total Amount)
- status (Status Code 1-6)
- sent (0/1 - Sent Flag)
- terms (Terms & Conditions)
- clientnote (Client Note)
- adminnote (Admin Note)
```

## 🔧 **Troubleshooting the Amount Issue**

### **Root Cause Analysis**
The issue "when he did it he is making paid" suggests:

1. **Auto-Payment Logic**: The system might be automatically creating a payment record when an invoice is created
2. **Status Override**: Payment addition automatically updates status to "Paid"
3. **Amount Validation**: Missing checks for amount vs intended status

### **Potential Fixes**

#### **Fix 1: Modify create_invoice to prevent auto-payment**
```typescript
// In createInvoice handler, ensure status stays as Draft (5)
// and no automatic payment is created
const invoiceId = await mysqlClient.executeInsert(
  `INSERT INTO tblinvoices (..., status) VALUES (..., 5)`, // Keep as Draft
  [..., 5] // Explicitly set Draft status
);
// DO NOT create payment record automatically
```

#### **Fix 2: Add validation in add_invoice_payment**
```typescript
// Validate that payment is intentional
if (amount === invoice.total && invoice.status === 5) {
  // Warn about full payment on draft invoice
  return {
    content: [{
      type: 'text',
      text: 'Warning: Adding full payment to draft invoice. Use update_invoice_status first.'
    }]
  };
}
```

#### **Fix 3: Separate invoice creation from payment**
```typescript
// Create invoice as Draft first
// Then explicitly send it (status 1)
// Then add payments if needed
```

## 📋 **Best Practices**

### **Invoice Creation Workflow**
1. **Create** invoice with status `Draft` (5)
2. **Review** invoice details
3. **Send** invoice to client (status → `Unpaid` 1)
4. **Record payments** as they arrive
5. **Status auto-updates** based on payments

### **Avoiding Auto-Payment Issues**
1. Always create invoices as `Draft` first
2. Never add payments during creation
3. Use `send_invoice` before adding payments
4. Validate amounts before payment recording

## 🚨 **Current System Limitations**

1. **No amount validation during creation**
2. **Auto-payment status changes**
3. **Limited error handling for edge cases**
4. **No protection against duplicate payments**
5. **Currency handling may be inconsistent**

## 🔄 **Recommended Usage Pattern**

### **For $500 Invoice Creation**
```json
// Step 1: Create Draft Invoice
{
  "tool": "create_invoice",
  "args": {
    "client_id": 123,
    "currency": "EUR",
    "items": [
      {
        "description": "Professional Services",
        "qty": 1,
        "rate": 500.00
      }
    ],
    "terms": "Payment due within 30 days"
  }
}

// Step 2: Send Invoice (changes status to Unpaid)
{
  "tool": "send_invoice", 
  "args": {
    "invoice_id": 1234
  }
}

// Step 3: Record Payment (ONLY when actually received)
{
  "tool": "add_invoice_payment",
  "args": {
    "invoice_id": 1234,
    "amount": 500.00,
    "paymentmode": "bank",
    "paymentdate": "2025-10-28"
  }
}
```

## 🎯 **Summary & Recommendations**

### **Immediate Actions Needed**
1. **Fix create_invoice** to prevent auto-payment creation
2. **Add validation** in payment functions
3. **Separate creation from payment logic**
4. **Add amount validation checks**

### **For Claude Integration**
1. **Always create as Draft first**
2. **Explicitly send before payment**
3. **Validate amounts before adding payments**
4. **Use proper error handling**

The current system works but has logical flaws in the payment automation that cause invoices to appear "paid" when they shouldn't be. The fix requires code modifications to separate invoice creation from payment processing.