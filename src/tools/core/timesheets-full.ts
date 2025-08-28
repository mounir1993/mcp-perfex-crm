import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface TimesheetsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interface com project_id simulado
interface TimesheetRow extends DatabaseRow {
  id: number;
  task_id: number;
  task_name: string;
  project_id: number;
  project_name: string;
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

export const timesheetsFullTools: TimesheetsTool[] = [
  {
    name: 'get_timesheets_advanced',
    description: 'Listar registros de tempo com funcionalidades completas (project_id simulado)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        staff_id: { type: 'number', description: 'Filtrar por colaborador' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        task_id: { type: 'number', description: 'Filtrar por tarefa' },
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
          COALESCE(t.rel_id, 0) as project_id, -- Simular project_id usando rel_id da tarefa
          COALESCE(p.name, 'Sem Projeto') as project_name,
          ts.staff_id,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          ts.start_time,
          ts.end_time,
          TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 as duration,
          ts.hourly_rate,
          CASE 
            WHEN ts.note LIKE '%[BILLABLE: Sim]%' THEN 1 
            ELSE 0 
          END as billable,
          CASE 
            WHEN ts.note LIKE '%[BILLED: Sim]%' THEN 1 
            ELSE 0 
          END as billed,
          ts.note as description,
          ts.start_time
        FROM tbltaskstimers ts
        LEFT JOIN tbltasks t ON ts.task_id = t.id
        LEFT JOIN tblprojects p ON t.rel_id = p.id AND t.rel_type = 'project'
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.staff_id) {
        sql += ' AND ts.staff_id = ?';
        params.push(args.staff_id);
      }

      if (args?.project_id) {
        sql += ' AND t.rel_id = ? AND t.rel_type = "project"';
        params.push(args.project_id);
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

      if (args?.billable_only) {
        sql += ' AND ts.note LIKE "%[BILLABLE: Sim]%"';
      }

      if (args?.billed_status === 'billed') {
        sql += ' AND ts.note LIKE "%[BILLED: Sim]%"';
      } else if (args?.billed_status === 'unbilled') {
        sql += ' AND ts.note NOT LIKE "%[BILLED: Sim]%"';
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
                timesheets: timesheets.map((ts) => ({
                  id: ts.id,
                  task: {
                    id: ts.task_id,
                    name: ts.task_name
                  },
                  project: {
                    id: ts.project_id,
                    name: ts.project_name
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
    name: 'mark_timesheet_billed',
    description: 'Marcar entrada de tempo como faturada',
    inputSchema: {
      type: 'object',
      properties: {
        timesheet_id: { type: 'number', description: 'ID da entrada de tempo' },
        invoice_id: { type: 'number', description: 'ID da fatura (opcional)' }
      },
      required: ['timesheet_id']
    },
    handler: async (args, mysqlClient) => {
      const { timesheet_id, invoice_id } = args;

      // Verificar se entrada existe
      const timesheet = await mysqlClient.queryOne<
        {
          id: number;
          note: string;
        } & DatabaseRow
      >('SELECT id, note FROM tbltaskstimers WHERE id = ?', [timesheet_id]);

      if (!timesheet) {
        throw new Error('Entrada de tempo não encontrada');
      }

      // Adicionar marcação de faturado na nota
      let updatedNote = timesheet.note;

      // Remover marcação existente se houver
      updatedNote = updatedNote.replace(/\s*\[BILLED:[^\]]*\]/g, '');

      // Adicionar nova marcação
      const billedInfo = invoice_id ? ` [BILLED: Sim - Fatura #${invoice_id}]` : ' [BILLED: Sim]';
      updatedNote += billedInfo;

      await mysqlClient.query<ResultSetHeader>('UPDATE tbltaskstimers SET note = ? WHERE id = ?', [
        updatedNote,
        timesheet_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Entrada marcada como faturada',
                timesheet_id,
                invoice_id: invoice_id || null
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
    name: 'bulk_mark_billed',
    description: 'Marcar múltiplas entradas como faturadas',
    inputSchema: {
      type: 'object',
      properties: {
        timesheet_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs das entradas de tempo'
        },
        project_id: { type: 'number', description: 'Marcar todas as entradas do projeto' },
        staff_id: { type: 'number', description: 'Marcar todas as entradas do funcionário' },
        date_from: { type: 'string', description: 'Data inicial' },
        date_to: { type: 'string', description: 'Data final' },
        invoice_id: { type: 'number', description: 'ID da fatura' }
      }
    },
    handler: async (args, mysqlClient) => {
      const { timesheet_ids, project_id, staff_id, date_from, date_to, invoice_id } = args;

      let sql = 'SELECT id, note FROM tbltaskstimers WHERE 1=1';
      const params: any[] = [];

      if (timesheet_ids && timesheet_ids.length > 0) {
        sql += ` AND id IN (${timesheet_ids.map(() => '?').join(',')})`;
        params.push(...timesheet_ids);
      } else {
        // Filtros em lote
        if (project_id) {
          sql +=
            ' AND task_id IN (SELECT id FROM tbltasks WHERE rel_id = ? AND rel_type = "project")';
          params.push(project_id);
        }

        if (staff_id) {
          sql += ' AND staff_id = ?';
          params.push(staff_id);
        }

        if (date_from) {
          sql += ' AND DATE(start_time) >= ?';
          params.push(date_from);
        }

        if (date_to) {
          sql += ' AND DATE(start_time) <= ?';
          params.push(date_to);
        }

        // Apenas não faturadas
        sql += ' AND note NOT LIKE "%[BILLED: Sim]%"';
      }

      const timesheets = await mysqlClient.query<
        {
          id: number;
          note: string;
        } & DatabaseRow
      >(sql, params);

      if (timesheets.length === 0) {
        throw new Error('Nenhuma entrada encontrada para marcar como faturada');
      }

      // Atualizar cada entrada
      let updatedCount = 0;
      for (const timesheet of timesheets) {
        let updatedNote = timesheet.note;

        // Remover marcação existente
        updatedNote = updatedNote.replace(/\s*\[BILLED:[^\]]*\]/g, '');

        // Adicionar nova marcação
        const billedInfo = invoice_id ? ` [BILLED: Sim - Fatura #${invoice_id}]` : ' [BILLED: Sim]';
        updatedNote += billedInfo;

        await mysqlClient.query<ResultSetHeader>(
          'UPDATE tbltaskstimers SET note = ? WHERE id = ?',
          [updatedNote, timesheet.id]
        );

        updatedCount++;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `${updatedCount} entradas marcadas como faturadas`,
                updated_count: updatedCount,
                invoice_id: invoice_id || null
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
    name: 'timesheet_billing_report',
    description: 'Relatório de faturação de horas',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        date_from: { type: 'string', description: 'Data inicial' },
        date_to: { type: 'string', description: 'Data final' },
        group_by: {
          type: 'string',
          enum: ['project', 'staff', 'month'],
          description: 'Agrupar por'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const { project_id, staff_id, date_from, date_to, group_by = 'project' } = args;

      const baseSql = `
        SELECT 
          COUNT(*) as total_entries,
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60) as total_hours,
          SUM(CASE WHEN ts.note LIKE '%[BILLABLE: Sim]%' THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as billable_hours,
          SUM(CASE WHEN ts.note LIKE '%[BILLED: Sim]%' THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 ELSE 0 END) as billed_hours,
          SUM(TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate) as total_value,
          SUM(CASE WHEN ts.note LIKE '%[BILLABLE: Sim]%' THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate ELSE 0 END) as billable_value,
          SUM(CASE WHEN ts.note LIKE '%[BILLED: Sim]%' THEN TIMESTAMPDIFF(MINUTE, ts.start_time, ts.end_time) / 60 * ts.hourly_rate ELSE 0 END) as billed_value
      `;

      let fromSql = `
        FROM tbltaskstimers ts
        LEFT JOIN tbltasks t ON ts.task_id = t.id
        LEFT JOIN tblprojects p ON t.rel_id = p.id AND t.rel_type = 'project'
        LEFT JOIN tblstaff s ON ts.staff_id = s.staffid
        WHERE ts.end_time IS NOT NULL
      `;

      const params: any[] = [];

      // Filtros
      if (project_id) {
        fromSql += ' AND t.rel_id = ? AND t.rel_type = "project"';
        params.push(project_id);
      }

      if (staff_id) {
        fromSql += ' AND ts.staff_id = ?';
        params.push(staff_id);
      }

      if (date_from) {
        fromSql += ' AND DATE(ts.start_time) >= ?';
        params.push(date_from);
      }

      if (date_to) {
        fromSql += ' AND DATE(ts.start_time) <= ?';
        params.push(date_to);
      }

      // Group by
      let groupSql = '';
      let selectExtra = '';

      switch (group_by) {
        case 'project':
          selectExtra =
            ', COALESCE(t.rel_id, 0) as project_id, COALESCE(p.name, "Sem Projeto") as project_name';
          groupSql = ' GROUP BY t.rel_id';
          break;
        case 'staff':
          selectExtra = ', ts.staff_id, CONCAT(s.firstname, " ", s.lastname) as staff_name';
          groupSql = ' GROUP BY ts.staff_id';
          break;
        case 'month':
          selectExtra = ', DATE_FORMAT(ts.start_time, "%Y-%m") as month';
          groupSql = ' GROUP BY DATE_FORMAT(ts.start_time, "%Y-%m")';
          break;
      }

      const finalSql = baseSql + selectExtra + fromSql + groupSql + ' ORDER BY total_hours DESC';
      const results = await mysqlClient.query(finalSql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                group_by,
                filters: { project_id, staff_id, date_from, date_to },
                results,
                summary: {
                  total_entries: results.reduce((sum: number, r: any) => sum + r.total_entries, 0),
                  total_hours: results.reduce((sum: number, r: any) => sum + r.total_hours, 0),
                  billable_hours: results.reduce(
                    (sum: number, r: any) => sum + r.billable_hours,
                    0
                  ),
                  billed_hours: results.reduce((sum: number, r: any) => sum + r.billed_hours, 0),
                  total_value: results.reduce((sum: number, r: any) => sum + r.total_value, 0),
                  billable_value: results.reduce(
                    (sum: number, r: any) => sum + r.billable_value,
                    0
                  ),
                  billed_value: results.reduce((sum: number, r: any) => sum + r.billed_value, 0)
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
