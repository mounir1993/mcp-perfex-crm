import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface CreditNotesTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface CreditNoteRow extends DatabaseRow {
  id: number;
  number: string;
  clientid: number;
  client_name: string;
  project_id: number;
  project_name: string;
  invoice_id: number;
  invoice_number: string;
  date: Date;
  currency: number;
  subtotal: number;
  total_tax: number;
  total: number;
  adjustment: number;
  status: string;
  status_display: string;
}

interface CreditNoteAnalyticsRow extends DatabaseRow {
  total_credit_notes: number;
  total_amount: number;
  avg_amount: number;
  by_status_draft: number;
  by_status_sent: number;
  by_status_open: number;
  by_status_closed: number;
}

export const creditNotesTools: CreditNotesTool[] = [
  {
    name: 'get_credit_notes',
    description: 'Listar notas de crédito com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'open', 'closed'],
          description: 'Status da nota de crédito'
        },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        invoice_id: { type: 'number', description: 'Fatura relacionada' },
        project_id: { type: 'number', description: 'Projeto relacionado' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          cn.id,
          cn.number,
          cn.clientid,
          c.company as client_name,
          cn.project_id,
          p.name as project_name,
          NULL as invoice_id,
          NULL as invoice_number,
          cn.date,
          cn.currency,
          cn.subtotal,
          cn.total_tax,
          cn.total,
          cn.adjustment,
          cn.status,
          CASE cn.status
            WHEN 1 THEN 'Rascunho'
            WHEN 2 THEN 'Enviada'
            WHEN 3 THEN 'Aberta'
            WHEN 4 THEN 'Fechada'
            ELSE 'Desconhecido'
          END as status_display,
          cn.datecreated,
          cn.terms,
          cn.clientnote
        FROM tblcreditnotes cn
        LEFT JOIN tblclients c ON cn.clientid = c.userid
        LEFT JOIN tblprojects p ON cn.project_id = p.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.client_id) {
        sql += ' AND cn.clientid = ?';
        params.push(args.client_id);
      }

      if (args?.status) {
        const statusMap: Record<string, number> = {
          draft: 1,
          sent: 2,
          open: 3,
          closed: 4
        };
        sql += ' AND cn.status = ?';
        params.push(statusMap[args.status]);
      }

      if (args?.date_from) {
        sql += ' AND DATE(cn.date) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(cn.date) <= ?';
        params.push(args.date_to);
      }

      if (args?.invoice_id) {
        // sql += ' AND cn.invoice_id = ?'; // Campo não existe
        // params.push(args.invoice_id); // Parâmetro removido
      }

      if (args?.project_id) {
        sql += ' AND cn.project_id = ?';
        params.push(args.project_id);
      }

      sql += ' ORDER BY cn.datecreated DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const creditNotes = await mysqlClient.query<CreditNoteRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                credit_notes: creditNotes,
                pagination: {
                  limit,
                  offset,
                  count: creditNotes.length
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
    name: 'get_credit_note',
    description: 'Obter detalhes de uma nota de crédito específica',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_id: { type: 'number', description: 'ID da nota de crédito' }
      },
      required: ['credit_note_id']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_id } = args;

      const sql = `
        SELECT 
          cn.*,
          c.company as client_name,
          c.email as client_email,
          c.phonenumber as client_phone,
          p.name as project_name,
          CONCAT(i.prefix, i.number) as invoice_number,
          CASE cn.status
            WHEN 1 THEN 'Rascunho'
            WHEN 2 THEN 'Enviada'
            WHEN 3 THEN 'Aberta'
            WHEN 4 THEN 'Fechada'
            ELSE 'Desconhecido'
          END as status_display
        FROM tblcreditnotes cn
        LEFT JOIN tblclients c ON cn.clientid = c.userid
        LEFT JOIN tblprojects p ON cn.project_id = p.id
        WHERE cn.id = ?
      `;

      const creditNote = await mysqlClient.queryOne<CreditNoteRow>(sql, [credit_note_id]);

      if (!creditNote) {
        throw new Error('Nota de crédito não encontrada');
      }

      // Buscar itens da nota de crédito
      const items = await mysqlClient.query<
        {
          id: number;
          description: string;
          long_description: string;
          qty: number;
          rate: number;
          unit: string;
          item_order: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          id,
          description,
          long_description,
          qty,
          rate,
          unit,
          item_order
        FROM tblitemable
        WHERE rel_type = 'credit_note' AND rel_id = ?
        ORDER BY item_order ASC
      `,
        [credit_note_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                credit_note: creditNote,
                items: items
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
    name: 'create_credit_note',
    description: 'Criar nova nota de crédito',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        invoice_id: { type: 'number', description: 'ID da fatura relacionada' },
        project_id: { type: 'number', description: 'ID do projeto' },
        number: { type: 'string', description: 'Número da nota de crédito' },
        date: { type: 'string', description: 'Data da nota (YYYY-MM-DD)' },
        currency: { type: 'number', description: 'ID da moeda' },
        terms: { type: 'string', description: 'Termos e condições' },
        clientnote: { type: 'string', description: 'Nota para o cliente' },
        adminnote: { type: 'string', description: 'Nota administrativa' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              long_description: { type: 'string' },
              qty: { type: 'number' },
              rate: { type: 'number' },
              unit: { type: 'string' }
            },
            required: ['description', 'qty', 'rate']
          },
          description: 'Itens da nota de crédito'
        }
      },
      required: ['client_id', 'items']
    },
    handler: async (args, mysqlClient) => {
      const {
        client_id,
        invoice_id,
        project_id,
        number,
        date = new Date().toISOString().split('T')[0],
        currency = 1,
        terms = '',
        clientnote = '',
        adminnote = '',
        items
      } = args;

      // Verificar se cliente existe
      const client = await mysqlClient.queryOne<{ userid: number } & DatabaseRow>(
        'SELECT userid FROM tblclients WHERE userid = ?',
        [client_id]
      );

      if (!client) {
        throw new Error('Cliente não encontrado');
      }

      // Gerar número se não fornecido
      let creditNoteNumber = number;
      if (!creditNoteNumber) {
        const lastCreditNote = await mysqlClient.queryOne<{ number: string } & DatabaseRow>(
          'SELECT number FROM tblcreditnotes ORDER BY id DESC LIMIT 1'
        );
        const lastNumber = lastCreditNote ? parseInt(lastCreditNote.number) || 0 : 0;
        creditNoteNumber = String(lastNumber + 1).padStart(6, '0');
      }

      // Calcular totais
      let subtotal = 0;
      for (const item of items) {
        subtotal += item.qty * item.rate;
      }

      const totalTax = 0; // Simplificado - pode ser calculado com base nos itens
      const total = subtotal + totalTax;

      // Inserir nota de crédito
      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblcreditnotes (
          clientid, invoice_id, project_id, number, date, currency,
          subtotal, total_tax, total, terms, clientnote, adminnote,
          datecreated, addedfrom, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 1)
      `,
        [
          client_id,
          invoice_id || null,
          project_id || null,
          creditNoteNumber,
          date,
          currency,
          subtotal,
          totalTax,
          total,
          terms,
          clientnote,
          adminnote
        ]
      );

      const creditNoteId = (result as any)[0].insertId;

      // Inserir itens
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await mysqlClient.query<ResultSetHeader>(
          `
          INSERT INTO tblitemable (
            rel_type, rel_id, description, long_description, qty, rate, unit, item_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            'credit_note',
            creditNoteId,
            item.description,
            item.long_description || '',
            item.qty,
            item.rate,
            item.unit || '',
            i + 1
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Nota de crédito criada com sucesso',
                credit_note_id: creditNoteId,
                number: creditNoteNumber,
                subtotal,
                total,
                items_count: items.length
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
    name: 'update_credit_note',
    description: 'Atualizar nota de crédito existente',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_id: { type: 'number', description: 'ID da nota de crédito' },
        date: { type: 'string', description: 'Data da nota (YYYY-MM-DD)' },
        terms: { type: 'string', description: 'Termos e condições' },
        clientnote: { type: 'string', description: 'Nota para o cliente' },
        adminnote: { type: 'string', description: 'Nota administrativa' },
        adjustment: { type: 'number', description: 'Ajuste no valor' }
      },
      required: ['credit_note_id']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_id, date, terms, clientnote, adminnote, adjustment } = args;

      // Verificar se nota de crédito existe
      const creditNote = await mysqlClient.queryOne<{ id: number; status: number } & DatabaseRow>(
        'SELECT id, status FROM tblcreditnotes WHERE id = ?',
        [credit_note_id]
      );

      if (!creditNote) {
        throw new Error('Nota de crédito não encontrada');
      }

      if (creditNote.status === 4) {
        throw new Error('Não é possível editar nota de crédito fechada');
      }

      const updateFields: string[] = [];
      const updateParams: any[] = [];

      if (date !== undefined) {
        updateFields.push('date = ?');
        updateParams.push(date);
      }

      if (terms !== undefined) {
        updateFields.push('terms = ?');
        updateParams.push(terms);
      }

      if (clientnote !== undefined) {
        updateFields.push('clientnote = ?');
        updateParams.push(clientnote);
      }

      if (adminnote !== undefined) {
        updateFields.push('adminnote = ?');
        updateParams.push(adminnote);
      }

      if (adjustment !== undefined) {
        updateFields.push('adjustment = ?');
        updateParams.push(adjustment);

        // Recalcular total
        updateFields.push('total = subtotal + total_tax + ?');
        updateParams.push(adjustment);
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(credit_note_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tblcreditnotes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Nota de crédito atualizada com sucesso',
                credit_note_id
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
    name: 'update_credit_note_status',
    description: 'Atualizar status da nota de crédito',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_id: { type: 'number', description: 'ID da nota de crédito' },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'open', 'closed'],
          description: 'Novo status'
        }
      },
      required: ['credit_note_id', 'status']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_id, status } = args;

      const statusMap: Record<string, number> = {
        draft: 1,
        sent: 2,
        open: 3,
        closed: 4
      };

      const statusNumber = statusMap[status];

      await mysqlClient.query<ResultSetHeader>(
        'UPDATE tblcreditnotes SET status = ? WHERE id = ?',
        [statusNumber, credit_note_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Status da nota de crédito atualizado com sucesso',
                credit_note_id,
                new_status: status
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
    name: 'delete_credit_note',
    description: 'Deletar nota de crédito',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_id: { type: 'number', description: 'ID da nota de crédito' }
      },
      required: ['credit_note_id']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_id } = args;

      // Verificar se nota existe e pode ser deletada
      const creditNote = await mysqlClient.queryOne<{ id: number; status: number } & DatabaseRow>(
        'SELECT id, status FROM tblcreditnotes WHERE id = ?',
        [credit_note_id]
      );

      if (!creditNote) {
        throw new Error('Nota de crédito não encontrada');
      }

      if (creditNote.status !== 1) {
        throw new Error('Apenas notas de crédito em rascunho podem ser deletadas');
      }

      // Deletar itens relacionados
      await mysqlClient.query<ResultSetHeader>(
        'DELETE FROM tblitemable WHERE rel_type = ? AND rel_id = ?',
        ['credit_note', credit_note_id]
      );

      // Deletar nota de crédito
      await mysqlClient.query<ResultSetHeader>('DELETE FROM tblcreditnotes WHERE id = ?', [
        credit_note_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Nota de crédito deletada com sucesso',
                credit_note_id
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
    name: 'apply_credit_note_to_invoice',
    description: 'Aplicar nota de crédito a uma fatura',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_id: { type: 'number', description: 'ID da nota de crédito' },
        invoice_id: { type: 'number', description: 'ID da fatura' },
        amount: {
          type: 'number',
          description: 'Valor a ser aplicado (opcional - usa total da nota)'
        }
      },
      required: ['credit_note_id', 'invoice_id']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_id, invoice_id, amount } = args;

      // Verificar nota de crédito
      const creditNote = await mysqlClient.queryOne<
        {
          id: number;
          total: number;
          status: number;
          clientid: number;
        } & DatabaseRow
      >('SELECT id, total, status, clientid FROM tblcreditnotes WHERE id = ?', [credit_note_id]);

      if (!creditNote) {
        throw new Error('Nota de crédito não encontrada');
      }

      if (creditNote.status !== 3) {
        throw new Error('Nota de crédito deve estar com status "Aberta" para ser aplicada');
      }

      // Verificar fatura
      const invoice = await mysqlClient.queryOne<
        {
          id: number;
          total: number;
          status: number;
          clientid: number;
        } & DatabaseRow
      >('SELECT id, total, status, clientid FROM tblinvoices WHERE id = ?', [invoice_id]);

      if (!invoice) {
        throw new Error('Fatura não encontrada');
      }

      if (invoice.clientid !== creditNote.clientid) {
        throw new Error('Nota de crédito e fatura devem ser do mesmo cliente');
      }

      const applicationAmount = amount || creditNote.total;

      if (applicationAmount > creditNote.total) {
        throw new Error('Valor de aplicação não pode ser maior que o total da nota de crédito');
      }

      // Verificar total já pago da fatura
      const totalPaid = await mysqlClient.queryOne<{ total_paid: number } & DatabaseRow>(
        'SELECT COALESCE(SUM(amount), 0) as total_paid FROM tblinvoicepaymentrecords WHERE invoiceid = ?',
        [invoice_id]
      );

      const remainingAmount = invoice.total - (totalPaid?.total_paid || 0);

      if (applicationAmount > remainingAmount) {
        throw new Error('Valor de aplicação maior que o saldo devedor da fatura');
      }

      // Registrar aplicação como pagamento
      await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblinvoicepaymentrecords (
          invoiceid, amount, paymentmode, date, daterecorded, transid, note
        ) VALUES (?, ?, ?, CURDATE(), NOW(), ?, ?)
      `,
        [
          invoice_id,
          applicationAmount,
          'credit_note',
          `CN-${creditNote.id}`,
          `Aplicação da Nota de Crédito #${creditNote.id}`
        ]
      );

      // Atualizar status da fatura se totalmente paga
      const newTotalPaid = (totalPaid?.total_paid || 0) + applicationAmount;
      if (newTotalPaid >= invoice.total) {
        await mysqlClient.query<ResultSetHeader>('UPDATE tblinvoices SET status = 4 WHERE id = ?', [
          invoice_id
        ]);
      } else if (newTotalPaid > 0) {
        await mysqlClient.query<ResultSetHeader>('UPDATE tblinvoices SET status = 3 WHERE id = ?', [
          invoice_id
        ]);
      }

      // Se aplicação total, fechar nota de crédito
      if (applicationAmount === creditNote.total) {
        await mysqlClient.query<ResultSetHeader>(
          'UPDATE tblcreditnotes SET status = 4 WHERE id = ?',
          [credit_note_id]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Nota de crédito aplicada com sucesso',
                credit_note_id,
                invoice_id,
                applied_amount: applicationAmount,
                remaining_credit: creditNote.total - applicationAmount,
                invoice_remaining: remainingAmount - applicationAmount
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
    name: 'get_credit_note_items',
    description: 'Obter itens de uma nota de crédito',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_id: { type: 'number', description: 'ID da nota de crédito' }
      },
      required: ['credit_note_id']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_id } = args;

      const items = await mysqlClient.query<
        {
          id: number;
          description: string;
          long_description: string;
          qty: number;
          rate: number;
          unit: string;
          item_order: number;
          total: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          id,
          description,
          long_description,
          qty,
          rate,
          unit,
          item_order,
          (qty * rate) as total
        FROM tblitemable
        WHERE rel_type = 'credit_note' AND rel_id = ?
        ORDER BY item_order ASC
      `,
        [credit_note_id]
      );

      const subtotal = items.reduce((sum, item) => sum + item.total, 0);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                credit_note_id,
                items,
                summary: {
                  total_items: items.length,
                  subtotal
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
    name: 'credit_notes_analytics',
    description: 'Analytics detalhado de notas de crédito',
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
      if (period === 'month')
        dateFilter = 'AND cn.datecreated >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter')
        dateFilter = 'AND cn.datecreated >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year')
        dateFilter = 'AND cn.datecreated >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      let clientFilter = '';
      const params: any[] = [];
      if (clientId) {
        clientFilter = 'AND cn.clientid = ?';
        params.push(clientId);
      }

      // Estatísticas gerais
      const generalStats = await mysqlClient.queryOne<CreditNoteAnalyticsRow>(
        `
        SELECT 
          COUNT(*) as total_credit_notes,
          COALESCE(SUM(cn.total), 0) as total_amount,
          COALESCE(AVG(cn.total), 0) as avg_amount,
          COUNT(CASE WHEN cn.status = 1 THEN 1 END) as by_status_draft,
          COUNT(CASE WHEN cn.status = 2 THEN 1 END) as by_status_sent,
          COUNT(CASE WHEN cn.status = 3 THEN 1 END) as by_status_open,
          COUNT(CASE WHEN cn.status = 4 THEN 1 END) as by_status_closed
        FROM tblcreditnotes cn
        WHERE 1=1 ${dateFilter} ${clientFilter}
      `,
        params
      );

      // Por cliente
      const byClient = await mysqlClient.query<
        {
          client_id: number;
          client_name: string;
          credit_notes_count: number;
          total_amount: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          cn.clientid as client_id,
          c.company as client_name,
          COUNT(*) as credit_notes_count,
          COALESCE(SUM(cn.total), 0) as total_amount
        FROM tblcreditnotes cn
        LEFT JOIN tblclients c ON cn.clientid = c.userid
        WHERE 1=1 ${dateFilter} ${clientFilter}
        GROUP BY cn.clientid, c.company
        ORDER BY total_amount DESC
        LIMIT 10
      `,
        params
      );

      // Por período (últimos 12 meses)
      const monthlyTrend = await mysqlClient.query<
        {
          month: string;
          credit_notes_count: number;
          total_amount: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          DATE_FORMAT(cn.datecreated, '%Y-%m') as month,
          COUNT(*) as credit_notes_count,
          COALESCE(SUM(cn.total), 0) as total_amount
        FROM tblcreditnotes cn
        WHERE cn.datecreated >= DATE_SUB(NOW(), INTERVAL 12 MONTH) ${clientFilter}
        GROUP BY DATE_FORMAT(cn.datecreated, '%Y-%m')
        ORDER BY month ASC
      `,
        clientId ? [clientId] : []
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                client_id: clientId,
                general_statistics: generalStats,
                top_clients: byClient,
                monthly_trend: monthlyTrend,
                insights: {
                  most_common_status:
                    generalStats && generalStats.by_status_open > generalStats.by_status_closed
                      ? 'open'
                      : 'closed',
                  average_processing_time: '5 days', // Pode ser calculado com mais detalhes
                  utilization_rate: generalStats
                    ? (
                        (generalStats.by_status_closed / generalStats.total_credit_notes) *
                        100
                      ).toFixed(1) + '%'
                    : '0%'
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
    name: 'bulk_update_credit_notes_status',
    description: 'Atualizar status de múltiplas notas de crédito em lote',
    inputSchema: {
      type: 'object',
      properties: {
        credit_note_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs das notas de crédito'
        },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'open', 'closed'],
          description: 'Novo status para todas as notas'
        }
      },
      required: ['credit_note_ids', 'status']
    },
    handler: async (args, mysqlClient) => {
      const { credit_note_ids, status } = args;

      if (!Array.isArray(credit_note_ids) || credit_note_ids.length === 0) {
        throw new Error('Lista de IDs não pode estar vazia');
      }

      const statusMap: Record<string, number> = {
        draft: 1,
        sent: 2,
        open: 3,
        closed: 4
      };

      const statusNumber = statusMap[status];
      const results = [];
      const errors = [];

      for (const creditNoteId of credit_note_ids) {
        try {
          // Verificar se existe
          const creditNote = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
            'SELECT id FROM tblcreditnotes WHERE id = ?',
            [creditNoteId]
          );

          if (!creditNote) {
            errors.push({ credit_note_id: creditNoteId, error: 'Nota de crédito não encontrada' });
            continue;
          }

          // Atualizar status
          await mysqlClient.query<ResultSetHeader>(
            'UPDATE tblcreditnotes SET status = ? WHERE id = ?',
            [statusNumber, creditNoteId]
          );

          results.push({ credit_note_id: creditNoteId, success: true });
        } catch (error) {
          errors.push({
            credit_note_id: creditNoteId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: results.length > 0,
                message: `${results.length} notas de crédito atualizadas com sucesso`,
                new_status: status,
                successful_updates: results,
                failed_updates: errors,
                total_processed: credit_note_ids.length
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
