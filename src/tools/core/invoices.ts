import { MySQLClient } from '../../mysql-client.js';
import { DatabaseRow } from '../../types/mysql.js';
import { ToolResponse } from '../../types/tools.js';
import { logger } from '../../utils/logger.js';

export interface InvoiceTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<ToolResponse>;
}

// ====================================================================
// GET INVOICES - List all invoices with filters
// ====================================================================
const getInvoices: InvoiceTool = {
  name: 'get_invoices',
  description: 'List all invoices with optional filtering and pagination',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of invoices to return (default: 100)' },
      offset: { type: 'number', description: 'Number of invoices to skip (default: 0)' },
      status: {
        type: 'string',
        description: 'Filter by status: unpaid, paid, overdue, draft, partially_paid, cancelled'
      },
      client_id: { type: 'number', description: 'Filter by client ID' },
      date_from: { type: 'string', description: 'Filter invoices from date (YYYY-MM-DD)' },
      date_to: { type: 'string', description: 'Filter invoices to date (YYYY-MM-DD)' },
      search: { type: 'string', description: 'Search in invoice number or client name' }
    }
  },
  handler: async (args, mysqlClient) => {
    try {
      const { limit = 100, offset = 0, status, client_id, date_from, date_to, search } = args;

      const whereConditions = [];
      const queryParams: any[] = [];

      // Status filter
      if (status) {
        switch (status) {
          case 'unpaid':
            whereConditions.push('inv.status = 1');
            break;
          case 'paid':
            whereConditions.push('inv.status = 2');
            break;
          case 'overdue':
            whereConditions.push('inv.status = 4');
            break;
          case 'draft':
            whereConditions.push('inv.status = 5');
            break;
          case 'partially_paid':
            whereConditions.push('inv.status = 3');
            break;
          case 'cancelled':
            whereConditions.push('inv.status = 6');
            break;
        }
      }

      // Client filter
      if (client_id) {
        whereConditions.push('inv.clientid = ?');
        queryParams.push(client_id);
      }

      // Date filters
      if (date_from) {
        whereConditions.push('DATE(inv.date) >= ?');
        queryParams.push(date_from);
      }

      if (date_to) {
        whereConditions.push('DATE(inv.date) <= ?');
        queryParams.push(date_to);
      }

      // Search filter
      if (search) {
        whereConditions.push('(inv.number LIKE ? OR c.company LIKE ?)');
        queryParams.push(`%${search}%`, `%${search}%`);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          inv.id,
          inv.number,
          inv.clientid,
          c.company as client_name,
          c.vat as client_vat,
          inv.date,
          inv.duedate,
          inv.currency,
          inv.total,
          inv.subtotal,
          inv.total_tax,
          inv.adjustment,
          inv.discount_percent,
          inv.discount_total,
          inv.discount_type,
          inv.status,
          CASE inv.status
            WHEN 1 THEN 'Unpaid'
            WHEN 2 THEN 'Paid'
            WHEN 3 THEN 'Partially Paid'
            WHEN 4 THEN 'Overdue'
            WHEN 5 THEN 'Draft'
            WHEN 6 THEN 'Cancelled'
            ELSE 'Unknown'
          END as status_name,
          inv.sent,
          inv.datesend,
          inv.datecreated,
          inv.terms,
          inv.clientnote,
          inv.adminnote,
          inv.recurring,
          inv.recurring_type,
          inv.custom_recurring,
          inv.cycles,
          inv.total_cycles,
          inv.is_recurring_from,
          (SELECT SUM(amount) FROM tblinvoicepaymentrecords 
           WHERE invoiceid = inv.id) as amount_paid
        FROM tblinvoices inv
        LEFT JOIN tblclients c ON inv.clientid = c.userid
        ${whereClause}
        ORDER BY inv.datecreated DESC
        LIMIT ? OFFSET ?
      `;

      queryParams.push(limit, offset);

      const invoices = await mysqlClient.query<DatabaseRow>(query, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM tblinvoices inv
        LEFT JOIN tblclients c ON inv.clientid = c.userid
        ${whereClause}
      `;

      const countParams = queryParams.slice(0, -2); // Remove limit and offset
      const totalResult = await mysqlClient.query<DatabaseRow>(countQuery, countParams);
      const total = totalResult[0]?.total || 0;

      return {
        content: [
          {
            type: 'text',
            text:
              `Found ${invoices.length} invoices (${total} total)\n\n` +
              invoices
                .map(
                  (inv) =>
                    `📄 #${inv.number} - ${inv.client_name}\n` +
                    `   💰 ${inv.total} ${inv.currency} (${inv.status_name})\n` +
                    `   📅 Due: ${inv.duedate || 'No due date'}\n` +
                    `   💳 Paid: ${inv.amount_paid || 0}`
                )
                .join('\n\n')
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching invoices:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching invoices: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// GET INVOICE - Get detailed invoice information
// ====================================================================
const getInvoice: InvoiceTool = {
  name: 'get_invoice',
  description: 'Get detailed information about a specific invoice including items and payments',
  inputSchema: {
    type: 'object',
    properties: {
      invoice_id: { type: 'number', description: 'Invoice ID', required: true }
    },
    required: ['invoice_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { invoice_id } = args;

      // Get invoice details
      const invoice = await mysqlClient.queryOne<DatabaseRow>(
        `
        SELECT 
          inv.*,
          c.company as client_name,
          c.vat as client_vat,
          c.address,
          c.city,
          c.state,
          c.zip,
          c.country,
          c.phonenumber,
          c.website,
          CASE inv.status
            WHEN 1 THEN 'Unpaid'
            WHEN 2 THEN 'Paid'
            WHEN 3 THEN 'Partially Paid'
            WHEN 4 THEN 'Overdue'
            WHEN 5 THEN 'Draft'
            WHEN 6 THEN 'Cancelled'
            ELSE 'Unknown'
          END as status_name,
          (SELECT SUM(amount) FROM tblinvoicepaymentrecords 
           WHERE invoiceid = inv.id) as amount_paid
        FROM tblinvoices inv
        LEFT JOIN tblclients c ON inv.clientid = c.userid
        WHERE inv.id = ?
      `,
        [invoice_id]
      );

      if (!invoice) {
        return {
          content: [
            {
              type: 'text',
              text: `Invoice with ID ${invoice_id} not found`
            }
          ]
        };
      }

      // Get invoice items
      const items = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          description,
          long_description,
          qty,
          rate,
          unit,
          item_order,
          (qty * rate) as line_total
        FROM tblinvoiceitems
        WHERE invoiceid = ?
        ORDER BY item_order ASC
      `,
        [invoice_id]
      );

      // Get payments
      const payments = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          amount,
          paymentdate,
          paymentmode,
          transactionid,
          note
        FROM tblinvoicepaymentrecords
        WHERE invoiceid = ?
        ORDER BY paymentdate DESC
      `,
        [invoice_id]
      );

      // Get taxes
      const taxes = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          taxname,
          taxrate
        FROM tblinvoices_tax
        WHERE invoiceid = ?
      `,
        [invoice_id]
      );

      let result = `📄 **Invoice #${invoice.number}**\n\n`;
      result += `**Client:** ${invoice.client_name}\n`;
      result += `**Status:** ${invoice.status_name}\n`;
      result += `**Date:** ${invoice.date}\n`;
      result += `**Due Date:** ${invoice.duedate || 'No due date'}\n`;
      result += `**Currency:** ${invoice.currency}\n\n`;

      result += `**Financial Summary:**\n`;
      result += `💰 Subtotal: ${invoice.subtotal}\n`;
      result += `📊 Tax: ${invoice.total_tax}\n`;
      result += `💸 Discount: ${invoice.discount_total || 0}\n`;
      result += `🔢 **Total: ${invoice.total}**\n`;
      result += `💳 Paid: ${invoice.amount_paid || 0}\n`;
      result += `⚖️ Balance: ${invoice.total - (invoice.amount_paid || 0)}\n\n`;

      if (items.length > 0) {
        result += `**Items (${items.length}):**\n`;
        items.forEach((item) => {
          result += `• ${item.description}\n`;
          result += `  Qty: ${item.qty} × ${item.rate} = ${item.line_total}\n`;
        });
        result += `\n`;
      }

      if (payments.length > 0) {
        result += `**Payments (${payments.length}):**\n`;
        payments.forEach((payment) => {
          result += `• ${payment.paymentdate}: ${payment.amount} (${payment.paymentmode})\n`;
        });
        result += `\n`;
      }

      if (taxes.length > 0) {
        result += `**Taxes:**\n`;
        taxes.forEach((tax) => {
          result += `• ${tax.taxname}: ${tax.taxrate}%\n`;
        });
        result += `\n`;
      }

      if (invoice.terms) {
        result += `**Terms & Conditions:**\n${invoice.terms}\n\n`;
      }

      if (invoice.clientnote) {
        result += `**Client Note:**\n${invoice.clientnote}\n\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching invoice:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching invoice: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// CREATE INVOICE - Create a new invoice
// ====================================================================
const createInvoice: InvoiceTool = {
  name: 'create_invoice',
  description: 'Create a new invoice for a client',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: { type: 'number', description: 'Client ID', required: true },
      date: { type: 'string', description: 'Invoice date (YYYY-MM-DD)' },
      duedate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      currency: { type: 'string', description: 'Currency code (default: EUR)' },
      discount_percent: { type: 'number', description: 'Discount percentage' },
      discount_total: { type: 'number', description: 'Fixed discount amount' },
      discount_type: { type: 'string', description: 'Discount type: percent or fixed' },
      adjustment: { type: 'number', description: 'Manual adjustment amount' },
      terms: { type: 'string', description: 'Terms and conditions' },
      clientnote: { type: 'string', description: 'Note visible to client' },
      adminnote: { type: 'string', description: 'Internal admin note' },
      items: {
        type: 'array',
        description: 'Invoice items',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Item description', required: true },
            long_description: { type: 'string', description: 'Detailed description' },
            qty: { type: 'number', description: 'Quantity', required: true },
            rate: { type: 'number', description: 'Unit price', required: true },
            unit: { type: 'string', description: 'Unit of measurement' }
          },
          required: ['description', 'qty', 'rate']
        }
      }
    },
    required: ['client_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const {
        client_id,
        date = new Date().toISOString().split('T')[0],
        duedate,
        currency = 'EUR',
        discount_percent = 0,
        discount_total = 0,
        discount_type = 'percent',
        adjustment = 0,
        terms = '',
        clientnote = '',
        adminnote = '',
        items = []
      } = args;

      // Verify client exists
      const client = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT userid, company FROM tblclients WHERE userid = ?',
        [client_id]
      );

      if (!client) {
        return {
          content: [
            {
              type: 'text',
              text: `Client with ID ${client_id} not found`
            }
          ]
        };
      }

      // Generate invoice number
      const lastInvoice = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT number FROM tblinvoices ORDER BY id DESC LIMIT 1'
      );

      let nextNumber = 1;
      if (lastInvoice?.number) {
        const match = lastInvoice.number.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const invoiceNumber = `INV-${nextNumber.toString().padStart(6, '0')}`;

      // Calculate totals
      let subtotal = 0;
      if (items.length > 0) {
        subtotal = items.reduce((sum: number, item: any) => sum + item.qty * item.rate, 0);
      }

      const discountAmount =
        discount_type === 'percent' ? (subtotal * discount_percent) / 100 : discount_total;

      const total = subtotal - discountAmount + adjustment;

      // Create invoice with explicit Draft status
      const invoiceId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblinvoices (
          clientid, number, date, duedate, currency, subtotal, total,
          discount_percent, discount_total, discount_type, adjustment,
          terms, clientnote, adminnote, datecreated, status, sent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 5, 0)
      `,
        [
          client_id,
          invoiceNumber,
          date,
          duedate,
          currency,
          subtotal,
          total,
          discount_percent,
          discountAmount,
          discount_type,
          adjustment,
          terms,
          clientnote,
          adminnote
        ]
      );

      // Add items
      if (items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await mysqlClient.executeInsert(
            `
            INSERT INTO tblinvoiceitems (
              invoiceid, description, long_description, qty, rate, unit, item_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
            [
              invoiceId,
              item.description,
              item.long_description || '',
              item.qty,
              item.rate,
              item.unit || '',
              i + 1
            ]
          );
        }
      }

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Invoice created successfully!\n\n` +
              `📄 Invoice #${invoiceNumber} (ID: ${invoiceId})\n` +
              `👤 Client: ${client.company}\n` +
              `💰 Total: ${total} ${currency}\n` +
              `📅 Date: ${date}\n` +
              `📋 Items: ${items.length}\n` +
              `📊 Status: Draft\n\n` +
              `ℹ️ Next steps:\n` +
              `1. Use 'send_invoice' to mark as sent\n` +
              `2. Record payments when received using 'add_invoice_payment'`
          }
        ]
      };
    } catch (error) {
      logger.error('Error creating invoice:', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error creating invoice: ${error instanceof Error ? error.message : String(error)}\n\nPlease check the input parameters and try again.`
          }
        ]
      };
    }
  }
};

// ====================================================================
// UPDATE INVOICE STATUS - Update invoice status
// ====================================================================
const updateInvoiceStatus: InvoiceTool = {
  name: 'update_invoice_status',
  description: 'Update the status of an invoice',
  inputSchema: {
    type: 'object',
    properties: {
      invoice_id: { type: 'number', description: 'Invoice ID', required: true },
      status: {
        type: 'string',
        description: 'New status: unpaid, paid, partially_paid, overdue, draft, cancelled',
        required: true
      }
    },
    required: ['invoice_id', 'status']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { invoice_id, status } = args;

      // Map status to number
      let statusNumber;
      switch (status) {
        case 'unpaid':
          statusNumber = 1;
          break;
        case 'paid':
          statusNumber = 2;
          break;
        case 'partially_paid':
          statusNumber = 3;
          break;
        case 'overdue':
          statusNumber = 4;
          break;
        case 'draft':
          statusNumber = 5;
          break;
        case 'cancelled':
          statusNumber = 6;
          break;
        default:
          return {
            content: [
              {
                type: 'text',
                text: `Invalid status: ${status}. Valid options: unpaid, paid, partially_paid, overdue, draft, cancelled`
              }
            ]
          };
      }

      // Check if invoice exists
      const invoice = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id, number, status FROM tblinvoices WHERE id = ?',
        [invoice_id]
      );

      if (!invoice) {
        return {
          content: [
            {
              type: 'text',
              text: `Invoice with ID ${invoice_id} not found`
            }
          ]
        };
      }

      // Update status
      await mysqlClient.query('UPDATE tblinvoices SET status = ? WHERE id = ?', [
        statusNumber,
        invoice_id
      ]);

      const statusNames = {
        1: 'Unpaid',
        2: 'Paid',
        3: 'Partially Paid',
        4: 'Overdue',
        5: 'Draft',
        6: 'Cancelled'
      };

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Invoice status updated successfully!\n\n` +
              `📄 Invoice #${invoice.number}\n` +
              `📊 Status: ${statusNames[invoice.status as keyof typeof statusNames]} → ${statusNames[statusNumber as keyof typeof statusNames]}`
          }
        ]
      };
    } catch (error) {
      logger.error('Error updating invoice status:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error updating invoice status: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// ADD PAYMENT - Record a payment for an invoice
// ====================================================================
const addInvoicePayment: InvoiceTool = {
  name: 'add_invoice_payment',
  description: 'Record a payment for an invoice',
  inputSchema: {
    type: 'object',
    properties: {
      invoice_id: { type: 'number', description: 'Invoice ID', required: true },
      amount: { type: 'number', description: 'Payment amount', required: true },
      paymentdate: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
      paymentmode: { type: 'string', description: 'Payment method (bank, cash, paypal, etc.)' },
      transactionid: { type: 'string', description: 'Transaction ID or reference' },
      note: { type: 'string', description: 'Payment note' }
    },
    required: ['invoice_id', 'amount']
  },
  handler: async (args, mysqlClient) => {
    try {
      const {
        invoice_id,
        amount,
        paymentdate = new Date().toISOString().split('T')[0],
        paymentmode = 'bank',
        transactionid = '',
        note = ''
      } = args;

      // Check if invoice exists and get details
      const invoice = await mysqlClient.queryOne<DatabaseRow>(
        `
        SELECT 
          id, number, total, status,
          (SELECT COALESCE(SUM(amount), 0) FROM tblinvoicepaymentrecords 
           WHERE invoiceid = tblinvoices.id) as amount_paid
        FROM tblinvoices 
        WHERE id = ?
      `,
        [invoice_id]
      );

      if (!invoice) {
        return {
          content: [
            {
              type: 'text',
              text: `Invoice with ID ${invoice_id} not found`
            }
          ]
        };
      }

      // CRITICAL VALIDATION: Prevent payment on draft invoices
      if (invoice.status === 5) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Cannot add payment to draft invoice #${invoice.number}.\n\nPlease use 'send_invoice' first to mark it as sent, then add payments.`
            }
          ]
        };
      }

      // VALIDATION: Prevent payment on cancelled invoices
      if (invoice.status === 6) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Cannot add payment to cancelled invoice #${invoice.number}.`
            }
          ]
        };
      }

      // VALIDATION: Check if already fully paid
      if (invoice.status === 2 && (invoice.amount_paid || 0) >= invoice.total) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Invoice #${invoice.number} is already fully paid (${invoice.amount_paid}/${invoice.total}).`
            }
          ]
        };
      }

      // Validate payment amount
      const remainingBalance = invoice.total - (invoice.amount_paid || 0);
      if (amount <= 0) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Payment amount must be greater than 0`
            }
          ]
        };
      }

      if (amount > remainingBalance) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Payment amount (${amount}) exceeds remaining balance (${remainingBalance})`
            }
          ]
        };
      }

      // VALIDATION: Check for duplicate payments (same amount, date, and transaction ID)
      if (transactionid) {
        const duplicatePayment = await mysqlClient.queryOne<DatabaseRow>(
          `SELECT id FROM tblinvoicepaymentrecords 
           WHERE invoiceid = ? AND amount = ? AND paymentdate = ? AND transactionid = ?`,
          [invoice_id, amount, paymentdate, transactionid]
        );

        if (duplicatePayment) {
          return {
            content: [
              {
                type: 'text',
                text: `⚠️ Duplicate payment detected! A payment with the same amount (${amount}), date (${paymentdate}), and transaction ID (${transactionid}) already exists.`
              }
            ]
          };
        }
      }

      // Record payment
      const paymentId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblinvoicepaymentrecords (
          invoiceid, amount, paymentdate, paymentmode, transactionid, note, daterecorded
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
        [invoice_id, amount, paymentdate, paymentmode, transactionid, note]
      );

      // Calculate new total paid and update invoice status SAFELY
      const newTotalPaid = (invoice.amount_paid || 0) + amount;
      let newStatus = invoice.status;
      
      // Only update status if currently Unpaid (1) or Partially Paid (3)
      if (invoice.status === 1 || invoice.status === 3) {
        if (newTotalPaid >= invoice.total) {
          newStatus = 2; // Paid
        } else if (newTotalPaid > 0) {
          newStatus = 3; // Partially Paid
        } else {
          newStatus = 1; // Unpaid
        }
      }
      // If invoice is in other status (2=Paid, 4=Overdue, 5=Draft, 6=Cancelled), don't auto-change

      // Update status only if it has changed
      if (newStatus !== invoice.status) {
        await mysqlClient.query('UPDATE tblinvoices SET status = ? WHERE id = ?', [
          newStatus,
          invoice_id
        ]);
      }

      const statusNames = {
        1: 'Unpaid',
        2: 'Paid',
        3: 'Partially Paid',
        4: 'Overdue',
        5: 'Draft',
        6: 'Cancelled'
      };

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Payment recorded successfully!\n\n` +
              `📄 Invoice #${invoice.number}\n` +
              `💳 Payment: ${amount} (${paymentmode})\n` +
              `📅 Date: ${paymentdate}\n` +
              `💰 Total Paid: ${newTotalPaid} / ${invoice.total}\n` +
              `📊 New Status: ${statusNames[newStatus as keyof typeof statusNames]}\n` +
              `🆔 Payment ID: ${paymentId}`
          }
        ]
      };
    } catch (error) {
      logger.error('Error adding payment:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error adding payment: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// SEND INVOICE - Mark invoice as sent
// ====================================================================
const sendInvoice: InvoiceTool = {
  name: 'send_invoice',
  description: 'Mark an invoice as sent to the client',
  inputSchema: {
    type: 'object',
    properties: {
      invoice_id: { type: 'number', description: 'Invoice ID', required: true }
    },
    required: ['invoice_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { invoice_id } = args;

      // Check if invoice exists
      const invoice = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id, number, sent FROM tblinvoices WHERE id = ?',
        [invoice_id]
      );

      if (!invoice) {
        return {
          content: [
            {
              type: 'text',
              text: `Invoice with ID ${invoice_id} not found`
            }
          ]
        };
      }

      if (invoice.sent === 1) {
        return {
          content: [
            {
              type: 'text',
              text: `Invoice #${invoice.number} has already been sent`
            }
          ]
        };
      }

      // Mark as sent
      await mysqlClient.query('UPDATE tblinvoices SET sent = 1, datesend = NOW() WHERE id = ?', [
        invoice_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Invoice marked as sent!\n\n📄 Invoice #${invoice.number} has been marked as sent to the client.`
          }
        ]
      };
    } catch (error) {
      logger.error('Error sending invoice:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error sending invoice: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// DELETE INVOICE - Delete an invoice
// ====================================================================
const deleteInvoice: InvoiceTool = {
  name: 'delete_invoice',
  description: 'Delete an invoice and all related data',
  inputSchema: {
    type: 'object',
    properties: {
      invoice_id: { type: 'number', description: 'Invoice ID', required: true },
      reason: { type: 'string', description: 'Reason for deletion' }
    },
    required: ['invoice_id']
  },
  handler: async (args, mysqlClient) => {
    try {
      const { invoice_id, reason } = args;

      // Check if invoice exists
      const invoice = await mysqlClient.queryOne<DatabaseRow>(
        'SELECT id, number, status FROM tblinvoices WHERE id = ?',
        [invoice_id]
      );

      if (!invoice) {
        return {
          content: [
            {
              type: 'text',
              text: `Invoice with ID ${invoice_id} not found`
            }
          ]
        };
      }

      // Check if invoice has payments
      const payments = await mysqlClient.query<DatabaseRow>(
        'SELECT id FROM tblinvoicepaymentrecords WHERE invoiceid = ?',
        [invoice_id]
      );

      if (payments.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Cannot delete invoice #${invoice.number} - it has ${payments.length} payment(s) recorded. Please remove payments first.`
            }
          ]
        };
      }

      // Delete related data first
      await mysqlClient.query('DELETE FROM tblinvoiceitems WHERE invoiceid = ?', [invoice_id]);
      await mysqlClient.query('DELETE FROM tblinvoices_tax WHERE invoiceid = ?', [invoice_id]);

      // Delete the invoice
      await mysqlClient.query('DELETE FROM tblinvoices WHERE id = ?', [invoice_id]);

      // Log the deletion
      if (reason) {
        await mysqlClient.query(
          `
          INSERT INTO tblactivity_log (description, date, staffid) 
          VALUES (?, NOW(), 0)
        `,
          [`Invoice #${invoice.number} deleted. Reason: ${reason}`]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Invoice deleted successfully!\n\n📄 Invoice #${invoice.number} has been permanently deleted.`
          }
        ]
      };
    } catch (error) {
      logger.error('Error deleting invoice:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting invoice: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// ====================================================================
// INVOICE STATISTICS - Get invoice statistics
// ====================================================================
const getInvoiceStatistics: InvoiceTool = {
  name: 'get_invoice_statistics',
  description: 'Get comprehensive invoice statistics and metrics',
  inputSchema: {
    type: 'object',
    properties: {
      year: { type: 'number', description: 'Filter by year (default: current year)' },
      month: { type: 'number', description: 'Filter by month (1-12)' },
      client_id: { type: 'number', description: 'Filter by specific client' }
    }
  },
  handler: async (args, mysqlClient) => {
    try {
      const { year = new Date().getFullYear(), month, client_id } = args;

      const whereConditions = [`YEAR(date) = ?`];
      const queryParams = [year];

      if (month) {
        whereConditions.push('MONTH(date) = ?');
        queryParams.push(month);
      }

      if (client_id) {
        whereConditions.push('clientid = ?');
        queryParams.push(client_id);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Overall statistics
      const stats = await mysqlClient.queryOne<DatabaseRow>(
        `
        SELECT 
          COUNT(*) as total_invoices,
          SUM(total) as total_value,
          SUM(CASE WHEN status = 2 THEN total ELSE 0 END) as paid_value,
          SUM(CASE WHEN status = 1 THEN total ELSE 0 END) as unpaid_value,
          SUM(CASE WHEN status = 4 THEN total ELSE 0 END) as overdue_value,
          COUNT(CASE WHEN status = 2 THEN 1 END) as paid_count,
          COUNT(CASE WHEN status = 1 THEN 1 END) as unpaid_count,
          COUNT(CASE WHEN status = 4 THEN 1 END) as overdue_count,
          COUNT(CASE WHEN status = 5 THEN 1 END) as draft_count,
          AVG(total) as average_value
        FROM tblinvoices 
        ${whereClause}
      `,
        queryParams
      );

      // Monthly breakdown (if year only)
      let monthlyData = [];
      if (!month) {
        monthlyData = await mysqlClient.query<DatabaseRow>(
          `
          SELECT 
            MONTH(date) as month,
            MONTHNAME(date) as month_name,
            COUNT(*) as count,
            SUM(total) as total_value,
            SUM(CASE WHEN status = 2 THEN total ELSE 0 END) as paid_value
          FROM tblinvoices 
          ${whereClause}
          GROUP BY MONTH(date), MONTHNAME(date)
          ORDER BY MONTH(date)
        `,
          queryParams
        );
      }

      // Top clients
      const topClients = await mysqlClient.query<DatabaseRow>(
        `
        SELECT 
          c.company,
          COUNT(inv.id) as invoice_count,
          SUM(inv.total) as total_value
        FROM tblinvoices inv
        LEFT JOIN tblclients c ON inv.clientid = c.userid
        ${whereClause}
        GROUP BY inv.clientid, c.company
        ORDER BY total_value DESC
        LIMIT 5
      `,
        queryParams
      );

      let result = `📊 **Invoice Statistics ${month ? `for ${year}/${month}` : `for ${year}`}**\n\n`;

      result += `**📈 Overview:**\n`;
      result += `• Total Invoices: ${stats?.total_invoices || 0}\n`;
      result += `• Total Value: €${(stats?.total_value || 0).toLocaleString()}\n`;
      result += `• Average Value: €${(stats?.average_value || 0).toFixed(2)}\n\n`;

      result += `**💰 By Status:**\n`;
      result += `• ✅ Paid: ${stats?.paid_count || 0} (€${(stats?.paid_value || 0).toLocaleString()})\n`;
      result += `• ⏳ Unpaid: ${stats?.unpaid_count || 0} (€${(stats?.unpaid_value || 0).toLocaleString()})\n`;
      result += `• ⚠️ Overdue: ${stats?.overdue_count || 0} (€${(stats?.overdue_value || 0).toLocaleString()})\n`;
      result += `• 📝 Draft: ${stats?.draft_count || 0}\n\n`;

      if (monthlyData.length > 0) {
        result += `**📅 Monthly Breakdown:**\n`;
        monthlyData.forEach((month: any) => {
          const paymentRate =
            month.total_value > 0 ? ((month.paid_value / month.total_value) * 100).toFixed(1) : 0;
          result += `• ${month.month_name}: ${month.count} invoices (€${month.total_value.toLocaleString()}, ${paymentRate}% paid)\n`;
        });
        result += `\n`;
      }

      if (topClients.length > 0) {
        result += `**🏆 Top Clients:**\n`;
        topClients.forEach((client: any, index: number) => {
          result += `${index + 1}. ${client.company}: ${client.invoice_count} invoices (€${client.total_value.toLocaleString()})\n`;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      logger.error('Error fetching invoice statistics:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching statistics: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
};

// Export all invoice tools
export const invoicesTools: InvoiceTool[] = [
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceStatus,
  addInvoicePayment,
  sendInvoice,
  deleteInvoice,
  getInvoiceStatistics
];
