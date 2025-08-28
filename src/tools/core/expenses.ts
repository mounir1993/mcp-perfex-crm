import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface ExpensesTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface ExpenseRow extends DatabaseRow {
  id: number;
  category: number;
  category_name: string;
  amount: number;
  currency: number;
  tax: number;
  tax2: number;
  reference: string;
  note: string;
  date: Date;
  daterecorded: Date;
  clientid: number;
  client_name: string;
  project_id: number;
  project_name: string;
  billable: number;
  invoiceid: number;
  paymentmode: string;
  receipt: string;
}

interface ExpenseCategoryRow extends DatabaseRow {
  id: number;
  name: string;
  description: string;
  expense_count: number;
  total_amount: number;
}

export const expensesTools: ExpensesTool[] = [
  {
    name: 'get_expenses',
    description: 'Listar despesas com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        category_id: { type: 'number', description: 'Filtrar por categoria' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        billable: { type: 'boolean', description: 'Filtrar despesas faturáveis' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        not_invoiced: { type: 'boolean', description: 'Apenas despesas não faturadas' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          e.id,
          e.category,
          ec.name as category_name,
          e.amount,
          e.currency,
          e.tax,
          e.tax2,
          e.reference_no as reference,
          e.note,
          e.date,
          e.dateadded,
          e.clientid,
          c.company as client_name,
          e.project_id,
          p.name as project_name,
          e.billable,
          e.invoiceid,
          e.paymentmode,
          NULL as receipt
        FROM tblexpenses e
        LEFT JOIN tblexpenses_categories ec ON e.category = ec.id
        LEFT JOIN tblclients c ON e.clientid = c.userid
        LEFT JOIN tblprojects p ON e.project_id = p.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.category_id) {
        sql += ' AND e.category = ?';
        params.push(args.category_id);
      }

      if (args?.client_id) {
        sql += ' AND e.clientid = ?';
        params.push(args.client_id);
      }

      if (args?.project_id) {
        sql += ' AND e.project_id = ?';
        params.push(args.project_id);
      }

      if (args?.billable !== undefined) {
        sql += ' AND e.billable = ?';
        params.push(args.billable ? 1 : 0);
      }

      if (args?.date_from) {
        sql += ' AND DATE(e.date) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(e.date) <= ?';
        params.push(args.date_to);
      }

      if (args?.not_invoiced) {
        sql += ' AND e.invoiceid IS NULL';
      }

      sql += ' ORDER BY e.date DESC, e.dateadded DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const expenses = await mysqlClient.query<ExpenseRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                expenses,
                pagination: {
                  limit,
                  offset,
                  count: expenses.length
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
    name: 'create_expense',
    description: 'Criar nova despesa',
    inputSchema: {
      type: 'object',
      properties: {
        category_id: { type: 'number', description: 'ID da categoria' },
        amount: { type: 'number', description: 'Valor da despesa' },
        currency: { type: 'number', description: 'ID da moeda' },
        date: { type: 'string', description: 'Data da despesa (YYYY-MM-DD)' },
        note: { type: 'string', description: 'Descrição/nota' },
        reference: { type: 'string', description: 'Referência' },
        tax: { type: 'number', description: 'Taxa de imposto' },
        tax2: { type: 'number', description: 'Segunda taxa de imposto' },
        client_id: { type: 'number', description: 'ID do cliente (opcional)' },
        project_id: { type: 'number', description: 'ID do projeto (opcional)' },
        billable: { type: 'boolean', description: 'Despesa faturável' },
        payment_mode: { type: 'string', description: 'Modo de pagamento' },
        receipt: { type: 'string', description: 'Caminho do recibo' }
      },
      required: ['category_id', 'amount', 'date', 'note']
    },
    handler: async (args, mysqlClient) => {
      const {
        category_id,
        amount,
        currency = 1,
        date,
        note,
        reference = '',
        tax = 0,
        tax2 = 0,
        client_id,
        project_id,
        billable = false,
        payment_mode = 'cash',
        receipt = ''
      } = args;

      // Gerar referência automaticamente se não fornecida
      const finalReference = reference || `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Inserir despesa (usando executeInsert para ter insertId)
      const expenseId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblexpenses (
          category, amount, currency, date, note, reference,
          tax, tax2, clientid, project_id, billable, paymentmode,
          receipt, daterecorded, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)
      `,
        [
          category_id,
          amount,
          currency,
          date,
          note,
          finalReference,
          tax,
          tax2,
          client_id || null,
          project_id || null,
          billable ? 1 : 0,
          payment_mode,
          receipt
        ]
      );

      // expenseId já retornado pelo executeInsert

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                expense_id: expenseId,
                amount,
                category_id,
                billable,
                reference: finalReference,
                message: 'Despesa criada com sucesso'
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
    name: 'update_expense',
    description: 'Atualizar despesa existente',
    inputSchema: {
      type: 'object',
      properties: {
        expense_id: { type: 'number', description: 'ID da despesa' },
        category_id: { type: 'number', description: 'ID da categoria' },
        amount: { type: 'number', description: 'Valor da despesa' },
        date: { type: 'string', description: 'Data da despesa (YYYY-MM-DD)' },
        note: { type: 'string', description: 'Descrição/nota' },
        reference: { type: 'string', description: 'Referência' },
        tax: { type: 'number', description: 'Taxa de imposto' },
        client_id: { type: 'number', description: 'ID do cliente' },
        project_id: { type: 'number', description: 'ID do projeto' },
        billable: { type: 'boolean', description: 'Despesa faturável' },
        payment_mode: { type: 'string', description: 'Modo de pagamento' }
      },
      required: ['expense_id']
    },
    handler: async (args, mysqlClient) => {
      const { expense_id, ...updateFields } = args;

      // Verificar se despesa existe
      const expense = await mysqlClient.queryOne<{ id: number; invoiceid: number } & DatabaseRow>(
        'SELECT id, invoiceid FROM tblexpenses WHERE id = ?',
        [expense_id]
      );

      if (!expense) {
        throw new Error('Despesa não encontrada');
      }

      if (expense.invoiceid) {
        throw new Error('Não é possível editar despesa já faturada');
      }

      // Construir query de atualização
      const allowedFields = [
        'category_id',
        'amount',
        'date',
        'note',
        'reference',
        'tax',
        'client_id',
        'project_id',
        'billable',
        'payment_mode'
      ];
      const updateParts: string[] = [];
      const updateValues: any[] = [];

      for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
          let dbField = field;
          if (field === 'category_id') dbField = 'category';
          if (field === 'client_id') dbField = 'clientid';
          if (field === 'payment_mode') dbField = 'paymentmode';

          updateParts.push(`${dbField} = ?`);
          updateValues.push(
            field === 'billable' ? (updateFields[field] ? 1 : 0) : updateFields[field]
          );
        }
      }

      if (updateParts.length === 0) {
        throw new Error('Nenhum campo para atualizar');
      }

      updateValues.push(expense_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tblexpenses SET ${updateParts.join(', ')} WHERE id = ?`,
        updateValues
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                expense_id,
                message: 'Despesa atualizada com sucesso'
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
    name: 'delete_expense',
    description: 'Eliminar despesa',
    inputSchema: {
      type: 'object',
      properties: {
        expense_id: { type: 'number', description: 'ID da despesa' }
      },
      required: ['expense_id']
    },
    handler: async (args, mysqlClient) => {
      const { expense_id } = args;

      // Verificar se despesa existe e não está faturada
      const expense = await mysqlClient.queryOne<
        {
          id: number;
          invoiceid: number;
          amount: number;
        } & DatabaseRow
      >('SELECT id, invoiceid, amount FROM tblexpenses WHERE id = ?', [expense_id]);

      if (!expense) {
        throw new Error('Despesa não encontrada');
      }

      if (expense.invoiceid) {
        throw new Error('Não é possível eliminar despesa já faturada');
      }

      // Eliminar despesa
      const result = await mysqlClient.query<ResultSetHeader>(
        'DELETE FROM tblexpenses WHERE id = ?',
        [expense_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                expense_id,
                amount: expense.amount,
                affected_rows: result[0]?.affectedRows || 0,
                message: 'Despesa eliminada com sucesso'
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
    name: 'get_expense_categories',
    description: 'Listar categorias de despesas com estatísticas',
    inputSchema: {
      type: 'object',
      properties: {
        with_stats: { type: 'boolean', description: 'Incluir estatísticas de uso' }
      }
    },
    handler: async (args, mysqlClient) => {
      let sql = `
        SELECT 
          ec.id,
          ec.name,
          ec.description
      `;

      if (args?.with_stats) {
        sql += `,
          COUNT(e.id) as expense_count,
          COALESCE(SUM(e.amount), 0) as total_amount,
          COALESCE(AVG(e.amount), 0) as avg_amount,
          MAX(e.dateadded) as last_used
        `;
      }

      sql += `
        FROM tblexpenses_categories ec
      `;

      if (args?.with_stats) {
        sql += ` LEFT JOIN tblexpenses e ON ec.id = e.category `;
      }

      sql += ` WHERE 1=1 `;

      if (args?.with_stats) {
        sql += ` GROUP BY ec.id, ec.name, ec.description `;
      }

      sql += ` ORDER BY ec.name ASC`;

      const categories = await mysqlClient.query<ExpenseCategoryRow>(sql);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                categories,
                total_categories: categories.length,
                with_statistics: args?.with_stats || false
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
    name: 'bill_expense_to_customer',
    description: 'Faturar despesa ao cliente',
    inputSchema: {
      type: 'object',
      properties: {
        expense_id: { type: 'number', description: 'ID da despesa' },
        include_tax: { type: 'boolean', description: 'Incluir impostos na faturação' },
        markup_percentage: { type: 'number', description: 'Percentagem de markup' }
      },
      required: ['expense_id']
    },
    handler: async (args, mysqlClient) => {
      const { expense_id, include_tax = true, markup_percentage = 0 } = args;

      // Buscar despesa
      const expense = await mysqlClient.queryOne<
        {
          id: number;
          amount: number;
          tax: number;
          tax2: number;
          clientid: number;
          project_id: number;
          billable: number;
          invoiceid: number;
          note: string;
          date: Date;
        } & DatabaseRow
      >(
        `
        SELECT 
          id, amount, tax, tax2, clientid, project_id,
          billable, invoiceid, note, date
        FROM tblexpenses 
        WHERE id = ?
      `,
        [expense_id]
      );

      if (!expense) {
        throw new Error('Despesa não encontrada');
      }

      if (!expense.clientid) {
        throw new Error('Despesa não está associada a um cliente');
      }

      if (!expense.billable) {
        throw new Error('Despesa não é faturável');
      }

      if (expense.invoiceid) {
        throw new Error('Despesa já foi faturada');
      }

      // Calcular valor a faturar
      let billableAmount = expense.amount;

      if (markup_percentage > 0) {
        billableAmount += (billableAmount * markup_percentage) / 100;
      }

      let taxAmount = 0;
      if (include_tax) {
        taxAmount = (billableAmount * expense.tax) / 100 + (billableAmount * expense.tax2) / 100;
      }

      const totalAmount = billableAmount + taxAmount;

      // Criar fatura para a despesa
      const invoiceResult = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblinvoices (
          clientid, date, duedate, subtotal, total, total_tax,
          status, datecreated, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), 0)
      `,
        [
          expense.clientid,
          new Date().toISOString().split('T')[0],
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          billableAmount,
          totalAmount,
          taxAmount
        ]
      );

      const invoiceId = invoiceResult[0]?.insertId;

      // Adicionar item à fatura
      await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblitemable (
          rel_id, rel_type, description, qty, rate, taxrate, amount
        ) VALUES (?, 'invoice', ?, 1, ?, ?, ?)
      `,
        [invoiceId, `Despesa: ${expense.note}`, billableAmount, expense.tax, billableAmount]
      );

      // Atualizar despesa com ID da fatura
      await mysqlClient.query<ResultSetHeader>(
        'UPDATE tblexpenses SET invoiceid = ? WHERE id = ?',
        [invoiceId, expense_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                expense_id,
                invoice_id: invoiceId,
                billable_amount: billableAmount,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                markup_applied: markup_percentage,
                message: 'Despesa faturada ao cliente com sucesso'
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
    name: 'expense_analytics',
    description: 'Analytics detalhado de despesas',
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
          enum: ['category', 'client', 'project'],
          description: 'Agrupar resultados por'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const groupBy = args?.group_by || 'category';

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND e.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      // Estatísticas gerais
      const generalStats = await mysqlClient.queryOne<
        {
          total_expenses: number;
          total_amount: number;
          avg_expense: number;
          billable_count: number;
          invoiced_count: number;
        } & DatabaseRow
      >(`
        SELECT 
          COUNT(*) as total_expenses,
          SUM(e.amount) as total_amount,
          AVG(e.amount) as avg_expense,
          COUNT(CASE WHEN e.billable = 1 THEN 1 END) as billable_count,
          COUNT(CASE WHEN e.invoiceid IS NOT NULL THEN 1 END) as invoiced_count
        FROM tblexpenses e
        WHERE 1=1 ${dateFilter}
      `);

      // Breakdown por grupo
      let groupByColumn = '';
      let groupBySelect = '';
      let joinClause = '';

      switch (groupBy) {
        case 'category':
          groupByColumn = 'e.category';
          groupBySelect = 'ec.name as group_name';
          joinClause = 'LEFT JOIN tblexpenses_categories ec ON e.category = ec.id';
          break;
        case 'client':
          groupByColumn = 'e.clientid';
          groupBySelect = 'c.company as group_name';
          joinClause = 'LEFT JOIN tblclients c ON e.clientid = c.userid';
          break;
        case 'project':
          groupByColumn = 'e.project_id';
          groupBySelect = 'p.name as group_name';
          joinClause = 'LEFT JOIN tblprojects p ON e.project_id = p.id';
          break;
      }

      const breakdown = await mysqlClient.query<
        {
          group_name: string;
          expense_count: number;
          total_amount: number;
          avg_amount: number;
        } & DatabaseRow
      >(`
        SELECT 
          ${groupBySelect},
          COUNT(*) as expense_count,
          SUM(e.amount) as total_amount,
          AVG(e.amount) as avg_amount
        FROM tblexpenses e
        ${joinClause}
        WHERE 1=1 ${dateFilter}
        GROUP BY ${groupByColumn}
        ORDER BY total_amount DESC
      `);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                group_by: groupBy,
                general_stats: generalStats,
                breakdown: breakdown
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
