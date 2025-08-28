import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface EstimatesTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface EstimateRow extends DatabaseRow {
  id: number;
  number: string;
  clientid: number;
  client_name: string;
  date: Date;
  expirydate: Date;
  total: number;
  subtotal: number;
  total_tax: number;
  status: number;
  datecreated: Date;
  status_name: string;
  validity_status: string;
  days_to_expiry: number;
  converted_to_invoice: number;
}

interface EstimateDetailRow extends DatabaseRow {
  id: number;
  number: string;
  clientid: number;
  client_name: string;
  client_vat: string;
  client_phone: string;
  client_address: string;
  date: Date;
  expirydate: Date;
  total: number;
  subtotal: number;
  total_tax: number;
  status: number;
  status_name: string;
  days_to_expiry: number;
  converted_invoices: number;
  currency: number;
  terms: string;
  clientnote: string;
  sent: number;
}

interface EstimateAnalyticsRow extends DatabaseRow {
  total_estimates: number;
  total_value: number;
  avg_estimate_value: number;
  accepted_estimates: number;
  rejected_estimates: number;
  expired_estimates: number;
  acceptance_rate: number;
  conversion_rate: number;
  accepted_value: number;
  avg_validity_days: number;
}

interface StatusBreakdownRow extends DatabaseRow {
  status: number;
  status_name: string;
  count: number;
  total_value: number;
  percentage: number;
}

interface EstimateItemRow extends DatabaseRow {
  description: string;
  long_description: string;
  qty_number;
  rate_number;
  unit_string;
  line_total_number;
  item_order_number;
}

interface EstimateAnalyticsRow extends DatabaseRow {
  total_estimates_number;
  total_value_number;
  avg_estimate_value_number;
  accepted_estimates_number;
  rejected_estimates_number;
  expired_estimates_number;
  acceptance_rate_number;
  conversion_rate_number;
  accepted_value_number;
  avg_validity_days_number;
}

interface StatusBreakdownRow extends DatabaseRow {
  status_number;
  status_name: string;
  count_number;
  total_value_number;
  percentage_number;
}

