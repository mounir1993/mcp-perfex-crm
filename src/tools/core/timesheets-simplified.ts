import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface TimesheetsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interface simplificada sem campos problemáticos
interface TimesheetRow extends DatabaseRow {
  id: number;
  task_id: number;
  staff_id: number;
  start_time: Date;
  end_time: Date;
  duration: number;
  hourly_rate: number;
  description: string;
  date_added: Date;
}

export const timesheetsTools: TimesheetsTool[] = [
  {
    name: 'get_timesheets',
    description: 'Listar entradas de timesheet',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        task_id: { type: 'number', description: 'Filtrar por tarefa' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Limite de resultados' },
        offset: { type: 'number', description: 'Offset para paginação' }
      }
    },
    handler: async (args, mysqlClient) => {
      let sql = `
        SELECT 
          ts.id,
          ts.task_id,
          t.name as task_name,
          ts.staff_id,
          s.firstname,
          s.lastname,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          ts.start_time,
          ts.end_time,
          TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 as duration,
          ts.hourly_rate,
          1 as billable, -- Simular campo billable
          0 as billed,   -- Simular campo billed
          ts.note as description,
          ts.start_time
        FROM tbltaskstimers ts
        LEFT JOIN tbltasks t ON ts.task_id = t.id
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.staff_id) {
        sql += ' AND ts.staff_id = ?';
        params.push(args.staff_id);
      }

      if (args?.task_id) {
        sql += ' AND ts.task_id = ?';
        params.push(args.task_id);
      }

      if (args?.date_from) {
        sql += ' AND DATE(ts.start_time) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(ts.start_time) <= ?';
        params.push(args.date_to);
      }

      sql += ' ORDER BY ts.start_time DESC';

      if (args?.limit) {
        sql += ' LIMIT ?';
        params.push(args.limit);
        if (args?.offset) {
          sql += ' OFFSET ?';
          params.push(args.offset);
        }
      }

      const timesheets = await mysqlClient.query<TimesheetRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                timesheets: timesheets.map((ts) => ({
                  id: ts.id,
                  task: {
                    id: ts.task_id,
                    name: ts.task_name
                  },
                  staff: {
                    id: ts.staff_id,
                    name: ts.staff_name
                  },
                  start_time: ts.start_time,
                  end_time: ts.end_time,
                  duration_hours: ts.duration,
                  hourly_rate: ts.hourly_rate,
                  billable: ts.billable,
                  billed: ts.billed,
                  total_value: ts.duration * ts.hourly_rate,
                  description: ts.description,
                  date_added: ts.start_time
                })),
                total: timesheets.length
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
    description: 'Iniciar timer para tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário' },
        hourly_rate: { type: 'number', description: 'Valor por hora' },
        billable: { type: 'boolean', description: 'Horário faturável' },
        note: { type: 'string', description: 'Nota/descrição' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id, hourly_rate = 0, billable = true, note = '' } = args;

      // Verificar se já existe timer ativo
      const activeTimer = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        `
        SELECT id FROM tbltaskstimers 
        WHERE task_id = ? AND staff_id = ? AND end_time IS NULL
      `,
        [task_id, staff_id]
      );

      if (activeTimer) {
        throw new Error('Já existe um timer ativo para esta tarefa');
      }

      const timerId = await mysqlClient.executeInsert(
        `
        INSERT INTO tbltaskstimers (
          task_id, staff_id, start_time, hourly_rate, note
        ) VALUES (?, ?, NOW(), ?, ?)
      `,
        [task_id, staff_id, hourly_rate, `${note} [BILLABLE: ${billable ? 'Sim' : 'Não'}]`]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Timer iniciado com sucesso',
                timer_id: timerId,
                task_id,
                staff_id,
                started_at: new Date()
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
    description: 'Parar timer ativo',
    inputSchema: {
      type: 'object',
      properties: {
        timer_id: { type: 'number', description: 'ID do timer' },
        note: { type: 'string', description: 'Nota adicional' }
      },
      required: ['timer_id']
    },
    handler: async (args, mysqlClient) => {
      const { timer_id, note } = args;

      // Verificar se timer existe e está ativo
      const timer = await mysqlClient.queryOne<
        {
          id: number;
          start_time: Date;
          end_time: Date;
        } & DatabaseRow
      >('SELECT id, start_time, end_time FROM tbltaskstimers WHERE id = ?', [timer_id]);

      if (!timer) {
        throw new Error('Timer não encontrado');
      }

      if (timer.end_time) {
        throw new Error('Timer já foi parado');
      }

      await mysqlClient.query<ResultSetHeader>(
        `
        UPDATE tbltaskstimers 
        SET end_time = NOW(), note = CONCAT(note, ' ', ?)
        WHERE id = ?
      `,
        [note || '', timer_id]
      );

      const updatedTimer = await mysqlClient.queryOne<
        {
          id: number;
          start_time: Date;
          end_time: Date;
          duration_minutes: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          id, start_time, end_time,
          TIMESTAMPDIFF(MINUTE, start_time, end_time) as duration_minutes
        FROM tbltaskstimers 
        WHERE id = ?
      `,
        [timer_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Timer parado com sucesso',
                timer_id,
                duration_hours: (updatedTimer?.duration_minutes || 0) / 60,
                start_time: timer.start_time,
                end_time: updatedTimer?.end_time
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
        staff_id: { type: 'number', description: 'ID do funcionário' },
        start_time: { type: 'string', description: 'Hora início (YYYY-MM-DD HH:MM:SS)' },
        end_time: { type: 'string', description: 'Hora fim (YYYY-MM-DD HH:MM:SS)' },
        hourly_rate: { type: 'number', description: 'Valor por hora' },
        billable: { type: 'boolean', description: 'Horário faturável' },
        description: { type: 'string', description: 'Descrição do trabalho' }
      },
      required: ['task_id', 'staff_id', 'start_time', 'end_time']
    },
    handler: async (args, mysqlClient) => {
      const {
        task_id,
        staff_id,
        start_time,
        end_time,
        hourly_rate = 0,
        billable = true,
        description = ''
      } = args;

      // Validar que end_time > start_time
      if (new Date(end_time) <= new Date(start_time)) {
        throw new Error('Hora de fim deve ser posterior à hora de início');
      }

      const timesheetId = await mysqlClient.executeInsert(
        `
        INSERT INTO tbltaskstimers (
          task_id, staff_id, start_time, end_time, hourly_rate, note
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        [
          task_id,
          staff_id,
          start_time,
          end_time,
          hourly_rate,
          `${description} [BILLABLE: ${billable ? 'Sim' : 'Não'}]`
        ]
      );

      const duration =
        (new Date(end_time).getTime() - new Date(start_time).getTime()) / (1000 * 60 * 60);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Entrada de tempo adicionada com sucesso',
                timesheet_id: timesheetId,
                task_id,
                staff_id,
                duration_hours: duration.toFixed(2),
                total_value: (duration * hourly_rate).toFixed(2)
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
    description: 'Resumo de horas trabalhadas',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'ID do funcionário' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' }
      }
    },
    handler: async (args, mysqlClient) => {
      let sql = `
        SELECT 
          COUNT(*) as entries_count,
          SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60) as total_hours,
          SUM(CASE WHEN note LIKE '%[BILLABLE: Sim]%' THEN TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60 ELSE 0 END) as billable_hours,
          SUM(CASE WHEN note LIKE '%[BILLABLE: Não]%' THEN TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60 ELSE 0 END) as non_billable_hours,
          SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time) / 60 * hourly_rate) as total_value,
          AVG(hourly_rate) as avg_hourly_rate
        FROM tbltaskstimers
        WHERE end_time IS NOT NULL
      `;

      const params: any[] = [];

      if (args?.staff_id) {
        sql += ' AND staff_id = ?';
        params.push(args.staff_id);
      }

      if (args?.date_from) {
        sql += ' AND DATE(start_time) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(start_time) <= ?';
        params.push(args.date_to);
      }

      const summary = await mysqlClient.queryOne<
        {
          entries_count: number;
          total_hours: number;
          total_value: number;
          avg_hourly_rate: number;
        } & DatabaseRow
      >(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: {
                  total_entries: summary?.entries_count || 0,
                  total_hours: parseFloat((summary?.total_hours || 0).toFixed(2)),
                  billable_hours: parseFloat((summary?.billable_hours || 0).toFixed(2)),
                  non_billable_hours: parseFloat((summary?.non_billable_hours || 0).toFixed(2)),
                  total_value: parseFloat((summary?.total_value || 0).toFixed(2)),
                  average_hourly_rate: parseFloat((summary?.avg_hourly_rate || 0).toFixed(2)),
                  billable_percentage: summary?.total_hours
                    ? ((summary.billable_hours / summary.total_hours) * 100).toFixed(1) + '%'
                    : '0%'
                },
                filters: {
                  staff_id: args?.staff_id,
                  date_from: args?.date_from,
                  date_to: args?.date_to
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
