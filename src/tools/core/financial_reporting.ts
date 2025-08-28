import { MySQLClient } from '../../mysql-client.js';
import { DatabaseRow } from '../../types/mysql.js';

export interface FinancialReportingTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries

export const financialReportingTools: FinancialReportingTool[] = [
  {
    name: 'profit_loss_statement',
    description: 'Relatório de Demonstração de Resultados (DRE)',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        format: {
          type: 'string',
          enum: ['summary', 'detailed', 'comparative'],
          description: 'Formato do relatório'
        },
        compare_previous_period: { type: 'boolean', description: 'Comparar com período anterior' }
      }
    },
    handler: async (args, mysqlClient) => {
      const dateFrom =
        args?.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateTo = args?.date_to || new Date().toISOString().split('T')[0];
      const format = args?.format || 'summary';
      const comparePrevious = args?.compare_previous_period || false;

      // Calcular período anterior para comparação se solicitado
      let prevDateFrom = null;
      let prevDateTo = null;

      if (comparePrevious) {
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        const periodDays = Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        prevDateTo = new Date(startDate);
        prevDateTo.setDate(prevDateTo.getDate() - 1);
        prevDateFrom = new Date(prevDateTo);
        prevDateFrom.setDate(prevDateFrom.getDate() - periodDays);
      }

      // RECEITAS - Faturas pagas
      const revenueQuery = `
        SELECT 
          'Receita de Vendas' as account_name,
          COALESCE(SUM(CASE WHEN i.status = 4 AND i.date BETWEEN ? AND ? THEN i.total ELSE 0 END), 0) as current_amount
        FROM tblinvoices i
      `;

      const revenueResult = await mysqlClient.queryOne<
        {
          account_name: string;
          current_amount: number;
        } & DatabaseRow
      >(revenueQuery, [dateFrom, dateTo]);

      // DESPESAS - Expenses
      const expenseQuery = `
        SELECT 
          'Despesas Operacionais' as account_name,
          COALESCE(SUM(CASE WHEN e.date BETWEEN ? AND ? THEN e.amount ELSE 0 END), 0) as current_amount
        FROM tblexpenses e
      `;

      const expenseResult = await mysqlClient.queryOne<
        {
          account_name: string;
          current_amount: number;
        } & DatabaseRow
      >(expenseQuery, [dateFrom, dateTo]);

      // Receitas por categoria/projeto se formato detalhado
      let detailedRevenue = [];
      let detailedExpenses = [];

      if (format === 'detailed') {
        // Receitas por projeto
        detailedRevenue = await mysqlClient.query<
          {
            category: string;
            amount: number;
          } & DatabaseRow
        >(
          `
          SELECT 
            COALESCE(p.name, 'Sem Projeto') as category,
            COALESCE(SUM(i.total), 0) as amount
          FROM tblinvoices i
          LEFT JOIN tblprojects p ON i.project_id = p.id
          WHERE i.status = 4 AND i.date BETWEEN ? AND ?
          GROUP BY p.id, p.name
          ORDER BY amount DESC
        `,
          [dateFrom, dateTo]
        );

        // Despesas por categoria
        detailedExpenses = await mysqlClient.query<
          {
            category: string;
            amount: number;
          } & DatabaseRow
        >(
          `
          SELECT 
            COALESCE(e.category, 'Outras Despesas') as category,
            COALESCE(SUM(e.amount), 0) as amount
          FROM tblexpenses e
          WHERE e.date BETWEEN ? AND ?
          GROUP BY e.category
          ORDER BY amount DESC
        `,
          [dateFrom, dateTo]
        );
      }

      // Dados do período anterior se solicitado
      let previousPeriodData = null;
      if (comparePrevious && prevDateFrom && prevDateTo) {
        const prevRevenue = await mysqlClient.queryOne<{ current_amount: number } & DatabaseRow>(
          revenueQuery,
          [prevDateFrom.toISOString().split('T')[0], prevDateTo.toISOString().split('T')[0]]
        );

        const prevExpense = await mysqlClient.queryOne<{ current_amount: number } & DatabaseRow>(
          expenseQuery,
          [prevDateFrom.toISOString().split('T')[0], prevDateTo.toISOString().split('T')[0]]
        );

        previousPeriodData = {
          revenue: prevRevenue?.current_amount || 0,
          expenses: prevExpense?.current_amount || 0,
          profit: (prevRevenue?.current_amount || 0) - (prevExpense?.current_amount || 0)
        };
      }

      const currentRevenue = revenueResult?.current_amount || 0;
      const currentExpenses = expenseResult?.current_amount || 0;
      const currentProfit = currentRevenue - currentExpenses;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: {
                  from: dateFrom,
                  to: dateTo
                },
                format,
                summary: {
                  revenue: currentRevenue,
                  expenses: currentExpenses,
                  gross_profit: currentProfit,
                  profit_margin:
                    currentRevenue > 0
                      ? ((currentProfit / currentRevenue) * 100).toFixed(2) + '%'
                      : '0%'
                },
                detailed_breakdown:
                  format === 'detailed'
                    ? {
                        revenue_by_category: detailedRevenue,
                        expenses_by_category: detailedExpenses
                      }
                    : null,
                comparison: comparePrevious
                  ? {
                      previous_period: previousPeriodData,
                      growth: {
                        revenue_growth:
                          previousPeriodData && previousPeriodData.revenue > 0
                            ? (
                                ((currentRevenue - previousPeriodData.revenue) /
                                  previousPeriodData.revenue) *
                                100
                              ).toFixed(2) + '%'
                            : 'N/A',
                        expense_growth:
                          previousPeriodData && previousPeriodData.expenses > 0
                            ? (
                                ((currentExpenses - previousPeriodData.expenses) /
                                  previousPeriodData.expenses) *
                                100
                              ).toFixed(2) + '%'
                            : 'N/A',
                        profit_growth:
                          previousPeriodData && previousPeriodData.profit !== 0
                            ? (
                                ((currentProfit - previousPeriodData.profit) /
                                  Math.abs(previousPeriodData.profit)) *
                                100
                              ).toFixed(2) + '%'
                            : 'N/A'
                      }
                    }
                  : null
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
    name: 'cash_flow_statement',
    description: 'Relatório de Fluxo de Caixa',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        granularity: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Granularidade do relatório'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const dateFrom =
        args?.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateTo = args?.date_to || new Date().toISOString().split('T')[0];
      const granularity = args?.granularity || 'monthly';

      // Definir formato de agrupamento baseado na granularidade
      let dateFormat = '';
      switch (granularity) {
        case 'daily':
          dateFormat = '%Y-%m-%d';
          break;
        case 'weekly':
          dateFormat = '%Y-%u';
          break;
        case 'monthly':
        default:
          dateFormat = '%Y-%m';
          break;
      }

      // ENTRADAS DE CAIXA (Pagamentos recebidos)
      const inflows = await mysqlClient.query<
        {
          period: string;
          inflow_amount: number;
          payment_count: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          DATE_FORMAT(p.date, '${dateFormat}') as period,
          COALESCE(SUM(p.amount), 0) as inflow_amount,
          COUNT(*) as payment_count
        FROM tblinvoicepaymentrecords p
        WHERE p.date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(p.date, '${dateFormat}')
        ORDER BY period ASC
      `,
        [dateFrom, dateTo]
      );

      // SAÍDAS DE CAIXA (Despesas pagas)
      const outflows = await mysqlClient.query<
        {
          period: string;
          outflow_amount: number;
          expense_count: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          DATE_FORMAT(e.date, '${dateFormat}') as period,
          COALESCE(SUM(e.amount), 0) as outflow_amount,
          COUNT(*) as expense_count
        FROM tblexpenses e
        WHERE e.date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(e.date, '${dateFormat}')
        ORDER BY period ASC
      `,
        [dateFrom, dateTo]
      );

      // Combinar dados de entrada e saída por período
      const periodsMap = new Map();

      inflows.forEach((inflow) => {
        periodsMap.set(inflow.period, {
          period: inflow.period,
          inflows: inflow.inflow_amount,
          outflows: 0,
          net_cash_flow: inflow.inflow_amount,
          payment_count: inflow.payment_count,
          expense_count: 0
        });
      });

      outflows.forEach((outflow) => {
        const existing = periodsMap.get(outflow.period) || {
          period: outflow.period,
          inflows: 0,
          outflows: 0,
          net_cash_flow: 0,
          payment_count: 0,
          expense_count: 0
        };

        existing.outflows = outflow.outflow_amount;
        existing.expense_count = outflow.expense_count;
        existing.net_cash_flow = existing.inflows - outflow.outflow_amount;

        periodsMap.set(outflow.period, existing);
      });

      const cashFlowData = Array.from(periodsMap.values()).sort((a, b) =>
        a.period.localeCompare(b.period)
      );

      // Calcular saldo acumulado
      let cumulativeBalance = 0;
      const cashFlowWithBalance = cashFlowData.map((period) => {
        cumulativeBalance += period.net_cash_flow;
        return {
          ...period,
          cumulative_balance: cumulativeBalance
        };
      });

      // Resumo do período
      const totalInflows = cashFlowData.reduce((sum, period) => sum + period.inflows, 0);
      const totalOutflows = cashFlowData.reduce((sum, period) => sum + period.outflows, 0);
      const netCashFlow = totalInflows - totalOutflows;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: {
                  from: dateFrom,
                  to: dateTo
                },
                granularity,
                summary: {
                  total_inflows: totalInflows,
                  total_outflows: totalOutflows,
                  net_cash_flow: netCashFlow,
                  cash_flow_ratio:
                    totalOutflows > 0 ? (totalInflows / totalOutflows).toFixed(2) : 'N/A'
                },
                cash_flow_periods: cashFlowWithBalance,
                insights: {
                  positive_periods: cashFlowData.filter((p) => p.net_cash_flow > 0).length,
                  negative_periods: cashFlowData.filter((p) => p.net_cash_flow < 0).length,
                  average_monthly_flow:
                    cashFlowData.length > 0 ? (netCashFlow / cashFlowData.length).toFixed(2) : '0'
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
    name: 'accounts_receivable_aging',
    description: 'Relatório de Contas a Receber por Vencimento',
    inputSchema: {
      type: 'object',
      properties: {
        as_of_date: { type: 'string', description: 'Data de referência (YYYY-MM-DD)' },
        client_id: { type: 'number', description: 'Filtrar por cliente específico' },
        include_paid: { type: 'boolean', description: 'Incluir faturas pagas' }
      }
    },
    handler: async (args, mysqlClient) => {
      const asOfDate = args?.as_of_date || new Date().toISOString().split('T')[0];
      const clientId = args?.client_id;
      const includePaid = args?.include_paid || false;

      let clientFilter = '';
      const params: any[] = [asOfDate];

      if (clientId) {
        clientFilter = 'AND i.clientid = ?';
        params.push(clientId);
      }

      const statusFilter = includePaid ? '' : 'AND i.status IN (1, 2, 3, 5)'; // Excluir apenas status 4 (Paga)

      // Relatório de aging
      const agingData = await mysqlClient.query<
        {
          client_id: number;
          client_name: string;
          invoice_count: number;
          current_0_30: number;
          days_31_60: number;
          days_61_90: number;
          days_over_90: number;
          total_outstanding: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          i.clientid as client_id,
          c.company as client_name,
          COUNT(i.id) as invoice_count,
          COALESCE(SUM(
            CASE 
              WHEN DATEDIFF(?, i.duedate) BETWEEN 0 AND 30 THEN (i.total - COALESCE(paid.amount, 0))
              ELSE 0 
            END
          ), 0) as current_0_30,
          COALESCE(SUM(
            CASE 
              WHEN DATEDIFF(?, i.duedate) BETWEEN 31 AND 60 THEN (i.total - COALESCE(paid.amount, 0))
              ELSE 0 
            END
          ), 0) as days_31_60,
          COALESCE(SUM(
            CASE 
              WHEN DATEDIFF(?, i.duedate) BETWEEN 61 AND 90 THEN (i.total - COALESCE(paid.amount, 0))
              ELSE 0 
            END
          ), 0) as days_61_90,
          COALESCE(SUM(
            CASE 
              WHEN DATEDIFF(?, i.duedate) > 90 THEN (i.total - COALESCE(paid.amount, 0))
              ELSE 0 
            END
          ), 0) as days_over_90,
          COALESCE(SUM(i.total - COALESCE(paid.amount, 0)), 0) as total_outstanding
        FROM tblinvoices i
        LEFT JOIN tblclients c ON i.clientid = c.userid
        LEFT JOIN (
          SELECT 
            invoiceid,
            SUM(amount) as amount
          FROM tblinvoicepaymentrecords
          GROUP BY invoiceid
        ) paid ON i.id = paid.invoiceid
        WHERE i.duedate <= ? ${statusFilter} ${clientFilter}
        GROUP BY i.clientid, c.company
        HAVING total_outstanding > 0
        ORDER BY total_outstanding DESC
      `,
        [...params, ...params, ...params, ...params, ...params]
      );

      // Resumo geral
      const totalCurrent = agingData.reduce((sum, client) => sum + client.current_0_30, 0);
      const total31_60 = agingData.reduce((sum, client) => sum + client.days_31_60, 0);
      const total61_90 = agingData.reduce((sum, client) => sum + client.days_61_90, 0);
      const totalOver90 = agingData.reduce((sum, client) => sum + client.days_over_90, 0);
      const grandTotal = totalCurrent + total31_60 + total61_90 + totalOver90;

      // Top devedores
      const topDebtors = agingData.slice(0, 10);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                as_of_date: asOfDate,
                client_filter: clientId,
                summary: {
                  total_outstanding: grandTotal,
                  current_0_30_days: totalCurrent,
                  days_31_60: total31_60,
                  days_61_90: total61_90,
                  over_90_days: totalOver90,
                  aging_analysis: {
                    current_percentage:
                      grandTotal > 0 ? ((totalCurrent / grandTotal) * 100).toFixed(1) + '%' : '0%',
                    overdue_percentage:
                      grandTotal > 0
                        ? (((total31_60 + total61_90 + totalOver90) / grandTotal) * 100).toFixed(
                            1
                          ) + '%'
                        : '0%',
                    high_risk_percentage:
                      grandTotal > 0 ? ((totalOver90 / grandTotal) * 100).toFixed(1) + '%' : '0%'
                  }
                },
                client_breakdown: agingData,
                top_10_debtors: topDebtors,
                collection_priority: agingData
                  .filter((client) => client.days_over_90 > 0)
                  .sort((a, b) => b.days_over_90 - a.days_over_90)
                  .slice(0, 5)
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
    name: 'expense_analysis',
    description: 'Análise detalhada de despesas por categoria e período',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        category: { type: 'string', description: 'Filtrar por categoria específica' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        compare_periods: { type: 'boolean', description: 'Comparar com período anterior' }
      }
    },
    handler: async (args, mysqlClient) => {
      const dateFrom =
        args?.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateTo = args?.date_to || new Date().toISOString().split('T')[0];
      const category = args?.category;
      const projectId = args?.project_id;
      const comparePeriods = args?.compare_periods || false;

      let categoryFilter = '';
      let projectFilter = '';
      const params: any[] = [dateFrom, dateTo];

      if (category) {
        categoryFilter = 'AND e.category = ?';
        params.push(category);
      }

      if (projectId) {
        projectFilter = 'AND e.project_id = ?';
        params.push(projectId);
      }

      // Despesas por categoria
      const expensesByCategory = await mysqlClient.query<
        {
          category: string;
          total_amount: number;
          expense_count: number;
          avg_amount: number;
          percentage: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COALESCE(e.category, 'Sem Categoria') as category,
          COALESCE(SUM(e.amount), 0) as total_amount,
          COUNT(*) as expense_count,
          COALESCE(AVG(e.amount), 0) as avg_amount,
          (COALESCE(SUM(e.amount), 0) / (
            SELECT COALESCE(SUM(amount), 1) 
            FROM tblexpenses 
            WHERE date BETWEEN ? AND ? ${categoryFilter} ${projectFilter}
          ) * 100) as percentage
        FROM tblexpenses e
        WHERE e.date BETWEEN ? AND ? ${categoryFilter} ${projectFilter}
        GROUP BY e.category
        ORDER BY total_amount DESC
      `,
        [...params, ...params]
      );

      // Despesas mensais para tendência
      const monthlyTrend = await mysqlClient.query<
        {
          month: string;
          total_amount: number;
          expense_count: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          DATE_FORMAT(e.date, '%Y-%m') as month,
          COALESCE(SUM(e.amount), 0) as total_amount,
          COUNT(*) as expense_count
        FROM tblexpenses e
        WHERE e.date BETWEEN ? AND ? ${categoryFilter} ${projectFilter}
        GROUP BY DATE_FORMAT(e.date, '%Y-%m')
        ORDER BY month ASC
      `,
        params
      );

      // Top despesas individuais
      const topExpenses = await mysqlClient.query<
        {
          id: number;
          expense_name: string;
          category: string;
          amount: number;
          date: Date;
          project_name: string;
        } & DatabaseRow
      >(
        `
        SELECT 
          e.id,
          e.expense_name,
          COALESCE(e.category, 'Sem Categoria') as category,
          e.amount,
          e.date,
          COALESCE(p.name, 'Sem Projeto') as project_name
        FROM tblexpenses e
        LEFT JOIN tblprojects p ON e.project_id = p.id
        WHERE e.date BETWEEN ? AND ? ${categoryFilter} ${projectFilter}
        ORDER BY e.amount DESC
        LIMIT 10
      `,
        params
      );

      // Comparação com período anterior se solicitado
      let previousPeriodData = null;
      if (comparePeriods) {
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        const periodDays = Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const prevEndDate = new Date(startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - periodDays);

        const prevParams = [
          prevStartDate.toISOString().split('T')[0],
          prevEndDate.toISOString().split('T')[0]
        ];

        if (category) prevParams.push(category);
        if (projectId) prevParams.push(projectId);

        const prevExpenses = await mysqlClient.queryOne<
          {
            total_amount: number;
            expense_count: number;
          } & DatabaseRow
        >(
          `
          SELECT 
            COALESCE(SUM(e.amount), 0) as total_amount,
            COUNT(*) as expense_count
          FROM tblexpenses e
          WHERE e.date BETWEEN ? AND ? ${categoryFilter} ${projectFilter}
        `,
          prevParams
        );

        previousPeriodData = prevExpenses;
      }

      // Calcular totais
      const totalAmount = expensesByCategory.reduce((sum, cat) => sum + cat.total_amount, 0);
      const totalCount = expensesByCategory.reduce((sum, cat) => sum + cat.expense_count, 0);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: {
                  from: dateFrom,
                  to: dateTo
                },
                filters: {
                  category,
                  project_id: projectId
                },
                summary: {
                  total_expenses: totalAmount,
                  expense_count: totalCount,
                  average_expense: totalCount > 0 ? (totalAmount / totalCount).toFixed(2) : '0',
                  largest_category: expensesByCategory[0]?.category || 'N/A',
                  largest_category_amount: expensesByCategory[0]?.total_amount || 0
                },
                expenses_by_category: expensesByCategory,
                monthly_trend: monthlyTrend,
                top_10_expenses: topExpenses,
                comparison:
                  comparePeriods && previousPeriodData
                    ? {
                        previous_period_total: previousPeriodData.total_amount,
                        previous_period_count: previousPeriodData.expense_count,
                        growth_rate:
                          previousPeriodData.total_amount > 0
                            ? (
                                ((totalAmount - previousPeriodData.total_amount) /
                                  previousPeriodData.total_amount) *
                                100
                              ).toFixed(2) + '%'
                            : 'N/A',
                        count_change:
                          previousPeriodData.expense_count > 0
                            ? (
                                ((totalCount - previousPeriodData.expense_count) /
                                  previousPeriodData.expense_count) *
                                100
                              ).toFixed(2) + '%'
                            : 'N/A'
                      }
                    : null
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
    name: 'revenue_analysis',
    description: 'Análise detalhada de receitas por fonte e período',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        include_recurring: {
          type: 'boolean',
          description: 'Incluir receitas recorrentes (subscriptions)'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const dateFrom =
        args?.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateTo = args?.date_to || new Date().toISOString().split('T')[0];
      const clientId = args?.client_id;
      const projectId = args?.project_id;
      const includeRecurring = args?.include_recurring !== false;

      let clientFilter = '';
      let projectFilter = '';
      const params: any[] = [dateFrom, dateTo];

      if (clientId) {
        clientFilter = 'AND i.clientid = ?';
        params.push(clientId);
      }

      if (projectId) {
        projectFilter = 'AND i.project_id = ?';
        params.push(projectId);
      }

      // Receitas por cliente
      const revenueByClient = await mysqlClient.query<
        {
          client_id: number;
          client_name: string;
          total_revenue: number;
          invoice_count: number;
          avg_invoice_value: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          i.clientid as client_id,
          c.company as client_name,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN i.total ELSE 0 END), 0) as total_revenue,
          COUNT(CASE WHEN i.status = 4 THEN 1 END) as invoice_count,
          COALESCE(AVG(CASE WHEN i.status = 4 THEN i.total END), 0) as avg_invoice_value
        FROM tblinvoices i
        LEFT JOIN tblclients c ON i.clientid = c.userid
        WHERE i.date BETWEEN ? AND ? ${clientFilter} ${projectFilter}
        GROUP BY i.clientid, c.company
        HAVING total_revenue > 0
        ORDER BY total_revenue DESC
      `,
        params
      );

      // Receitas por projeto
      const revenueByProject = await mysqlClient.query<
        {
          project_id: number;
          project_name: string;
          total_revenue: number;
          invoice_count: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          i.project_id,
          COALESCE(p.name, 'Sem Projeto') as project_name,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN i.total ELSE 0 END), 0) as total_revenue,
          COUNT(CASE WHEN i.status = 4 THEN 1 END) as invoice_count
        FROM tblinvoices i
        LEFT JOIN tblprojects p ON i.project_id = p.id
        WHERE i.date BETWEEN ? AND ? ${clientFilter} ${projectFilter}
        GROUP BY i.project_id, p.name
        HAVING total_revenue > 0
        ORDER BY total_revenue DESC
      `,
        params
      );

      // Tendência mensal
      const monthlyRevenue = await mysqlClient.query<
        {
          month: string;
          total_revenue: number;
          invoice_count: number;
          avg_invoice_value: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          DATE_FORMAT(i.date, '%Y-%m') as month,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN i.total ELSE 0 END), 0) as total_revenue,
          COUNT(CASE WHEN i.status = 4 THEN 1 END) as invoice_count,
          COALESCE(AVG(CASE WHEN i.status = 4 THEN i.total END), 0) as avg_invoice_value
        FROM tblinvoices i
        WHERE i.date BETWEEN ? AND ? ${clientFilter} ${projectFilter}
        GROUP BY DATE_FORMAT(i.date, '%Y-%m')
        ORDER BY month ASC
      `,
        params
      );

      // Receitas recorrentes se incluído
      let recurringRevenue = null;
      if (includeRecurring) {
        recurringRevenue = await mysqlClient.query<
          {
            client_id: number;
            client_name: string;
            subscription_count: number;
            monthly_recurring_revenue: number;
            annual_recurring_revenue: number;
          } & DatabaseRow
        >(
          `
          SELECT 
            s.clientid as client_id,
            c.company as client_name,
            COUNT(*) as subscription_count,
            COALESCE(SUM(
              CASE 
                WHEN s.terms LIKE '%monthly%' THEN 
                  CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(s.terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * s.quantity
                WHEN s.terms LIKE '%quarterly%' THEN 
                  (CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(s.terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * s.quantity) / 3
                WHEN s.terms LIKE '%yearly%' THEN 
                  (CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(s.terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * s.quantity) / 12
                ELSE 0
              END
            ), 0) as monthly_recurring_revenue,
            COALESCE(SUM(
              CASE 
                WHEN s.terms LIKE '%monthly%' THEN 
                  CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(s.terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * s.quantity * 12
                WHEN s.terms LIKE '%quarterly%' THEN 
                  CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(s.terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * s.quantity * 4
                WHEN s.terms LIKE '%yearly%' THEN 
                  CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(s.terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * s.quantity
                ELSE 0
              END
            ), 0) as annual_recurring_revenue
          FROM tblsubscriptions s
          LEFT JOIN tblclients c ON s.clientid = c.userid
          WHERE s.status = 'active' ${clientId ? 'AND s.clientid = ?' : ''}
          GROUP BY s.clientid, c.company
          ORDER BY monthly_recurring_revenue DESC
        `,
          clientId ? [clientId] : []
        );
      }

      // Calcular totais
      const totalRevenue = revenueByClient.reduce((sum, client) => sum + client.total_revenue, 0);
      const totalInvoices = revenueByClient.reduce((sum, client) => sum + client.invoice_count, 0);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: {
                  from: dateFrom,
                  to: dateTo
                },
                filters: {
                  client_id: clientId,
                  project_id: projectId
                },
                summary: {
                  total_revenue: totalRevenue,
                  total_invoices: totalInvoices,
                  average_invoice_value:
                    totalInvoices > 0 ? (totalRevenue / totalInvoices).toFixed(2) : '0',
                  top_client: revenueByClient[0]?.client_name || 'N/A',
                  top_client_revenue: revenueByClient[0]?.total_revenue || 0,
                  client_concentration:
                    revenueByClient.length > 0 && totalRevenue > 0
                      ? (((revenueByClient[0]?.total_revenue || 0) / totalRevenue) * 100).toFixed(
                          1
                        ) + '%'
                      : '0%'
                },
                revenue_by_client: revenueByClient.slice(0, 20),
                revenue_by_project: revenueByProject.slice(0, 15),
                monthly_trend: monthlyRevenue,
                recurring_revenue: includeRecurring
                  ? {
                      summary: {
                        total_mrr:
                          recurringRevenue?.reduce(
                            (sum, r) => sum + r.monthly_recurring_revenue,
                            0
                          ) || 0,
                        total_arr:
                          recurringRevenue?.reduce(
                            (sum, r) => sum + r.annual_recurring_revenue,
                            0
                          ) || 0,
                        total_subscriptions:
                          recurringRevenue?.reduce((sum, r) => sum + r.subscription_count, 0) || 0
                      },
                      by_client: recurringRevenue || []
                    }
                  : null
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
    name: 'balance_sheet_summary',
    description: 'Resumo do Balanço Patrimonial (Assets vs Liabilities)',
    inputSchema: {
      type: 'object',
      properties: {
        as_of_date: { type: 'string', description: 'Data de referência (YYYY-MM-DD)' }
      }
    },
    handler: async (args, mysqlClient) => {
      const asOfDate = args?.as_of_date || new Date().toISOString().split('T')[0];

      // ATIVOS
      // Contas a Receber (Accounts Receivable)
      const accountsReceivable = await mysqlClient.queryOne<
        {
          total_outstanding: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COALESCE(SUM(i.total - COALESCE(paid.amount, 0)), 0) as total_outstanding
        FROM tblinvoices i
        LEFT JOIN (
          SELECT 
            invoiceid,
            SUM(amount) as amount
          FROM tblinvoicepaymentrecords
          WHERE date <= ?
          GROUP BY invoiceid
        ) paid ON i.id = paid.invoiceid
        WHERE i.status IN (1, 2, 3, 5) AND i.date <= ?
        HAVING total_outstanding > 0
      `,
        [asOfDate, asOfDate]
      );

      // Caixa (Cash) - Simplificado baseado em pagamentos recebidos menos despesas
      const cashPosition = await mysqlClient.queryOne<
        {
          cash_balance: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          (COALESCE(
            (SELECT SUM(amount) FROM tblinvoicepaymentrecords WHERE date <= ?), 0
          ) - COALESCE(
            (SELECT SUM(amount) FROM tblexpenses WHERE date <= ?), 0
          )) as cash_balance
      `,
        [asOfDate, asOfDate]
      );

      // PASSIVOS
      // Contas a Pagar (Simplified - usando despesas não pagas/pendentes)
      const unpaidExpenses = await mysqlClient.queryOne<
        {
          total_unpaid: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COALESCE(SUM(e.amount), 0) as total_unpaid
        FROM tblexpenses e
        WHERE e.date <= ? 
        AND (e.billable = 0 OR e.invoiceid IS NULL)
      `,
        [asOfDate]
      );

      // Receita Diferida (Deferred Revenue) - Pagamentos recebidos antecipadamente
      const deferredRevenue = await mysqlClient.queryOne<
        {
          deferred_amount: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COALESCE(SUM(p.amount), 0) as deferred_amount
        FROM tblinvoicepaymentrecords p
        LEFT JOIN tblinvoices i ON p.invoiceid = i.id
        WHERE p.date <= ? 
        AND (i.date > ? OR i.date IS NULL)
      `,
        [asOfDate, asOfDate]
      );

      // Calcular totais
      const totalAssets =
        (accountsReceivable?.total_outstanding || 0) + (cashPosition?.cash_balance || 0);
      const totalLiabilities =
        (unpaidExpenses?.total_unpaid || 0) + (deferredRevenue?.deferred_amount || 0);
      const netWorth = totalAssets - totalLiabilities;

      // Breakdown detalhado
      const assetBreakdown = [
        {
          account: 'Caixa e Equivalentes',
          amount: cashPosition?.cash_balance || 0,
          percentage:
            totalAssets > 0
              ? (((cashPosition?.cash_balance || 0) / totalAssets) * 100).toFixed(1) + '%'
              : '0%'
        },
        {
          account: 'Contas a Receber',
          amount: accountsReceivable?.total_outstanding || 0,
          percentage:
            totalAssets > 0
              ? (((accountsReceivable?.total_outstanding || 0) / totalAssets) * 100).toFixed(1) +
                '%'
              : '0%'
        }
      ];

      const liabilityBreakdown = [
        {
          account: 'Contas a Pagar',
          amount: unpaidExpenses?.total_unpaid || 0,
          percentage:
            totalLiabilities > 0
              ? (((unpaidExpenses?.total_unpaid || 0) / totalLiabilities) * 100).toFixed(1) + '%'
              : '0%'
        },
        {
          account: 'Receita Diferida',
          amount: deferredRevenue?.deferred_amount || 0,
          percentage:
            totalLiabilities > 0
              ? (((deferredRevenue?.deferred_amount || 0) / totalLiabilities) * 100).toFixed(1) +
                '%'
              : '0%'
        }
      ];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                as_of_date: asOfDate,
                balance_sheet_summary: {
                  assets: {
                    total: totalAssets,
                    breakdown: assetBreakdown
                  },
                  liabilities: {
                    total: totalLiabilities,
                    breakdown: liabilityBreakdown
                  },
                  equity: {
                    net_worth: netWorth,
                    debt_to_equity_ratio:
                      totalAssets > 0 ? (totalLiabilities / totalAssets).toFixed(2) : '0'
                  }
                },
                financial_ratios: {
                  current_ratio:
                    totalLiabilities > 0 ? (totalAssets / totalLiabilities).toFixed(2) : 'N/A',
                  cash_ratio:
                    totalLiabilities > 0
                      ? ((cashPosition?.cash_balance || 0) / totalLiabilities).toFixed(2)
                      : 'N/A',
                  working_capital: totalAssets - totalLiabilities
                },
                health_indicators: {
                  liquidity_status: (cashPosition?.cash_balance || 0) > 0 ? 'Positive' : 'Negative',
                  receivables_quality:
                    (accountsReceivable?.total_outstanding || 0) > 0 ? 'Has Outstanding' : 'Clean',
                  financial_stability: netWorth > 0 ? 'Stable' : 'At Risk'
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
    name: 'tax_summary_report',
    description: 'Relatório de Resumo Fiscal para período',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        tax_year: { type: 'number', description: 'Ano fiscal (substitui date_from/date_to)' }
      }
    },
    handler: async (args, mysqlClient) => {
      let dateFrom, dateTo;

      if (args?.tax_year) {
        dateFrom = `${args.tax_year}-01-01`;
        dateTo = `${args.tax_year}-12-31`;
      } else {
        dateFrom =
          args?.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
        dateTo = args?.date_to || new Date().toISOString().split('T')[0];
      }

      // Receitas tributáveis (faturas pagas)
      const taxableRevenue = await mysqlClient.query<
        {
          month: string;
          revenue_amount: number;
          tax_amount: number;
          invoice_count: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          DATE_FORMAT(i.date, '%Y-%m') as month,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN i.subtotal ELSE 0 END), 0) as revenue_amount,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN (i.total - i.subtotal) ELSE 0 END), 0) as tax_amount,
          COUNT(CASE WHEN i.status = 4 THEN 1 END) as invoice_count
        FROM tblinvoices i
        WHERE i.date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(i.date, '%Y-%m')
        ORDER BY month ASC
      `,
        [dateFrom, dateTo]
      );

      // Despesas dedutíveis por categoria
      const deductibleExpenses = await mysqlClient.query<
        {
          category: string;
          total_amount: number;
          expense_count: number;
          tax_deductible: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COALESCE(e.category, 'Outras') as category,
          COALESCE(SUM(e.amount), 0) as total_amount,
          COUNT(*) as expense_count,
          COALESCE(SUM(CASE WHEN e.billable = 0 THEN e.amount ELSE 0 END), 0) as tax_deductible
        FROM tblexpenses e
        WHERE e.date BETWEEN ? AND ?
        GROUP BY e.category
        ORDER BY total_amount DESC
      `,
        [dateFrom, dateTo]
      );

      // Impostos coletados/pagos
      const taxSummary = await mysqlClient.queryOne<
        {
          total_revenue: number;
          total_tax_collected: number;
          total_deductible_expenses: number;
          net_taxable_income: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COALESCE(
            (SELECT SUM(i.subtotal) FROM tblinvoices i WHERE i.status = 4 AND i.date BETWEEN ? AND ?), 0
          ) as total_revenue,
          COALESCE(
            (SELECT SUM(i.total - i.subtotal) FROM tblinvoices i WHERE i.status = 4 AND i.date BETWEEN ? AND ?), 0
          ) as total_tax_collected,
          COALESCE(
            (SELECT SUM(e.amount) FROM tblexpenses e WHERE e.billable = 0 AND e.date BETWEEN ? AND ?), 0
          ) as total_deductible_expenses,
          (
            COALESCE((SELECT SUM(i.subtotal) FROM tblinvoices i WHERE i.status = 4 AND i.date BETWEEN ? AND ?), 0) -
            COALESCE((SELECT SUM(e.amount) FROM tblexpenses e WHERE e.billable = 0 AND e.date BETWEEN ? AND ?), 0)
          ) as net_taxable_income
      `,
        [dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo]
      );

      // Clientes com maior volume para controle fiscal
      const topClientsByRevenue = await mysqlClient.query<
        {
          client_id: number;
          client_name: string;
          total_revenue: number;
          tax_collected: number;
          invoice_count: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          i.clientid as client_id,
          c.company as client_name,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN i.subtotal ELSE 0 END), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN i.status = 4 THEN (i.total - i.subtotal) ELSE 0 END), 0) as tax_collected,
          COUNT(CASE WHEN i.status = 4 THEN 1 END) as invoice_count
        FROM tblinvoices i
        LEFT JOIN tblclients c ON i.clientid = c.userid
        WHERE i.date BETWEEN ? AND ?
        GROUP BY i.clientid, c.company
        HAVING total_revenue > 0
        ORDER BY total_revenue DESC
        LIMIT 10
      `,
        [dateFrom, dateTo]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: {
                  from: dateFrom,
                  to: dateTo,
                  tax_year: args?.tax_year || new Date(dateFrom).getFullYear()
                },
                tax_summary: {
                  gross_revenue: taxSummary?.total_revenue || 0,
                  tax_collected: taxSummary?.total_tax_collected || 0,
                  deductible_expenses: taxSummary?.total_deductible_expenses || 0,
                  net_taxable_income: taxSummary?.net_taxable_income || 0,
                  effective_tax_rate:
                    taxSummary && taxSummary.total_revenue > 0
                      ? ((taxSummary.total_tax_collected / taxSummary.total_revenue) * 100).toFixed(
                          2
                        ) + '%'
                      : '0%'
                },
                monthly_breakdown: taxableRevenue,
                expense_categories: deductibleExpenses,
                top_clients_by_revenue: topClientsByRevenue,
                compliance_notes: {
                  high_volume_clients: topClientsByRevenue.filter((c) => c.total_revenue > 10000)
                    .length,
                  total_transactions: taxableRevenue.reduce(
                    (sum, month) => sum + month.invoice_count,
                    0
                  ),
                  reporting_period_complete: new Date(dateTo) <= new Date()
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
    name: 'financial_kpi_dashboard',
    description: 'Dashboard de KPIs financeiros principais',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['current_month', 'last_month', 'current_quarter', 'last_quarter', 'ytd'],
          description: 'Período para análise'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'current_month';

      let dateFrom, dateTo, previousDateFrom, previousDateTo;
      const now = new Date();

      switch (period) {
        case 'current_month':
          dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          dateTo = now.toISOString().split('T')[0];
          previousDateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            .toISOString()
            .split('T')[0];
          previousDateTo = new Date(now.getFullYear(), now.getMonth(), 0)
            .toISOString()
            .split('T')[0];
          break;
        case 'last_month':
          dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
          dateTo = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
          previousDateFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1)
            .toISOString()
            .split('T')[0];
          previousDateTo = new Date(now.getFullYear(), now.getMonth() - 1, 0)
            .toISOString()
            .split('T')[0];
          break;
        case 'current_quarter': {
          const currentQuarter = Math.floor(now.getMonth() / 3);
          dateFrom = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString().split('T')[0];
          dateTo = now.toISOString().split('T')[0];
          previousDateFrom = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
            .toISOString()
            .split('T')[0];
          previousDateTo = new Date(now.getFullYear(), currentQuarter * 3, 0)
            .toISOString()
            .split('T')[0];
          break;
        }
        case 'ytd':
        default:
          dateFrom = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
          dateTo = now.toISOString().split('T')[0];
          previousDateFrom = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
          previousDateTo = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
          break;
      }

      // Queries separadas e simples para KPIs principais
      const revenueResult = await mysqlClient.queryOne(
        'SELECT COALESCE(SUM(total), 0) as total_revenue FROM tblinvoices WHERE status = 4 AND date BETWEEN ? AND ?',
        [dateFrom, dateTo]
      );

      const expensesResult = await mysqlClient.queryOne(
        'SELECT COALESCE(SUM(amount), 0) as total_expenses FROM tblexpenses WHERE date BETWEEN ? AND ?',
        [dateFrom, dateTo]
      );

      const invoicesResult = await mysqlClient.queryOne(
        'SELECT COUNT(*) as invoice_count, AVG(total) as avg_invoice_value FROM tblinvoices WHERE status = 4 AND date BETWEEN ? AND ?',
        [dateFrom, dateTo]
      );

      const currentKPIs = {
        total_revenue: (revenueResult as any)?.total_revenue || 0,
        total_expenses: (expensesResult as any)?.total_expenses || 0,
        gross_profit:
          ((revenueResult as any)?.total_revenue || 0) -
          ((expensesResult as any)?.total_expenses || 0),
        invoice_count: (invoicesResult as any)?.invoice_count || 0,
        avg_invoice_value: (invoicesResult as any)?.avg_invoice_value || 0,
        outstanding_receivables: 0
      };

      // KPIs simplificados do período anterior
      const prevRevenueResult = await mysqlClient.queryOne(
        'SELECT COALESCE(SUM(total), 0) as total_revenue FROM tblinvoices WHERE status = 4 AND date BETWEEN ? AND ?',
        [previousDateFrom, previousDateTo]
      );

      const prevExpensesResult = await mysqlClient.queryOne(
        'SELECT COALESCE(SUM(amount), 0) as total_expenses FROM tblexpenses WHERE date BETWEEN ? AND ?',
        [previousDateFrom, previousDateTo]
      );

      const previousKPIs = {
        total_revenue: (prevRevenueResult as any)?.total_revenue || 0,
        total_expenses: (prevExpensesResult as any)?.total_expenses || 0,
        gross_profit:
          ((prevRevenueResult as any)?.total_revenue || 0) -
          ((prevExpensesResult as any)?.total_expenses || 0),
        invoice_count: 0
      };

      // Métricas simplificadas de fluxo de caixa
      const cashInflowResult = await mysqlClient.queryOne(
        'SELECT COALESCE(SUM(amount), 0) as cash_inflow FROM tblinvoicepaymentrecords WHERE date BETWEEN ? AND ?',
        [dateFrom, dateTo]
      );

      const cashFlowMetrics = {
        cash_inflow: (cashInflowResult as any)?.cash_inflow || 0,
        cash_outflow: (expensesResult as any)?.total_expenses || 0,
        net_cash_flow:
          ((cashInflowResult as any)?.cash_inflow || 0) -
          ((expensesResult as any)?.total_expenses || 0)
      };

      // Calcular crescimentos
      const revenueGrowth =
        previousKPIs && previousKPIs.total_revenue > 0
          ? (((currentKPIs?.total_revenue || 0) - previousKPIs.total_revenue) /
              previousKPIs.total_revenue) *
            100
          : 0;

      const expenseGrowth =
        previousKPIs && previousKPIs.total_expenses > 0
          ? (((currentKPIs?.total_expenses || 0) - previousKPIs.total_expenses) /
              previousKPIs.total_expenses) *
            100
          : 0;

      const profitGrowth =
        previousKPIs && previousKPIs.gross_profit !== 0
          ? (((currentKPIs?.gross_profit || 0) - previousKPIs.gross_profit) /
              Math.abs(previousKPIs.gross_profit)) *
            100
          : 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period: {
                  name: period,
                  from: dateFrom,
                  to: dateTo
                },
                kpis: {
                  revenue: {
                    current: currentKPIs?.total_revenue || 0,
                    previous: previousKPIs?.total_revenue || 0,
                    growth: revenueGrowth.toFixed(1) + '%',
                    status:
                      revenueGrowth > 0 ? 'positive' : revenueGrowth < 0 ? 'negative' : 'neutral'
                  },
                  expenses: {
                    current: currentKPIs?.total_expenses || 0,
                    previous: previousKPIs?.total_expenses || 0,
                    growth: expenseGrowth.toFixed(1) + '%',
                    status:
                      expenseGrowth < 0 ? 'positive' : expenseGrowth > 0 ? 'negative' : 'neutral'
                  },
                  profit: {
                    current: currentKPIs?.gross_profit || 0,
                    previous: previousKPIs?.gross_profit || 0,
                    growth: profitGrowth.toFixed(1) + '%',
                    margin:
                      currentKPIs && currentKPIs.total_revenue > 0
                        ? ((currentKPIs.gross_profit / currentKPIs.total_revenue) * 100).toFixed(
                            1
                          ) + '%'
                        : '0%',
                    status:
                      profitGrowth > 0 ? 'positive' : profitGrowth < 0 ? 'negative' : 'neutral'
                  },
                  cash_flow: {
                    inflow: cashFlowMetrics?.cash_inflow || 0,
                    outflow: cashFlowMetrics?.cash_outflow || 0,
                    net: cashFlowMetrics?.net_cash_flow || 0,
                    status: (cashFlowMetrics?.net_cash_flow || 0) > 0 ? 'positive' : 'negative'
                  },
                  receivables: {
                    outstanding: currentKPIs?.outstanding_receivables || 0,
                    days_sales_outstanding:
                      currentKPIs && currentKPIs.total_revenue > 0
                        ? Math.round(
                            currentKPIs.outstanding_receivables / (currentKPIs.total_revenue / 30)
                          )
                        : 0
                  },
                  operational: {
                    invoice_count: currentKPIs?.invoice_count || 0,
                    avg_invoice_value: currentKPIs?.avg_invoice_value || 0,
                    revenue_per_invoice:
                      currentKPIs && currentKPIs.invoice_count > 0
                        ? (currentKPIs.total_revenue / currentKPIs.invoice_count).toFixed(2)
                        : '0'
                  }
                },
                alerts: [
                  ...(revenueGrowth < -10 ? ['Receita em declínio significativo'] : []),
                  ...(expenseGrowth > 15 ? ['Crescimento de despesas acima do normal'] : []),
                  ...((currentKPIs?.outstanding_receivables || 0) >
                  (currentKPIs?.total_revenue || 0) * 0.3
                    ? ['Alto valor em contas a receber']
                    : []),
                  ...((cashFlowMetrics?.net_cash_flow || 0) < 0 ? ['Fluxo de caixa negativo'] : [])
                ]
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
