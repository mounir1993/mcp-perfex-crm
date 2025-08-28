import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface SubscriptionsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface SubscriptionRow extends DatabaseRow {
  id: number;
  name: string;
  clientid: number;
  client_name: string;
  status: string;
  status_display: string;
  next_billing_cycle: Date;
  days_to_next_billing: number;
  quantity: number;
  total_paid: number;
}

interface SubscriptionAnalyticsRow extends DatabaseRow {
  total_subscriptions: number;
  active_subscriptions: number;
  cancelled_subscriptions: number;
  trial_subscriptions: number;
  avg_subscription_value: number;
}

export const subscriptionsTools: SubscriptionsTool[] = [
  {
    name: 'get_subscriptions',
    description: 'Listar assinaturas com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        status: {
          type: 'string',
          enum: ['active', 'cancelled', 'expired', 'past_due', 'trialing'],
          description: 'Status da assinatura'
        },
        subscription_type: { type: 'string', description: 'Tipo de assinatura' },
        next_billing_soon: { type: 'boolean', description: 'Próximas cobranças em 7 dias' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          s.id,
          s.name,
          s.description,
          s.clientid,
          c.company as client_name,
          s.status,
          s.quantity,
          0 as tax, -- Campo não existe na BD, usar 0 como padrão
          s.currency,
          s.terms,
          s.date_subscribed,
          s.created,
          s.project_id,
          p.name as project_name,
          s.next_billing_cycle,
          s.ends_at,
          NULL as trial_end, -- Campo não existe na BD
          CASE s.status
            WHEN 'active' THEN 'Ativa'
            WHEN 'cancelled' THEN 'Cancelada'
            WHEN 'expired' THEN 'Expirada'
            WHEN 'past_due' THEN 'Em atraso'
            WHEN 'trialing' THEN 'Período trial'
            ELSE 'Desconhecido'
          END as status_display,
          DATEDIFF(s.next_billing_cycle, CURDATE()) as days_to_next_billing,
          (SELECT COUNT(*) FROM tblinvoices WHERE subscription_id = s.id) as invoice_count,
          (SELECT COALESCE(SUM(total), 0) FROM tblinvoices WHERE subscription_id = s.id AND status = 4) as total_paid
        FROM tblsubscriptions s
        LEFT JOIN tblclients c ON s.clientid = c.userid
        LEFT JOIN tblprojects p ON s.project_id = p.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.client_id) {
        sql += ' AND s.clientid = ?';
        params.push(args.client_id);
      }

      if (args?.status) {
        sql += ' AND s.status = ?';
        params.push(args.status);
      }

      if (args?.subscription_type) {
        sql += ' AND s.name LIKE ?';
        params.push(`%${args.subscription_type}%`);
      }

      if (args?.next_billing_soon) {
        sql +=
          ' AND s.next_billing_cycle BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)';
      }

      sql += ' ORDER BY s.next_billing_cycle ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const subscriptions = await mysqlClient.query<SubscriptionRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                subscriptions,
                pagination: {
                  limit,
                  offset,
                  count: subscriptions.length
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
    name: 'create_subscription',
    description: 'Criar nova assinatura',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        name: { type: 'string', description: 'Nome da assinatura' },
        description: { type: 'string', description: 'Descrição da assinatura' },
        quantity: { type: 'number', description: 'Quantidade (padrão: 1)' },
        currency: { type: 'number', description: 'ID da moeda' },
        billing_cycle: {
          type: 'string',
          enum: ['monthly', 'quarterly', 'yearly'],
          description: 'Ciclo de cobrança'
        },
        amount: { type: 'number', description: 'Valor da assinatura' },
        tax_rate: { type: 'number', description: 'Taxa de imposto (%) - será calculada no código' },
        trial_days: { type: 'number', description: 'Dias de trial (padrão: 0)' },
        project_id: { type: 'number', description: 'Projeto relacionado' }
      },
      required: ['client_id', 'name', 'billing_cycle', 'amount']
    },
    handler: async (args, mysqlClient) => {
      const {
        client_id,
        name,
        description = '',
        quantity = 1,
        currency = 1,
        billing_cycle,
        amount,
        tax_rate = 0,
        trial_days = 0,
        project_id
      } = args;

      // Verificar se cliente existe
      const client = await mysqlClient.queryOne<{ userid: number } & DatabaseRow>(
        'SELECT userid FROM tblclients WHERE userid = ?',
        [client_id]
      );

      if (!client) {
        throw new Error('Cliente não encontrado');
      }

      // Calcular próximo ciclo de cobrança
      const now = new Date();
      const nextBilling = new Date(now);

      switch (billing_cycle) {
        case 'monthly':
          nextBilling.setMonth(nextBilling.getMonth() + 1);
          break;
        case 'quarterly':
          nextBilling.setMonth(nextBilling.getMonth() + 3);
          break;
        case 'yearly':
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          break;
      }

      // Calcular fim do trial se aplicável
      let trialEnd = null;
      if (trial_days > 0) {
        const trial = new Date(now);
        trial.setDate(trial.getDate() + trial_days);
        trialEnd = trial.toISOString().split('T')[0];
        nextBilling.setTime(trial.getTime());
      }

      const planId = `plan_${billing_cycle}_${amount}_${Date.now()}`;
      const terms = `${billing_cycle.charAt(0).toUpperCase() + billing_cycle.slice(1)} - ${amount}`;

      // Calcular valor com imposto (já que não temos coluna tax)
      const taxAmount = (amount * tax_rate) / 100;
      const totalAmount = amount + taxAmount;
      const detailedTerms =
        tax_rate > 0
          ? `${terms} | Valor base: ${amount} | Imposto (${tax_rate}%): ${taxAmount.toFixed(2)} | Total: ${totalAmount.toFixed(2)}`
          : terms;

      const subscriptionId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblsubscriptions (
          name, description, clientid, quantity, currency, terms,
          date_subscribed, created, project_id, next_billing_cycle,
          trial_end, status, stripe_plan_id, description_in_item
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?, ?, ?, ?)
      `,
        [
          name,
          description,
          client_id,
          quantity,
          currency,
          detailedTerms,
          project_id || null,
          nextBilling.toISOString().split('T')[0],
          trialEnd,
          trial_days > 0 ? 'trialing' : 'active',
          planId,
          description || name
        ]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Assinatura criada com sucesso',
                subscription_id: subscriptionId,
                plan_id: planId,
                next_billing_cycle: nextBilling.toISOString().split('T')[0],
                trial_end: trialEnd,
                status: trial_days > 0 ? 'trialing' : 'active',
                tax_info: {
                  base_amount: amount,
                  tax_rate: tax_rate,
                  tax_amount: taxAmount,
                  total_amount: totalAmount
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
    name: 'update_subscription',
    description: 'Atualizar assinatura existente',
    inputSchema: {
      type: 'object',
      properties: {
        subscription_id: { type: 'number', description: 'ID da assinatura' },
        name: { type: 'string', description: 'Nome da assinatura' },
        description: { type: 'string', description: 'Descrição' },
        quantity: { type: 'number', description: 'Quantidade' },
        tax: { type: 'number', description: 'Taxa de imposto' },
        status: {
          type: 'string',
          enum: ['active', 'cancelled', 'expired', 'past_due'],
          description: 'Status da assinatura'
        }
      },
      required: ['subscription_id']
    },
    handler: async (args, mysqlClient) => {
      const { subscription_id, name, description, quantity, tax, status } = args;

      // Verificar se assinatura existe
      const subscription = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tblsubscriptions WHERE id = ?',
        [subscription_id]
      );

      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      const updateFields: string[] = [];
      const updateParams: any[] = [];

      if (name) {
        updateFields.push('name = ?');
        updateParams.push(name);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(description);
      }

      if (quantity !== undefined) {
        updateFields.push('quantity = ?');
        updateParams.push(quantity);
      }

      if (tax !== undefined) {
        updateFields.push('tax = ?');
        updateParams.push(tax);
      }

      if (status) {
        updateFields.push('status = ?');
        updateParams.push(status);

        // Se cancelando, definir data de fim
        if (status === 'cancelled') {
          updateFields.push('ends_at = ?');
          updateParams.push(new Date().toISOString().split('T')[0]);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(subscription_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tblsubscriptions SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Assinatura atualizada com sucesso',
                subscription_id: subscription_id
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
    name: 'cancel_subscription',
    description: 'Cancelar assinatura',
    inputSchema: {
      type: 'object',
      properties: {
        subscription_id: { type: 'number', description: 'ID da assinatura' },
        cancel_immediately: {
          type: 'boolean',
          description: 'Cancelar imediatamente ou no final do período'
        },
        cancellation_reason: { type: 'string', description: 'Motivo do cancelamento' }
      },
      required: ['subscription_id']
    },
    handler: async (args, mysqlClient) => {
      const { subscription_id, cancel_immediately = false, cancellation_reason = '' } = args;

      // Verificar se assinatura existe e está ativa
      const subscription = await mysqlClient.queryOne<
        {
          id: number;
          status: string;
          next_billing_cycle: Date;
          clientid: number;
        } & DatabaseRow
      >('SELECT id, status, next_billing_cycle, clientid FROM tblsubscriptions WHERE id = ?', [
        subscription_id
      ]);

      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      if (subscription.status === 'cancelled') {
        throw new Error('Assinatura já está cancelada');
      }

      let endsAt: string;
      if (cancel_immediately) {
        endsAt = new Date().toISOString().split('T')[0];
      } else {
        endsAt = new Date(subscription.next_billing_cycle).toISOString().split('T')[0];
      }

      await mysqlClient.query<ResultSetHeader>(
        'UPDATE tblsubscriptions SET status = ?, ends_at = ? WHERE id = ?',
        ['cancelled', endsAt, subscription_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Assinatura cancelada com sucesso',
                subscription_id: subscription_id,
                cancellation_type: cancel_immediately ? 'immediate' : 'end_of_period',
                ends_at: endsAt,
                reason: cancellation_reason
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
    name: 'subscription_analytics',
    description: 'Analytics detalhado de assinaturas',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        include_mrr: { type: 'boolean', description: 'Incluir Monthly Recurring Revenue' },
        client_id: { type: 'number', description: 'Filtrar por cliente' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const includeMRR = args?.include_mrr !== false;
      const clientId = args?.client_id;

      let dateFilter = '';
      if (period === 'month') dateFilter = 'AND s.created >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter')
        dateFilter = 'AND s.created >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year') dateFilter = 'AND s.created >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      let clientFilter = '';
      const params: any[] = [];
      if (clientId) {
        clientFilter = 'AND s.clientid = ?';
        params.push(clientId);
      }

      // Estatísticas gerais
      const generalStats = await mysqlClient.queryOne<SubscriptionAnalyticsRow>(
        `
        SELECT 
          COUNT(*) as total_subscriptions,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_subscriptions,
          COUNT(CASE WHEN status = 'trialing' THEN 1 END) as trial_subscriptions,
          AVG(CASE WHEN terms REGEXP '[0-9]+' THEN CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(terms, ' - ', -1), '.', 1) AS UNSIGNED) END) as avg_subscription_value
        FROM tblsubscriptions s
        WHERE 1=1 ${dateFilter} ${clientFilter}
      `,
        params
      );

      // Por status
      const statusBreakdown = await mysqlClient.query<
        {
          status: string;
          count: number;
          percentage: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          status,
          COUNT(*) as count,
          (COUNT(*) / (SELECT COUNT(*) FROM tblsubscriptions WHERE 1=1 ${dateFilter} ${clientFilter}) * 100) as percentage
        FROM tblsubscriptions s
        WHERE 1=1 ${dateFilter} ${clientFilter}
        GROUP BY status
        ORDER BY count DESC
      `,
        params
      );

      // Churn rate (simplificado)
      const churnData = await mysqlClient.queryOne<
        {
          cancelled_this_month: number;
          total_active_start_month: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          COUNT(CASE WHEN status = 'cancelled' AND ends_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) THEN 1 END) as cancelled_this_month,
          COUNT(CASE WHEN status = 'active' OR (status = 'cancelled' AND ends_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN 1 END) as total_active_start_month
        FROM tblsubscriptions s
        WHERE 1=1 ${clientFilter}
      `,
        clientId ? [clientId] : []
      );

      const churnRate =
        churnData && churnData.total_active_start_month > 0
          ? ((churnData.cancelled_this_month / churnData.total_active_start_month) * 100).toFixed(2)
          : '0.00';

      // MRR Analytics (simplificado)
      let mrrAnalytics = null;
      if (includeMRR) {
        const mrrData = await mysqlClient.queryOne<
          {
            current_mrr: number;
            contributing_subscriptions: number;
          } & DatabaseRow
        >(
          `
          SELECT 
            SUM(
              CASE 
                WHEN terms LIKE '%monthly%' THEN 
                  CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * quantity
                WHEN terms LIKE '%quarterly%' THEN 
                  (CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * quantity) / 3
                WHEN terms LIKE '%yearly%' THEN 
                  (CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(terms, ' - ', -1), '.', 1) AS DECIMAL(10,2)) * quantity) / 12
                ELSE 0
              END
            ) as current_mrr,
            COUNT(*) as contributing_subscriptions
          FROM tblsubscriptions s
          WHERE status = 'active' ${clientFilter}
        `,
          clientId ? [clientId] : []
        );

        const arr = (mrrData?.current_mrr || 0) * 12;

        mrrAnalytics = {
          mrr: mrrData?.current_mrr || 0,
          arr: arr,
          contributing_subscriptions: mrrData?.contributing_subscriptions || 0,
          mrr_per_customer:
            mrrData && mrrData.contributing_subscriptions > 0
              ? (mrrData.current_mrr / mrrData.contributing_subscriptions).toFixed(2)
              : '0'
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                overall_analytics: generalStats,
                subscription_status: statusBreakdown,
                churn_analytics: {
                  churn_rate: churnRate + '%',
                  cancelled_this_month: churnData?.cancelled_this_month || 0,
                  retention_rate: (100 - parseFloat(churnRate)).toFixed(2) + '%'
                },
                mrr_analytics: mrrAnalytics,
                insights: {
                  health_score:
                    parseFloat(churnRate) < 5
                      ? 'healthy'
                      : parseFloat(churnRate) < 10
                        ? 'warning'
                        : 'critical',
                  growth_trend: 'stable'
                }
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
