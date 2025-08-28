import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface ContractsTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (
    args: Record<string, unknown>,
    mysqlClient: MySQLClient
  ) => Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }>;
}

// Interfaces para os resultados das queries
interface ContractRow extends DatabaseRow {
  id: number;
  subject: string;
  client: number;
  client_name: string;
  datestart: Date;
  dateend: Date;
  contract_type: string;
  contract_value: number;
  signed: number;
  status: string;
  days_until_expiry: number;
}

interface ContractAnalyticsRow extends DatabaseRow {
  total_contracts: number;
  signed_contracts: number;
  expired_contracts: number;
  expiring_soon: number;
  total_value: number;
  avg_value: number;
  avg_duration_days: number;
}

export const contractsTools: ContractsTool[] = [
  {
    name: 'get_contracts',
    description: 'Listar contratos com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        contract_type: { type: 'string', description: 'Filtrar por tipo de contrato' },
        signed_only: { type: 'boolean', description: 'Apenas contratos assinados' },
        expired_only: { type: 'boolean', description: 'Apenas contratos expirados' },
        active_only: { type: 'boolean', description: 'Apenas contratos ativos' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = (args?.limit as number | undefined) ?? 50;
      const offset = (args?.offset as number | undefined) ?? 0;

      let sql = `
        SELECT 
          c.id,
          c.subject,
          c.client,
          cl.company as client_name,
          c.datestart,
          c.dateend,
          c.contract_type,
          c.contract_value,
          c.signed,
          CASE 
            WHEN c.dateend < CURDATE() THEN 'Expirado'
            WHEN c.datestart > CURDATE() THEN 'Não iniciado'
            WHEN c.signed = 1 THEN 'Ativo'
            ELSE 'Pendente assinatura'
          END as status,
          DATEDIFF(c.dateend, CURDATE()) as days_until_expiry
        FROM tblcontracts c
        LEFT JOIN tblclients cl ON c.client = cl.userid
        WHERE c.trash = 0
      `;

      const params: unknown[] = [];

      if (args?.client_id as number | undefined) {
        sql += ' AND c.client = ?';
        params.push(args?.client_id as number);
      }

      if (args?.contract_type as string | undefined) {
        sql += ' AND c.contract_type = ?';
        params.push(args?.contract_type as string);
      }

      if ((args?.signed_only as boolean | undefined) ?? false) {
        sql += ' AND c.signed = 1';
      }

      if ((args?.expired_only as boolean | undefined) ?? false) {
        sql += ' AND c.dateend <= CURDATE()';
      }

      if ((args?.active_only as boolean | undefined) ?? false) {
        sql += ' AND c.signed = 1 AND c.dateend > CURDATE()';
      }

      if (args?.date_from as string | undefined) {
        sql += ' AND DATE(c.datestart) >= ?';
        params.push(args?.date_from as string);
      }

      if (args?.date_to as string | undefined) {
        sql += ' AND DATE(c.datestart) <= ?';
        params.push(args?.date_to as string);
      }

      sql += ' ORDER BY c.dateadded DESC, c.datestart DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const contracts = await mysqlClient.query<ContractRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                contracts,
                pagination: {
                  limit,
                  offset,
                  count: contracts.length
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
    name: 'create_contract',
    description: 'Criar novo contrato',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        subject: { type: 'string', description: 'Assunto do contrato' },
        contract_type: {
          type: 'string',
          description: 'Tipo de contrato: mensal, trimestral, semestral, anual, personalizado'
        },
        contract_value: { type: 'number', description: 'Valor do contrato' },
        start_date: { type: 'string', description: 'Data de início (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'Data de fim (YYYY-MM-DD)' },
        description: { type: 'string', description: 'Descrição breve' },
        content: { type: 'string', description: 'Conteúdo completo do contrato' }
      },
      required: ['client_id', 'subject', 'contract_type', 'start_date', 'end_date']
    },
    handler: async (args, mysqlClient) => {
      const client_id = args?.client_id as number;
      const subject = args?.subject as string;
      const contract_type_string = args?.contract_type as string;
      const contract_value = (args?.contract_value as number | undefined) ?? 0;
      const start_date = args?.start_date as string;
      const end_date = args?.end_date as string;
      const description = (args?.description as string | undefined) ?? '';
      const content = (args?.content as string | undefined) ?? '';

      // Mapear tipos de contrato para valores numéricos
      const contractTypeMap: { [key: string]: number } = {
        mensal: 1,
        monthly: 1,
        trimestral: 2,
        quarterly: 2,
        semestral: 3,
        semiannual: 3,
        anual: 4,
        annual: 4,
        yearly: 4,
        personalizado: 5,
        custom: 5
      };

      const contract_type = contractTypeMap[contract_type_string.toLowerCase()] || 5; // Default: personalizado

      // Verificar se cliente existe
      const client = await mysqlClient.queryOne<{ userid: number } & DatabaseRow>(
        'SELECT userid FROM tblclients WHERE userid = ?',
        [client_id]
      );

      if (!client) {
        throw new Error('Cliente não encontrado');
      }

      // Inserir contrato
      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblcontracts (
          client, subject, contract_type, contract_value,
          datestart, dateend, description, content,
          dateadded, addedfrom, signed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 0)
      `,
        [
          client_id,
          subject,
          contract_type,
          contract_value,
          start_date,
          end_date,
          description,
          content
        ]
      );

      const contractId = result[0]?.insertId;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                contract_id: contractId,
                subject,
                client_id,
                contract_value,
                start_date,
                end_date,
                message: 'Contrato criado com sucesso'
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
    name: 'update_contract',
    description: 'Atualizar contrato existente',
    inputSchema: {
      type: 'object',
      properties: {
        contract_id: { type: 'number', description: 'ID do contrato' },
        subject: { type: 'string', description: 'Assunto do contrato' },
        contract_value: { type: 'number', description: 'Valor do contrato' },
        start_date: { type: 'string', description: 'Data de início (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'Data de fim (YYYY-MM-DD)' },
        description: { type: 'string', description: 'Descrição breve' },
        content: { type: 'string', description: 'Conteúdo completo do contrato' }
      },
      required: ['contract_id']
    },
    handler: async (args, mysqlClient) => {
      const contract_id = args?.contract_id as number;
      const updateFields = { ...args };
      delete updateFields.contract_id;

      // Verificar se contrato existe
      const contract = await mysqlClient.queryOne<{ id: number; signed: number } & DatabaseRow>(
        'SELECT id, signed FROM tblcontracts WHERE id = ?',
        [contract_id]
      );

      if (!contract) {
        throw new Error('Contrato não encontrado');
      }

      if (contract.signed === 1) {
        throw new Error('Não é possível editar contrato já assinado');
      }

      // Construir query de atualização
      const allowedFields = [
        'subject',
        'contract_value',
        'start_date',
        'end_date',
        'description',
        'content'
      ];
      const updateParts: string[] = [];
      const updateValues: unknown[] = [];

      for (const field of allowedFields) {
        if ((updateFields as Record<string, unknown>)[field] !== undefined) {
          let dbField = field;
          if (field === 'start_date') dbField = 'datestart';
          if (field === 'end_date') dbField = 'dateend';

          updateParts.push(`${dbField} = ?`);
          updateValues.push((updateFields as Record<string, unknown>)[field]);
        }
      }

      if (updateParts.length === 0) {
        throw new Error('Nenhum campo para atualizar');
      }

      updateValues.push(contract_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tblcontracts SET ${updateParts.join(', ')} WHERE id = ?`,
        updateValues
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                contract_id,
                message: 'Contrato atualizado com sucesso'
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
    name: 'sign_contract',
    description: 'Assinar contrato - marcar como assinado',
    inputSchema: {
      type: 'object',
      properties: {
        contract_id: { type: 'number', description: 'ID do contrato' },
        signature: { type: 'string', description: 'Assinatura digital ou caminho do ficheiro' },
        signer_name: { type: 'string', description: 'Nome de quem assinou' },
        signer_email: { type: 'string', description: 'Email de quem assinou' }
      },
      required: ['contract_id']
    },
    handler: async (args, mysqlClient) => {
      const contract_id = args?.contract_id as number;
      const signature = (args?.signature as string | undefined) ?? '';
      const signer_name = (args?.signer_name as string | undefined) ?? '';
      const signer_email = (args?.signer_email as string | undefined) ?? '';

      // Verificar se contrato existe e não está assinado
      const contract = await mysqlClient.queryOne<
        {
          id: number;
          signed: number;
          subject: string;
          client: number;
          dateend: Date;
        } & DatabaseRow
      >('SELECT id, signed, subject, client, dateend FROM tblcontracts WHERE id = ?', [
        contract_id
      ]);

      if (!contract) {
        throw new Error('Contrato não encontrado');
      }

      if (contract.signed === 1) {
        throw new Error('Contrato já está assinado');
      }

      // Marcar como assinado
      await mysqlClient.query<ResultSetHeader>(
        `
        UPDATE tblcontracts 
        SET signed = 1, signature = ?, marked_as_signed = 1,
            acceptance_firstname = ?, acceptance_email = ?, acceptance_date = NOW()
        WHERE id = ?
      `,
        [signature, signer_name, signer_email, contract_id]
      );

      // Verificar se está próximo do vencimento (30 dias)
      const daysUntilExpiry = Math.ceil(
        (new Date(contract.dateend).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      const isNearExpiry = daysUntilExpiry <= 30;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                contract_id,
                subject: contract.subject,
                signed_date: new Date().toISOString(),
                signature_provided: !!signature,
                signer_name,
                days_until_expiry: daysUntilExpiry,
                near_expiry_warning: isNearExpiry,
                message: 'Contrato assinado com sucesso'
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
    name: 'contract_analytics',
    description: 'Analytics detalhado de contratos',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year', 'all'],
          description: 'Período para análise'
        },
        group_by: {
          type: 'string',
          enum: ['type', 'client', 'status'],
          description: 'Agrupar resultados por'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = (args?.period as string | undefined) ?? 'year';
      const groupBy = (args?.group_by as string | undefined) ?? 'type';

      let dateFilter = '';
      if (period === 'month') dateFilter = 'AND c.dateadded >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter')
        dateFilter = 'AND c.dateadded >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year')
        dateFilter = 'AND c.dateadded >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      // Estatísticas gerais
      const generalStats = await mysqlClient.queryOne<ContractAnalyticsRow>(`
        SELECT 
          COUNT(*) as total_contracts,
          COUNT(CASE WHEN c.signed = 1 THEN 1 END) as signed_contracts,
          COUNT(CASE WHEN c.dateend <= CURDATE() THEN 1 END) as expired_contracts,
          COUNT(CASE WHEN c.dateend BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as expiring_soon,
          COALESCE(SUM(c.contract_value), 0) as total_value,
          COALESCE(AVG(c.contract_value), 0) as avg_value,
          AVG(DATEDIFF(c.dateend, c.datestart)) as avg_duration_days
        FROM tblcontracts c
        WHERE c.trash = 0 ${dateFilter}
      `);

      // Breakdown por grupo
      let groupByColumn = '';
      let groupBySelect = '';
      let joinClause = '';

      switch (groupBy) {
        case 'type':
          groupByColumn = 'c.contract_type';
          groupBySelect = 'c.contract_type as group_name';
          joinClause = '';
          break;
        case 'client':
          groupByColumn = 'c.client';
          groupBySelect = 'cl.company as group_name';
          joinClause = 'LEFT JOIN tblclients cl ON c.client = cl.userid';
          break;
        case 'status':
          groupByColumn =
            'CASE WHEN c.signed = 1 AND c.dateend > CURDATE() THEN "Ativo" WHEN c.signed = 1 AND c.dateend <= CURDATE() THEN "Expirado" ELSE "Pendente" END';
          groupBySelect =
            'CASE WHEN c.signed = 1 AND c.dateend > CURDATE() THEN "Ativo" WHEN c.signed = 1 AND c.dateend <= CURDATE() THEN "Expirado" ELSE "Pendente" END as group_name';
          joinClause = '';
          break;
      }

      const breakdown = await mysqlClient.query<
        {
          group_name: string;
          contract_count: number;
          total_value: number;
          avg_value: number;
          signed_count: number;
        } & DatabaseRow
      >(`
        SELECT 
          ${groupBySelect},
          COUNT(*) as contract_count,
          COALESCE(SUM(c.contract_value), 0) as total_value,
          COALESCE(AVG(c.contract_value), 0) as avg_value,
          COUNT(CASE WHEN c.signed = 1 THEN 1 END) as signed_count
        FROM tblcontracts c
        ${joinClause}
        WHERE c.trash = 0 ${dateFilter}
        GROUP BY ${groupByColumn}
        ORDER BY total_value DESC
      `);

      // Contratos a expirar (próximos 30 dias)
      const expiringContracts = await mysqlClient.query<
        {
          id: number;
          subject: string;
          client_name: string;
          days_until_expiry: number;
          contract_value: number;
        } & DatabaseRow
      >(`
        SELECT 
          c.id,
          c.subject,
          cl.company as client_name,
          DATEDIFF(c.dateend, CURDATE()) as days_until_expiry,
          c.contract_value
        FROM tblcontracts c
        LEFT JOIN tblclients cl ON c.client = cl.userid
        WHERE c.signed = 1 
          AND c.dateend > CURDATE() 
          AND c.dateend <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ORDER BY days_until_expiry ASC
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
                breakdown: breakdown,
                expiring_contracts: expiringContracts,
                alerts: {
                  contracts_expiring_soon: expiringContracts.length,
                  total_value_at_risk: expiringContracts.reduce(
                    (sum: number, c) => sum + (c.contract_value as number),
                    0
                  )
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