export const estimatesTools: EstimatesTool[] = [
  {
    name: 'get_estimates',
    description: 'Listar orçamentos com filtros e status',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        status: {
          type: 'number',
          description: 'Status (1=Rascunho, 2=Enviado, 3=Visto, 4=Aceite, 5=Recusado, 6=Expirado)'
        },
        client_id: { type: 'number', description: 'ID do cliente' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        expired_only: { type: 'boolean', description: 'Apenas orçamentos expirados' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;
      const status = args?.status;
      const clientId = args?.client_id;
      const dateFrom = args?.date_from;
      const dateTo = args?.date_to;
      const expiredOnly = args?.expired_only;

      let sql = `
        SELECT 
          e.id,
          e.number,
          e.clientid,
          c.company as client_name, e.date,
          e.expirydate,
          e.total,
          e.subtotal,
          e.total_tax, e.status,
          e.datecreated,
          CASE e.status
            WHEN 1 THEN 'Rascunho'
            WHEN 2 THEN 'Enviado'
            WHEN 3 THEN 'Visto'
            WHEN 4 THEN 'Aceite'
            WHEN 5 THEN 'Recusado'
            WHEN 6 THEN 'Expirado'
            ELSE 'Desconhecido'
          END as status_name, CASE 
            WHEN e.expirydate < CURDATE() AND e.status NOT IN (4,5,6) THEN 'Expirado'
            WHEN e.status = 4 THEN 'Aceite'
            WHEN e.status = 5 THEN 'Recusado'
            ELSE 'Ativo'
          END as validity_status, DATEDIFF(e.expirydate, CURDATE()) as days_to_expiry,
          0 as converted_to_invoice -- Campo invoice_id não existe na BD
        FROM tblestimates e
        LEFT JOIN tblclients c ON e.clientid = c.userid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (status !== undefined) {
        sql += ' AND e.status = ?';
        params.push(status);
      }

      if (clientId) {
        sql += ' AND e.clientid = ?';
        params.push(clientId);
      }

      if (dateFrom) {
        sql += ' AND e.date >= ?';
        params.push(dateFrom);
      }

      if (dateTo) {
        sql += ' AND e.date <= ?';
        params.push(dateTo);
      }

      if (expiredOnly) {
        sql += ' AND e.expirydate < CURDATE() AND e.status NOT IN (4,5,6)';
      }

      sql += ' ORDER BY e.date DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const estimates = await mysqlClient.query<EstimateRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                estimates,
                pagination: {
                  limit,
                  offset,
                  count: estimates.length
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
    name: 'get_estimate',
    description: 'Obter orçamento completo com itens e histórico',
    inputSchema: {
      type: 'object',
      properties: {
        estimate_id: { type: 'number', description: 'ID do orçamento' }
      },
      required: ['estimate_id']
    },
    handler: async (args, mysqlClient) => {
      const estimateId = args?.estimate_id;
      if (!estimateId) {
        throw new Error('estimate_id é obrigatório');
      }

      const sql = `
        SELECT 
          e.*,
          c.company as client_name, c.vat as client_vat, c.phonenumber as client_phone, c.address as client_address, CASE e.status
            WHEN 1 THEN 'Rascunho'
            WHEN 2 THEN 'Enviado'
            WHEN 3 THEN 'Visto'
            WHEN 4 THEN 'Aceite'
            WHEN 5 THEN 'Recusado'
            WHEN 6 THEN 'Expirado'
            ELSE 'Desconhecido'
          END as status_name, DATEDIFF(e.expirydate, CURDATE()) as days_to_expiry,
          0 as converted_invoices -- Campo invoice_id não existe na BD
        FROM tblestimates e
        LEFT JOIN tblclients c ON e.clientid = c.userid
        WHERE e.id = ?
      `;

      const estimate = await mysqlClient.queryOne<EstimateDetailRow>(sql, [estimateId]);

      if (!estimate) {
        return {
          content: [
            {
              type: 'text',
              text: 'Orçamento não encontrado'
            }
          ]
        };
      }

      // Buscar itens do orçamento
      const itemsSql = `
        SELECT 
          description,
          long_description, qty,
          rate,
          unit,
          (qty * rate) as line_total, item_order
        FROM tblitemable 
        WHERE rel_id = ? AND rel_type = 'estimate'
        ORDER BY item_order
      `;
      const items = await mysqlClient.query<EstimateItemRow>(itemsSql, [estimateId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                estimate: {
                  ...estimate,
                  items
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
    name: 'create_estimate',
    description: 'Criar novo orçamento',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        date: { type: 'string', description: 'Data do orçamento (YYYY-MM-DD)' },
        expiry_date: { type: 'string', description: 'Data de expiração (YYYY-MM-DD)' },
        currency: { type: 'number', description: 'ID da moeda' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              qty: { type: 'number' },
              rate: { type: 'number' },
              unit: { type: 'string' }
            }
          },
          description: 'Itens do orçamento'
        },
        terms: { type: 'string', description: 'Termos e condições' },
        client_note: { type: 'string', description: 'Nota para o cliente' }
      },
      required: ['client_id', 'items']
    },
    handler: async (args, mysqlClient) => {
      const { client_id, date, expiry_date, currency = 1, items, terms, client_note } = args;

      if (!items || items.length === 0) {
        throw new Error('É necessário pelo menos um item no orçamento');
      }

      // Calcular totais
      let subtotal = 0;
      for (const item of items) {
        subtotal += (item.qty || 1) * (item.rate || 0);
      }

      const estimateDate = date || new Date().toISOString().split('T')[0];
      const expiryDate =
        expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Gerar número do orçamento
      const estimateNumber = await mysqlClient.queryOne<{ next_number: number } & DatabaseRow>(
        'SELECT COALESCE(MAX(number), 0) + 1 as next_number FROM tblestimates'
      );
      const nextNumber = estimateNumber?.next_number || 1;

      // Inserir orçamento
      const estimateSql = `
        INSERT INTO tblestimates (
          number, clientid, date, expirydate, currency, subtotal, total, 
          status, datecreated, terms, clientnote, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?, 0)
      `;

      const estimateId = await mysqlClient.executeInsert(estimateSql, [
        nextNumber,
        client_id,
        estimateDate,
        expiryDate,
        currency,
        subtotal,
        subtotal,
        terms || '',
        client_note || ''
      ]);

      // Inserir itens
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await mysqlClient.query<ResultSetHeader>(
          `
          INSERT INTO tblitemable (
            rel_id, rel_type, description, qty, rate, unit, item_order
          ) VALUES (?, 'estimate', ?, ?, ?, ?, ?)
        `,
          [estimateId, item.description, item.qty || 1, item.rate || 0, item.unit || '', i + 1]
        );
      }

      // Buscar orçamento criado
      const newEstimate = await mysqlClient.queryOne<EstimateDetailRow>(
        'SELECT * FROM tblestimates WHERE id = ?',
        [estimateId]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Orçamento criado com sucesso',
                estimate_id: estimateId,
                estimate: newEstimate
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
    name: 'update_estimate',
    description: 'Atualizar orçamento existente',
    inputSchema: {
      type: 'object',
      properties: {
        estimate_id: { type: 'number', description: 'ID do orçamento' },
        status: { type: 'number', description: 'Novo status' },
        expiry_date: { type: 'string', description: 'Nova data de expiração' },
        terms: { type: 'string', description: 'Novos termos' },
        client_note: { type: 'string', description: 'Nova nota para cliente' }
      },
      required: ['estimate_id']
    },
    handler: async (args, mysqlClient) => {
      const { estimate_id, status, expiry_date, terms, client_note } = args;

      // Verificar se orçamento existe
      const estimate = await mysqlClient.queryOne<{ id_number; status: number } & DatabaseRow>(
        'SELECT id, status FROM tblestimates WHERE id = ?',
        [estimate_id]
      );

      if (!estimate) {
        throw new Error('Orçamento não encontrado');
      }

      const updateFields = [];
      const updateParams = [];

      if (status !== undefined) {
        updateFields.push('status = ?');
        updateParams.push(status);
      }

      if (expiry_date) {
        updateFields.push('expirydate = ?');
        updateParams.push(expiry_date);
      }

      if (terms !== undefined) {
        updateFields.push('terms = ?');
        updateParams.push(terms);
      }

      if (client_note !== undefined) {
        updateFields.push('clientnote = ?');
        updateParams.push(client_note);
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(estimate_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tblestimates SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Orçamento atualizado com sucesso',
                estimate_id
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
    name: 'convert_estimate_to_invoice',
    description: 'Converter orçamento aceite em fatura',
    inputSchema: {
      type: 'object',
      properties: {
        estimate_id: { type: 'number', description: 'ID do orçamento' },
        invoice_date: { type: 'string', description: 'Data da fatura (YYYY-MM-DD)' },
        due_date: { type: 'string', description: 'Data de vencimento (YYYY-MM-DD)' }
      },
      required: ['estimate_id']
    },
    handler: async (args, mysqlClient) => {
      const { estimate_id, invoice_date, due_date } = args;

      // Buscar orçamento
      const estimate = await mysqlClient.queryOne<EstimateDetailRow>(
        `
        SELECT * FROM tblestimates WHERE id = ? AND status = 4
      `,
        [estimate_id]
      );

      if (!estimate) {
        throw new Error('Orçamento não encontrado ou não aceite');
      }

      const invoiceDate = invoice_date || new Date().toISOString().split('T')[0];
      const dueDate =
        due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Criar fatura
      const invoiceSql = `
        INSERT INTO tblinvoices (
          clientid, date, duedate, currency, subtotal, total, status,
          datecreated, terms, clientnote, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?, 0)
      `;

      const invoiceId = await mysqlClient.executeInsert(invoiceSql, [
        estimate.clientid,
        invoiceDate,
        dueDate,
        estimate.currency,
        estimate.subtotal,
        estimate.total,
        estimate.terms,
        estimate.clientnote
      ]);

      // Copiar itens do orçamento para a fatura
      await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblitemable (rel_id, rel_type, description, long_description, qty, rate, unit, item_order)
        SELECT ?, 'invoice', description, long_description, qty, rate, unit, item_order
        FROM tblitemable 
        WHERE rel_id = ? AND rel_type = 'estimate'
      `,
        [invoiceId, estimate_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Orçamento convertido em fatura com sucesso',
                estimate_id,
                invoice_id: invoiceId
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
    name: 'send_estimate',
    description: 'Marcar orçamento como enviado',
    inputSchema: {
      type: 'object',
      properties: {
        estimate_id: { type: 'number', description: 'ID do orçamento' },
        email_sent: { type: 'boolean', description: 'Se email foi enviado' }
      },
      required: ['estimate_id']
    },
    handler: async (args, mysqlClient) => {
      const { estimate_id, email_sent = true } = args;

      // Verificar se orçamento existe
      const estimate = await mysqlClient.queryOne<{ id_number; status: number } & DatabaseRow>(
        'SELECT id, status FROM tblestimates WHERE id = ?',
        [estimate_id]
      );

      if (!estimate) {
        throw new Error('Orçamento não encontrado');
      }

      // Atualizar status para enviado se ainda estiver em rascunho
      if (estimate.status === 1) {
        await mysqlClient.query<ResultSetHeader>(
          'UPDATE tblestimates SET status = 2, sent = 1, datesent = NOW() WHERE id = ?',
          [estimate_id]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Orçamento marcado como enviado',
                estimate_id,
                email_sent
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
    name: 'estimate_analytics',
    description: 'Analytics de orçamentos - conversão e performance',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        client_id: { type: 'number', description: 'Filtrar por cliente' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const clientId = args?.client_id;

      let dateFilter = '';
      if (period === 'month') dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter') dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year') dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      let clientFilter = '';
      const params: any[] = [];
      if (clientId) {
        clientFilter = 'AND e.clientid = ?';
        params.push(clientId);
      }

      const sql = `
        SELECT 
          COUNT(*) as total_estimates, SUM(e.total) as total_value, AVG(e.total) as avg_estimate_value, COUNT(CASE WHEN e.status = 4 THEN 1 END) as accepted_estimates, COUNT(CASE WHEN e.status = 5 THEN 1 END) as rejected_estimates, COUNT(CASE WHEN e.expirydate < CURDATE() AND e.status NOT IN (4,5,6) THEN 1 END) as expired_estimates,
          (COUNT(CASE WHEN e.status = 4 THEN 1 END) / COUNT(*) * 100) as acceptance_rate,
          (COUNT(CASE WHEN i.id IS NOT NULL THEN 1 END) / COUNT(CASE WHEN e.status = 4 THEN 1 END) * 100) as conversion_rate, SUM(CASE WHEN e.status = 4 THEN e.total ELSE 0 END) as accepted_value, AVG(DATEDIFF(e.expirydate, e.date)) as avg_validity_days
        FROM tblestimates e
        LEFT JOIN tblinvoices i ON 1=0
        WHERE 1=1 ${dateFilter} ${clientFilter}
      `;

      const analytics = await mysqlClient.queryOne<EstimateAnalyticsRow>(sql, params);

      // Análise por status
      const statusSql = `
        SELECT 
          e.status,
          CASE e.status
            WHEN 1 THEN 'Rascunho'
            WHEN 2 THEN 'Enviado'
            WHEN 3 THEN 'Visto'
            WHEN 4 THEN 'Aceite'
            WHEN 5 THEN 'Recusado'
            WHEN 6 THEN 'Expirado'
          END as status_name, COUNT(*) as count,
          SUM(e.total) as total_value,
          (COUNT(*) / (SELECT COUNT(*) FROM tblestimates WHERE 1=1 ${dateFilter} ${clientFilter}) * 100) as percentage
        FROM tblestimates e
        WHERE 1=1 ${dateFilter} ${clientFilter}
        GROUP BY e.status
        ORDER BY e.status
      `;

      const statusBreakdown = await mysqlClient.query<StatusBreakdownRow>(statusSql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                client_id: clientId,
                overall_analytics: analytics,
                status_breakdown: statusBreakdown
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
