# MCP Perfex CRM - API Reference

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Total Tools**: 186+ across 24 modules

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [Customer Management](#-customer-management)
3. [Invoice Management](#-invoice-management)
4. [Lead Management](#-lead-management)
5. [Project Management](#-project-management)
6. [Task Management](#-task-management)
7. [Support System](#-support-system)
8. [Usage Examples](#-usage-examples)

---

## 🎯 Overview

MCP Perfex CRM provides comprehensive access to Perfex CRM functionality through 186+ specialized tools organized across 24 modules. All tools follow consistent patterns for error handling, input validation, and response formatting.

### Common Response Format

All tools return responses in this format:

```typescript
interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string; // JSON formatted data or error message
  }>;
}
```

### Success Response Example
```json
{
  "content": [{
    "type": "text",
    "text": "{\"success\": true, \"data\": [...], \"count\": 10}"
  }]
}
```

---

## 👥 Customer Management

### **get_customers**
List customers with advanced filtering and pagination.

**Parameters:**
- `limit` (number, optional): Maximum results (1-1000, default: 50)
- `offset` (number, optional): Results to skip (default: 0) 
- `active` (boolean, optional): Filter by active status
- `search` (string, optional): Search company name, VAT, email

**Example:**
```typescript
const customers = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "get_customers",
  arguments: {
    limit: 25,
    active: true,
    search: "tech"
  }
});
```

### **create_customer**
Create a new customer with validation.

**Parameters:**
- `company` (string, required): Company name
- `vat` (string, optional): VAT number
- `address` (string, optional): Street address
- `city` (string, optional): City
- `phonenumber` (string, optional): Phone number

**Example:**
```typescript
const newCustomer = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "create_customer",
  arguments: {
    company: "Tech Solutions Ltd",
    vat: "GB123456789",
    address: "123 Tech Street",
    city: "London",
    phonenumber: "+44 20 1234 5678"
  }
});
```

---

## 💰 Invoice Management

### **get_invoices**
List invoices with comprehensive filtering options.

**Parameters:**
- `limit` (number, optional): Maximum results (default: 100)
- `status` (string, optional): 'unpaid', 'paid', 'overdue', 'draft'
- `client_id` (number, optional): Filter by customer
- `date_from` (string, optional): Start date (YYYY-MM-DD)
- `search` (string, optional): Search invoice number or client

**Example:**
```typescript
const unpaidInvoices = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "get_invoices",
  arguments: {
    status: "unpaid",
    limit: 50
  }
});
```

### **create_invoice**
Create a new invoice with items and calculations.

**Parameters:**
- `client_id` (number, required): Customer ID
- `date` (string, optional): Invoice date (YYYY-MM-DD)
- `duedate` (string, optional): Due date (YYYY-MM-DD)
- `items` (array, optional): Invoice items
  - `description` (string, required): Item description
  - `qty` (number, required): Quantity
  - `rate` (number, required): Unit price

**Example:**
```typescript
const newInvoice = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "create_invoice",
  arguments: {
    client_id: 123,
    duedate: "2024-09-15",
    items: [
      {
        description: "Web Development",
        qty: 40,
        rate: 125.00
      }
    ]
  }
});
```

### **add_invoice_payment**
Record a payment for an invoice.

**Parameters:**
- `invoice_id` (number, required): Invoice ID
- `amount` (number, required): Payment amount
- `paymentdate` (string, optional): Payment date
- `paymentmode` (string, optional): Payment method

**Example:**
```typescript
const payment = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "add_invoice_payment",
  arguments: {
    invoice_id: 456,
    amount: 2500.00,
    paymentmode: "bank_transfer"
  }
});
```

---

## 🎯 Lead Management

### **get_leads**
List leads with filtering and sorting options.

**Parameters:**
- `limit` (number, optional): Maximum results (default: 50)
- `status` (string, optional): Lead status filter
- `source` (string, optional): Lead source filter
- `assigned` (number, optional): Filter by assigned staff

**Example:**
```typescript
const activeLeads = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "get_leads",
  arguments: {
    status: "in_progress",
    limit: 25
  }
});
```

### **create_lead**
Create a new lead with validation.

**Parameters:**
- `name` (string, required): Lead name
- `company` (string, optional): Company name
- `email` (string, optional): Email address
- `phone` (string, optional): Phone number
- `value` (number, optional): Estimated value
- `source` (string, required): Lead source

**Example:**
```typescript
const newLead = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "create_lead",
  arguments: {
    name: "John Smith",
    company: "Potential Client Ltd",
    email: "john@potential.com",
    value: 15000.00,
    source: "Website"
  }
});
```

### **convert_lead_to_client**
Convert a qualified lead to a customer.

**Parameters:**
- `lead_id` (number, required): Lead ID
- `client_data` (object, optional): Additional customer data

**Example:**
```typescript
const conversion = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "convert_lead_to_client",
  arguments: {
    lead_id: 789,
    client_data: {
      company: "Converted Customer Ltd",
      billing_city: "Manchester"
    }
  }
});
```

---

## 📊 Project Management

### **get_projects**
List projects with status and client filters.

**Parameters:**
- `limit` (number, optional): Maximum results
- `status` (string, optional): Project status
- `client_id` (number, optional): Filter by client
- `search` (string, optional): Search project names

### **create_project**
Create a new project with timeline and budget.

**Parameters:**
- `name` (string, required): Project name
- `client_id` (number, required): Client ID
- `start_date` (string, optional): Start date
- `deadline` (string, optional): Deadline
- `project_cost` (number, optional): Budget

---

## ✅ Task Management

### **get_tasks**
List tasks with project and status filters.

**Parameters:**
- `limit` (number, optional): Maximum results
- `project_id` (number, optional): Filter by project
- `status` (string, optional): Task status
- `assigned` (number, optional): Assigned staff member

### **create_task**
Create a new task with assignments and priorities.

**Parameters:**
- `name` (string, required): Task name
- `description` (string, optional): Task description
- `project_id` (number, optional): Related project
- `assigned` (array, optional): Assigned staff IDs
- `priority` (string, optional): Task priority

---

## 🎫 Support System

### **get_tickets**
List support tickets with filtering options.

**Parameters:**
- `limit` (number, optional): Maximum results
- `status` (string, optional): Ticket status
- `priority` (string, optional): Ticket priority
- `client_id` (number, optional): Filter by client

### **create_ticket**
Create a new support ticket.

**Parameters:**
- `subject` (string, required): Ticket subject
- `message` (string, required): Initial message
- `client_id` (number, optional): Related client
- `priority` (string, optional): Ticket priority

---

## 📝 Usage Examples

### Complete Customer Workflow

```typescript
// 1. Create customer
const customer = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "create_customer",
  arguments: {
    company: "Innovation Corp",
    vat: "GB555666777",
    city: "Manchester"
  }
});

// 2. Create invoice
const invoice = await use_mcp_tool({
  server_name: "mcp-perfex-crm", 
  tool_name: "create_invoice",
  arguments: {
    client_id: 123,
    items: [
      {
        description: "Consulting Services",
        qty: 20,
        rate: 150.00
      }
    ]
  }
});

// 3. Record payment
const payment = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "add_invoice_payment",
  arguments: {
    invoice_id: 456,
    amount: 3000.00
  }
});
```

### Lead Management Workflow

```typescript
// 1. Create lead
const lead = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "create_lead",
  arguments: {
    name: "Sarah Johnson",
    company: "Future Tech Ltd",
    value: 25000.00,
    source: "LinkedIn"
  }
});

// 2. Convert to customer
const conversion = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "convert_lead_to_client", 
  arguments: {
    lead_id: 789
  }
});
```

---

**📚 This covers the core API functionality. For complete documentation of all 186+ tools, see the full documentation.**

**🔗 Related Files:**
- [DOCUMENTATION.md](./DOCUMENTATION.md) - Complete project docs
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Troubleshooting guide
- [README.md](./README.md) - Project overview