import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface TimesheetsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface TimesheetRow extends DatabaseRow {
  id: number;
  task_id: number;
  task_name: string;
  project_id: number;
  project_name: string;
  client_id: number;
  client_name: string;
  staff_id: number;
  staff_name: string;
  start_time: Date;
  end_time: Date;
  duration: number;
  hourly_rate: number;
  billable: number;
  billed: number;
  description: string;
  date_added: Date;
}

interface TimesheetSummaryRow extends DatabaseRow {
  total_hours: number;
  billable_hours: number;
  non_billable_hours: number;
  total_value: number;
  billable_value: number;
  entries_count: number;
}

interface TimesheetStatsRow extends DatabaseRow {
  staff_id: number;
  staff_name: string;
  total_hours: number;
  billable_hours: number;
  hourly_rate: number;
  total_earnings: number;
  entries_count: number;
}

export const timesheetsTools: TimesheetsTool[] = [
  {
    name: 'get_timesheets',
    description: 'Listar registros de tempo com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        staff_id: { type: 'number', description: 'Filtrar por colaborador' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        task_id: { type: 'number', description: 'Filtrar por tarefa' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        billable_only: { type: 'boolean', description: 'Apenas horas faturáveis' },
        billed_status: {
          type: 'string',
          enum: ['all', 'billed', 'unbilled'],
          description: 'Filtrar por status de cobrança'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          ts.id,
          ts.task_id,
          t.name as task_name,
          ts.project_id,
          p.name as project_name,
          p.clientid as client_id,
          c.company as client_name,
          ts.staff_id,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          ts.start_time,
          ts.end_time,
          TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 as duration,
          ts.hourly_rate,
          ts.billable,
          ts.billed,
          ts.description,
          ts.start_time as date_added
        FROM tbltaskstimers ts
        LEFT JOIN tbltasks t ON ts.task_id = t.id
        LEFT JOIN tblprojects p ON ts.project_id = p.id
        LEFT JOIN tblclients c ON p.clientid = c.userid
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.staff_id) {
        sql += ' AND ts.staff_id = ?';
        params.push(args.staff_id);
      }

      if (args?.project_id) {
        sql += ' AND ts.project_id = ?';
        params.push(args.project_id);
      }

      if (args?.task_id) {
        sql += ' AND ts.task_id = ?';
        params.push(args.task_id);
      }

      if (args?.client_id) {
        sql += ' AND p.clientid = ?';
        params.push(args.client_id);
      }

      if (args?.date_from) {
        sql += ' AND DATE(ts.start_time) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(ts.start_time) <= ?';
        params.push(args.date_to);
      }

      if (args?.billable_only) {
        sql += ' AND ts.billable = 1';
      }

      if (args?.billed_status === 'billed') {
        sql += ' AND ts.billed = 1';
      } else if (args?.billed_status === 'unbilled') {
        sql += ' AND ts.billed = 0';
      }

      sql += ' ORDER BY ts.start_time DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const timesheets = await mysqlClient.query<TimesheetRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                timesheets,
                pagination: {
                  limit,
                  offset,
                  count: timesheets.length
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
    name: 'start_timer',
    description: 'Iniciar cronômetro para uma tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do colaborador' },
        description: { type: 'string', description: 'Descrição do trabalho' },
        hourly_rate: { type: 'number', description: 'Taxa horária' },
        billable: { type: 'boolean', description: 'Horas faturáveis (padrão: true)' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id, description = '', hourly_rate = 0, billable = true } = args;

      // Verificar se tarefa existe e obter projeto
      const task = await mysqlClient.queryOne<
        {
          id: number;
          rel_id: number;
          name: string;
        } & DatabaseRow
      >(
        `
        SELECT id, rel_id as project_id, name 
        FROM tbltasks 
        WHERE id = ?
      `,
        [task_id]
      );

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      // Verificar se já existe timer ativo para este colaborador
      const activeTimer = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        `
        SELECT id 
        FROM tbltaskstimers 
        WHERE staff_id = ? AND end_time IS NULL
      `,
        [staff_id]
      );

      if (activeTimer) {
        throw new Error(
          'Colaborador já possui um timer ativo. Pare o timer atual antes de iniciar um novo.'
        );
      }

      // Iniciar novo timer
      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tbltaskstimers (
          task_id, staff_id, project_id, start_time, 
          description, hourly_rate, billable, date_added
        ) VALUES (?, ?, ?, NOW(), ?, ?, ?, NOW())
      `,
        [task_id, staff_id, task.project_id, description, hourly_rate, billable ? 1 : 0]
      );

      const timerId = result[0]?.insertId;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Timer iniciado com sucesso',
                timer_id: timerId,
                task_name: task.name,
                started_at: new Date().toISOString()
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
    name: 'stop_timer',
    description: 'Parar um cronômetro ativo',
    inputSchema: {
      type: 'object',
      properties: {
        timer_id: { type: 'number', description: 'ID do timer (opcional se staff_id fornecido)' },
        staff_id: { type: 'number', description: 'ID do colaborador (para parar timer ativo)' },
        description: { type: 'string', description: 'Atualizar descrição do trabalho' }
      }
    },
    handler: async (args, mysqlClient) => {
      const { timer_id, staff_id, description } = args;

      let timesheetId = timer_id;

      // Se não fornecido timer_id, buscar por staff_id
      if (!timesheetId && staff_id) {
        const activeTimer = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
          `
          SELECT id 
          FROM tbltaskstimers 
          WHERE staff_id = ? AND end_time IS NULL
        `,
          [staff_id]
        );

        if (!activeTimer) {
          throw new Error('Nenhum timer ativo encontrado para este colaborador');
        }

        timesheetId = activeTimer.id;
      }

      if (!timesheetId) {
        throw new Error('timer_id ou staff_id deve ser fornecido');
      }

      // Verificar se timer existe e está ativo
      const timer = await mysqlClient.queryOne<
        {
          id: number;
          start_time: Date;
          end_time: Date | null;
          task_id: number;
        } & DatabaseRow
      >(
        `
        SELECT id, start_time, end_time, task_id
        FROM tbltaskstimers 
        WHERE id = ?
      `,
        [timesheetId]
      );

      if (!timer) {
        throw new Error('Timer não encontrado');
      }

      if (timer.end_time) {
        throw new Error('Timer já foi parado');
      }

      // Parar timer
      const updateFields = ['end_time = NOW()'];
      const updateParams = [];

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(description);
      }

      updateParams.push(timesheetId);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tbltaskstimers SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      // Calcular duração
      const updatedTimer = await mysqlClient.queryOne<
        {
          start_time: Date;
          end_time: Date;
          duration: number;
          hourly_rate: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          start_time,
          end_time,
          TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60 as duration,
          hourly_rate
        FROM tbltaskstimers 
        WHERE id = ?
      `,
        [timesheetId]
      );

      const totalValue = (updatedTimer?.duration || 0) * (updatedTimer?.hourly_rate || 0);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Timer parado com sucesso',
                timer_id: timesheetId,
                duration_hours: updatedTimer?.duration || 0,
                total_value: totalValue,
                stopped_at: updatedTimer?.end_time
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
    name: 'add_timesheet_entry',
    description: 'Adicionar entrada manual de tempo',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do colaborador' },
        start_time: { type: 'string', description: 'Horário de início (YYYY-MM-DD HH:MM:SS)' },
        end_time: { type: 'string', description: 'Horário de fim (YYYY-MM-DD HH:MM:SS)' },
        duration_hours: {
          type: 'number',
          description: 'Duração em horas (alternativa a end_time)'
        },
        description: { type: 'string', description: 'Descrição do trabalho' },
        hourly_rate: { type: 'number', description: 'Taxa horária' },
        billable: { type: 'boolean', description: 'Horas faturáveis (padrão: true)' }
      },
      required: ['task_id', 'staff_id', 'start_time']
    },
    handler: async (args, mysqlClient) => {
      const {
        task_id,
        staff_id,
        start_time,
        end_time,
        duration_hours,
        description = '',
        hourly_rate = 0,
        billable = true
      } = args;

      // Verificar se tarefa existe
      const task = await mysqlClient.queryOne<
        {
          id: number;
          rel_id: number;
          name: string;
        } & DatabaseRow
      >(
        `
        SELECT id, rel_id as project_id, name 
        FROM tbltasks 
        WHERE id = ?
      `,
        [task_id]
      );

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      // Calcular end_time se duration_hours fornecido
      let finalEndTime = end_time;
      if (!finalEndTime && duration_hours) {
        const startDate = new Date(start_time);
        const endDate = new Date(startDate.getTime() + duration_hours * 60 * 60 * 1000);
        finalEndTime = endDate.toISOString().replace('T', ' ').substring(0, 19);
      }

      if (!finalEndTime) {
        throw new Error('end_time ou duration_hours deve ser fornecido');
      }

      // Adicionar entrada
      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tbltaskstimers (
          task_id, staff_id, project_id, start_time, end_time,
          description, hourly_rate, billable, date_added
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
        [
          task_id,
          staff_id,
          task.project_id,
          start_time,
          finalEndTime,
          description,
          hourly_rate,
          billable ? 1 : 0
        ]
      );

      const timesheetId = result[0]?.insertId;

      // Calcular duração e valor
      const duration = await mysqlClient.queryOne<
        {
          duration: number;
        } & DatabaseRow
      >(
        `
        SELECT TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60 as duration
        FROM tbltaskstimers 
        WHERE id = ?
      `,
        [timesheetId]
      );

      const totalValue = (duration?.duration || 0) * hourly_rate;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Entrada de tempo adicionada com sucesso',
                timesheet_id: timesheetId,
                task_name: task.name,
                duration_hours: duration?.duration || 0,
                total_value: totalValue
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
    name: 'update_timesheet_entry',
    description: 'Atualizar entrada de tempo existente',
    inputSchema: {
      type: 'object',
      properties: {
        timesheet_id: { type: 'number', description: 'ID da entrada de tempo' },
        start_time: { type: 'string', description: 'Novo horário de início' },
        end_time: { type: 'string', description: 'Novo horário de fim' },
        description: { type: 'string', description: 'Nova descrição' },
        hourly_rate: { type: 'number', description: 'Nova taxa horária' },
        billable: { type: 'boolean', description: 'Atualizar status de cobrança' }
      },
      required: ['timesheet_id']
    },
    handler: async (args, mysqlClient) => {
      const { timesheet_id, start_time, end_time, description, hourly_rate, billable } = args;

      // Verificar se entrada existe
      const timesheet = await mysqlClient.queryOne<
        {
          id: number;
          billed: number;
        } & DatabaseRow
      >(
        `
        SELECT id, billed 
        FROM tbltaskstimers 
        WHERE id = ?
      `,
        [timesheet_id]
      );

      if (!timesheet) {
        throw new Error('Entrada de tempo não encontrada');
      }

      if (timesheet.billed === 1) {
        throw new Error('Não é possível editar entrada já faturada');
      }

      const updateFields: string[] = [];
      const updateParams: any[] = [];

      if (start_time !== undefined) {
        updateFields.push('start_time = ?');
        updateParams.push(start_time);
      }

      if (end_time !== undefined) {
        updateFields.push('end_time = ?');
        updateParams.push(end_time);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(description);
      }

      if (hourly_rate !== undefined) {
        updateFields.push('hourly_rate = ?');
        updateParams.push(hourly_rate);
      }

      if (billable !== undefined) {
        updateFields.push('billable = ?');
        updateParams.push(billable ? 1 : 0);
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(timesheet_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tbltaskstimers SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Entrada de tempo atualizada com sucesso',
                timesheet_id
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
    name: 'delete_timesheet_entry',
    description: 'Deletar entrada de tempo',
    inputSchema: {
      type: 'object',
      properties: {
        timesheet_id: { type: 'number', description: 'ID da entrada de tempo' }
      },
      required: ['timesheet_id']
    },
    handler: async (args, mysqlClient) => {
      const { timesheet_id } = args;

      // Verificar se entrada existe e pode ser deletada
      const timesheet = await mysqlClient.queryOne<
        {
          id: number;
          billed: number;
        } & DatabaseRow
      >(
        `
        SELECT id, billed 
        FROM tbltaskstimers 
        WHERE id = ?
      `,
        [timesheet_id]
      );

      if (!timesheet) {
        throw new Error('Entrada de tempo não encontrada');
      }

      if (timesheet.billed === 1) {
        throw new Error('Não é possível deletar entrada já faturada');
      }

      await mysqlClient.query<ResultSetHeader>('DELETE FROM tbltaskstimers WHERE id = ?', [
        timesheet_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Entrada de tempo deletada com sucesso',
                timesheet_id
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
    name: 'timesheet_summary',
    description: 'Resumo de horas trabalhadas por período',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'Filtrar por colaborador' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        group_by: {
          type: 'string',
          enum: ['day', 'week', 'month', 'staff', 'project', 'client'],
          description: 'Agrupar resultados por'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const { staff_id, project_id, client_id, date_from, date_to, group_by = 'day' } = args;

      let sql = `
        SELECT 
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60) as total_hours,
          SUM(CASE WHEN ts.billable = 1 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as billable_hours,
          SUM(CASE WHEN ts.billable = 0 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as non_billable_hours,
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate) as total_value,
          SUM(CASE WHEN ts.billable = 1 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate ELSE 0 END) as billable_value,
          COUNT(*) as entries_count
      `;

      let groupByClause = '';
      let fromClause = `
        FROM tbltaskstimers ts
        LEFT JOIN tbltasks t ON ts.task_id = t.id
        LEFT JOIN tblprojects p ON ts.project_id = p.id
        LEFT JOIN tblclients c ON p.clientid = c.userid
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        WHERE ts.end_time IS NOT NULL
      `;

      const params: any[] = [];

      // Filtros
      if (staff_id) {
        fromClause += ' AND ts.staff_id = ?';
        params.push(staff_id);
      }

      if (project_id) {
        fromClause += ' AND ts.project_id = ?';
        params.push(project_id);
      }

      if (client_id) {
        fromClause += ' AND p.clientid = ?';
        params.push(client_id);
      }

      if (date_from) {
        fromClause += ' AND DATE(ts.start_time) >= ?';
        params.push(date_from);
      }

      if (date_to) {
        fromClause += ' AND DATE(ts.start_time) <= ?';
        params.push(date_to);
      }

      // Group by
      switch (group_by) {
        case 'day':
          sql += ', DATE(ts.start_time) as period';
          groupByClause = ' GROUP BY DATE(ts.start_time) ORDER BY period DESC';
          break;
        case 'week':
          sql += ', YEARWEEK(ts.start_time) as period';
          groupByClause = ' GROUP BY YEARWEEK(ts.start_time) ORDER BY period DESC';
          break;
        case 'month':
          sql += ', DATE_FORMAT(ts.start_time, "%Y-%m") as period';
          groupByClause = ' GROUP BY DATE_FORMAT(ts.start_time, "%Y-%m") ORDER BY period DESC';
          break;
        case 'staff':
          sql += ', ts.staff_id, CONCAT(s.firstname, " ", s.lastname) as staff_name';
          groupByClause = ' GROUP BY ts.staff_id ORDER BY total_hours DESC';
          break;
        case 'project':
          sql += ', ts.project_id, p.name as project_name';
          groupByClause = ' GROUP BY ts.project_id ORDER BY total_hours DESC';
          break;
        case 'client':
          sql += ', p.clientid as client_id, c.company as client_name';
          groupByClause = ' GROUP BY p.clientid ORDER BY total_hours DESC';
          break;
      }

      const finalSql = sql + fromClause + groupByClause;
      const summary = await mysqlClient.query<TimesheetSummaryRow>(finalSql, params);

      // Totais gerais
      const totals = await mysqlClient.queryOne<TimesheetSummaryRow>(
        `
        SELECT 
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60) as total_hours,
          SUM(CASE WHEN ts.billable = 1 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as billable_hours,
          SUM(CASE WHEN ts.billable = 0 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as non_billable_hours,
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate) as total_value,
          SUM(CASE WHEN ts.billable = 1 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate ELSE 0 END) as billable_value,
          COUNT(*) as entries_count
        ${fromClause}
      `,
        params
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                group_by,
                filters: { staff_id, project_id, client_id, date_from, date_to },
                summary,
                totals,
                insights: {
                  billable_percentage: totals
                    ? ((totals.billable_hours / totals.total_hours) * 100).toFixed(1) + '%'
                    : '0%',
                  average_hourly_rate: totals
                    ? (totals.total_value / totals.total_hours).toFixed(2)
                    : '0',
                  average_daily_hours: totals
                    ? (totals.total_hours / Math.max(1, summary.length)).toFixed(1)
                    : '0'
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
    name: 'staff_timesheet_stats',
    description: 'Estatísticas de colaboradores por tempo trabalhado',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        department_id: { type: 'number', description: 'Filtrar por departamento' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const departmentId = args?.department_id;

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND ts.start_time >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND ts.start_time >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND ts.start_time >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND ts.start_time >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      let departmentFilter = '';
      const params: any[] = [];
      if (departmentId) {
        departmentFilter = 'AND s.departmentid = ?';
        params.push(departmentId);
      }

      const staffStats = await mysqlClient.query<TimesheetStatsRow>(
        `
        SELECT 
          ts.staff_id,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60) as total_hours,
          SUM(CASE WHEN ts.billable = 1 THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as billable_hours,
          AVG(ts.hourly_rate) as hourly_rate,
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate) as total_earnings,
          COUNT(*) as entries_count
        FROM tbltaskstimers ts
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        WHERE ts.end_time IS NOT NULL ${dateFilter} ${departmentFilter}
        GROUP BY ts.staff_id
        ORDER BY total_hours DESC
      `,
        params
      );

      // Top performers
      const topPerformers = staffStats.slice(0, 5);

      // Comparação de produtividade
      const productivity = await mysqlClient.query<
        {
          staff_id: number;
          staff_name: string;
          avg_hours_per_day: number;
          billable_ratio: number;
          avg_session_duration: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          ts.staff_id,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          AVG(daily_hours.hours_per_day) as avg_hours_per_day,
          AVG(CASE WHEN ts.billable = 1 THEN 1 ELSE 0 END) as billable_ratio,
          AVG(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60) as avg_session_duration
        FROM tbltaskstimers ts
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        LEFT JOIN (
          SELECT 
            staff_id,
            DATE(start_time) as work_date,
            SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60) as hours_per_day
          FROM tbltaskstimers
          WHERE end_time IS NOT NULL ${dateFilter}
          GROUP BY staff_id, DATE(start_time)
        ) daily_hours ON ts.staff_id = daily_hours.staff_id
        WHERE ts.end_time IS NOT NULL ${dateFilter} ${departmentFilter}
        GROUP BY ts.staff_id
        ORDER BY avg_hours_per_day DESC
      `,
        params
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                department_id: departmentId,
                staff_statistics: staffStats,
                top_performers: topPerformers,
                productivity_metrics: productivity,
                insights: {
                  total_staff: staffStats.length,
                  avg_hours_per_staff:
                    staffStats.reduce((sum, s) => sum + s.total_hours, 0) / staffStats.length,
                  highest_earner: staffStats[0]?.staff_name || 'N/A',
                  most_productive: productivity[0]?.staff_name || 'N/A'
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
    name: 'mark_timesheets_as_billed',
    description: 'Marcar entradas de tempo como faturadas',
    inputSchema: {
      type: 'object',
      properties: {
        timesheet_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs das entradas de tempo'
        },
        invoice_id: { type: 'number', description: 'ID da fatura associada' },
        project_id: {
          type: 'number',
          description: 'Marcar todas as entradas não faturadas do projeto'
        },
        date_from: { type: 'string', description: 'Data inicial para faturamento em lote' },
        date_to: { type: 'string', description: 'Data final para faturamento em lote' }
      }
    },
    handler: async (args, mysqlClient) => {
      const { timesheet_ids, invoice_id, project_id, date_from, date_to } = args;

      let updateSql = 'UPDATE tbltaskstimers SET billed = 1';
      const params: any[] = [];

      if (invoice_id) {
        updateSql += ', invoice_id = ?';
        params.push(invoice_id);
      }

      updateSql += ' WHERE billed = 0';

      if (timesheet_ids && timesheet_ids.length > 0) {
        updateSql += ` AND id IN (${timesheet_ids.map(() => '?').join(',')})`;
        params.push(...timesheet_ids);
      } else {
        // Faturamento em lote por critérios
        if (project_id) {
          updateSql += ' AND project_id = ?';
          params.push(project_id);
        }

        if (date_from) {
          updateSql += ' AND DATE(start_time) >= ?';
          params.push(date_from);
        }

        if (date_to) {
          updateSql += ' AND DATE(start_time) <= ?';
          params.push(date_to);
        }
      }

      // Contar quantas entradas serão afetadas
      const countSql = updateSql
        .replace(
          'UPDATE tbltaskstimers SET billed = 1',
          'SELECT COUNT(*) as count FROM tbltaskstimers'
        )
        .replace(/, invoice_id = \?/, '');
      const countParams = invoice_id ? params.slice(1) : params;

      const countResult = await mysqlClient.queryOne<{ count: number } & DatabaseRow>(
        countSql,
        countParams
      );
      const affectedCount = countResult?.count || 0;

      if (affectedCount === 0) {
        throw new Error('Nenhuma entrada de tempo encontrada para marcar como faturada');
      }

      // Executar atualização
      await mysqlClient.query<ResultSetHeader>(updateSql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `${affectedCount} entradas de tempo marcadas como faturadas`,
                affected_entries: affectedCount,
                invoice_id: invoice_id || null
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
