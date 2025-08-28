import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface PaymentsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface PaymentRow extends DatabaseRow {
  id: number;
  invoiceid: number;
  amount: number;
  paymentmode: string;
  paymentmethod: string;
  date: Date;
  daterecorded: Date;
  note: string;
  transactionid: string;
  invoice_number: string;
  client_name: string;
  client_id: number;
}

interface PaymentModeRow extends DatabaseRow {
  id: number;
  name: string;
  description: string;
  show_on_pdf: number;
  invoices_only: number;
  expenses_only: number;
  selected_by_default: number;
  active: number;
}

export const paymentsTools: PaymentsTool[] = [
  {
    name: 'get_payments',
    description: 'Listar pagamentos com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        invoice_id: { type: 'number', description: 'Filtrar por ID da fatura' },
        client_id: { type: 'number', description: 'Filtrar por ID do cliente' },
        payment_mode: { type: 'string', description: 'Filtrar por modo de pagamento' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        search: { type: 'string', description: 'Pesquisar por número de transação ou nota' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          p.id,
          p.invoiceid,
          p.amount,
          p.paymentmode,
          p.paymentmethod,
          p.date,
          p.daterecorded,
          p.note,
          p.transactionid,
          CONCAT(i.prefix, i.number) as invoice_number,
          c.company as client_name,
          c.userid as client_id
        FROM tblinvoicepaymentrecords p
        LEFT JOIN tblinvoices i ON p.invoiceid = i.id
        LEFT JOIN tblclients c ON i.clientid = c.userid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.invoice_id) {
        sql += ' AND p.invoiceid = ?';
        params.push(args.invoice_id);
      }

      if (args?.client_id) {
        sql += ' AND i.clientid = ?';
        params.push(args.client_id);
      }

      if (args?.payment_mode) {
        sql += ' AND p.paymentmode = ?';
        params.push(args.payment_mode);
      }

      if (args?.date_from) {
        sql += ' AND DATE(p.date) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(p.date) <= ?';
        params.push(args.date_to);
      }

      if (args?.search) {
        sql += ' AND (p.transactionid LIKE ? OR p.note LIKE ?)';
        params.push(`%${args.search}%`, `%${args.search}%`);
      }

      sql += ' ORDER BY p.date DESC, p.daterecorded DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const payments = await mysqlClient.query<PaymentRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                payments,
                pagination: {
                  limit,
                  offset,
                  count: payments.length
                }
              },
              null,
              2
            )
          }
        ]
      };
    }
  },

  {
    name: 'get_payment',
    description: 'Obter detalhes de um pagamento específico',
    inputSchema: {
      type: 'object',
      properties: {
        payment_id: { type: 'number', description: 'ID do pagamento' }
      },
      required: ['payment_id']
    },
    handler: async (args, mysqlClient) => {
      const paymentId = args?.payment_id;

      if (!paymentId) {
        throw new Error('payment_id é obrigatório');
      }

      const sql = `
        SELECT 
          p.*,
          CONCAT(i.prefix, i.number) as invoice_number,
          i.total as invoice_total,
          i.status as invoice_status,
          c.company as client_name,
          c.userid as client_id,
          c.vat as client_vat
        FROM tblinvoicepaymentrecords p
        LEFT JOIN tblinvoices i ON p.invoiceid = i.id
        LEFT JOIN tblclients c ON i.clientid = c.userid
        WHERE p.id = ?
      `;

      const payment = await mysqlClient.queryOne<PaymentRow>(sql, [paymentId]);

      if (!payment) {
        throw new Error('Pagamento não encontrado');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ payment }, null, 2)
          }
        ]
      };
    }
  },

  {
    name: 'process_payment',
    description: 'Processar novo pagamento para uma fatura',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'number', description: 'ID da fatura' },
        amount: { type: 'number', description: 'Valor do pagamento' },
        payment_mode: { type: 'string', description: 'Modo de pagamento' },
        payment_method: { type: 'string', description: 'Método de pagamento' },
        date: { type: 'string', description: 'Data do pagamento (YYYY-MM-DD)' },
        transaction_id: { type: 'string', description: 'ID da transação' },
        note: { type: 'string', description: 'Nota sobre o pagamento' }
      },
      required: ['invoice_id', 'amount']
    },
    handler: async (args, mysqlClient) => {
      const {
        invoice_id,
        amount,
        payment_mode = 'cash',
        payment_method = '',
        date = new Date().toISOString().split('T')[0],
        transaction_id = '',
        note = ''
      } = args;

      // Verificar fatura
      const invoice = await mysqlClient.queryOne<
        {
          id: number;
          total: number;
          status: number;
          clientid: number;
        } & DatabaseRow
      >(
        `
        SELECT id, total, status, clientid 
        FROM tblinvoices 
        WHERE id = ?
      `,
        [invoice_id]
      );

      if (!invoice) {
        throw new Error('Fatura não encontrada');
      }

      // Inserir pagamento
      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblinvoicepaymentrecords (
          invoiceid, amount, paymentmode, paymentmethod,
          date, daterecorded, transactionid, note
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)
      `,
        [invoice_id, amount, payment_mode, payment_method, date, transaction_id, note]
      );

      const paymentId = result[0]?.insertId;

      // Verificar total pago e atualizar status
      const totalPaid = await mysqlClient.queryOne<{ total_paid: number } & DatabaseRow>(
        `
        SELECT COALESCE(SUM(amount), 0) as total_paid 
        FROM tblinvoicepaymentrecords 
        WHERE invoiceid = ?
      `,
        [invoice_id]
      );

      const totalPaidAmount = totalPaid?.total_paid || 0;
      let newStatus = invoice.status;

      if (totalPaidAmount >= invoice.total) {
        newStatus = 4; // Paga
      } else if (totalPaidAmount > 0) {
        newStatus = 3; // Parcialmente paga
      }

      if (newStatus !== invoice.status) {
        await mysqlClient.query<ResultSetHeader>('UPDATE tblinvoices SET status = ? WHERE id = ?', [
          newStatus,
          invoice_id
        ]);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                payment_id: paymentId,
                invoice_id,
                amount_paid: amount,
                total_paid: totalPaidAmount,
                remaining_amount: Math.max(0, invoice.total - totalPaidAmount),
                invoice_status:
                  newStatus === 4 ? 'Paga' : newStatus === 3 ? 'Parcialmente Paga' : 'Em aberto',
                message: 'Pagamento processado com sucesso'
              },
              null,
              2
            )
          }
        ]
      };
    }
  },

  {
    name: 'get_payment_modes',
    description: 'Listar modos de pagamento disponíveis',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: { type: 'boolean', description: 'Apenas modos ativos' }
      }
    },
    handler: async (args, mysqlClient) => {
      let sql = 'SELECT * FROM tblpayment_modes WHERE 1=1';
      const params: any[] = [];

      if (args?.active_only) {
        sql += ' AND active = 1';
      }

      sql += ' ORDER BY selected_by_default DESC, name ASC';

      const paymentModes = await mysqlClient.query<PaymentModeRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                payment_modes: paymentModes,
                total_modes: paymentModes.length
              },
              null,
              2
            )
          }
        ]
      };
    }
  },

  {
    name: 'payment_reconciliation',
    description: 'Reconciliação de pagamentos com faturas',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        date_from: { type: 'string', description: 'Data inicial para reconciliação' },
        date_to: { type: 'string', description: 'Data final para reconciliação' }
      }
    },
    handler: async (args, mysqlClient) => {
      const { client_id, date_from, date_to } = args;

      let sql = `
        SELECT 
          i.id,
          CONCAT(i.prefix, i.number) as invoice_number,
          i.total,
          i.status,
          COALESCE(SUM(p.amount), 0) as paid_amount,
          (i.total - COALESCE(SUM(p.amount), 0)) as outstanding_amount
        FROM tblinvoices i
        LEFT JOIN tblinvoicepaymentrecords p ON i.id = p.invoiceid
        WHERE i.status IN (1, 2, 3, 5)
      `;

      const params: any[] = [];

      if (client_id) {
        sql += ' AND i.clientid = ?';
        params.push(client_id);
      }

      if (date_from) {
        sql += ' AND i.date >= ?';
        params.push(date_from);
      }

      if (date_to) {
        sql += ' AND i.date <= ?';
        params.push(date_to);
      }

      sql += ' GROUP BY i.id HAVING outstanding_amount > 0 ORDER BY i.date DESC';

      const reconciliation = await mysqlClient.query<
        {
          id: number;
          invoice_number: string;
          total: number;
          status: number;
          paid_amount: number;
          outstanding_amount: number;
        } & DatabaseRow
      >(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                reconciliation,
                total_outstanding: reconciliation.reduce(
                  (sum, item) => sum + item.outstanding_amount,
                  0
                ),
                count: reconciliation.length
              },
              null,
              2
            )
          }
        ]
      };
    }
  },

  {
    name: 'payment_analytics',
    description: 'Analytics detalhado de pagamentos',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        group_by: {
          type: 'string',
          enum: ['day', 'week', 'month', 'payment_mode'],
          description: 'Agrupar resultados por'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND p.date >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND p.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND p.date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND p.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      // Estatísticas gerais
      const generalStats = await mysqlClient.queryOne<
        {
          total_payments: number;
          total_amount: number;
          avg_payment_amount: number;
          unique_clients: number;
        } & DatabaseRow
      >(`
        SELECT 
          COUNT(*) as total_payments,
          SUM(p.amount) as total_amount,
          AVG(p.amount) as avg_payment_amount,
          COUNT(DISTINCT i.clientid) as unique_clients
        FROM tblinvoicepaymentrecords p
        LEFT JOIN tblinvoices i ON p.invoiceid = i.id
        WHERE 1=1 ${dateFilter}
      `);

      // Por método de pagamento
      const paymentMethods = await mysqlClient.query<
        {
          paymentmode: string;
          transaction_count: number;
          total_amount: number;
        } & DatabaseRow
      >(`
        SELECT 
          p.paymentmode,
          COUNT(*) as transaction_count,
          SUM(p.amount) as total_amount
        FROM tblinvoicepaymentrecords p
        WHERE 1=1 ${dateFilter}
        GROUP BY p.paymentmode
        ORDER BY total_amount DESC
      `);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                general_stats: generalStats,
                payment_methods_breakdown: paymentMethods
              },
              null,
              2
            )
          }
        ]
      };
    }
  }
];
