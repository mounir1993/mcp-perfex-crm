import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface TaskAssignmentsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

export const taskAssignmentsAdvancedTools: TaskAssignmentsTool[] = [
  {
    name: 'get_task_assignments_with_primary',
    description: 'Listar atribuições de tarefas com informação de responsável primário',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'Filtrar por tarefa' },
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        primary_only: { type: 'boolean', description: 'Apenas responsáveis primários' }
      }
    },
    handler: async (args, mysqlClient) => {
      let sql = `
        SELECT 
          ta.id,
          ta.taskid as task_id,
          t.name as task_name,
          ta.staffid as staff_id,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          s.email as staff_email,
          CASE 
            WHEN t.description LIKE CONCAT('%[PRIMARY: ', CONCAT(s.firstname, ' ', s.lastname), ']%') 
            THEN 1 
            ELSE 0 
          END as is_primary,
          ta.assigned_from,
          DATE(ta.date_assigned) as date_assigned
        FROM tbltask_assigned ta
        LEFT JOIN tbltasks t ON ta.taskid = t.id
        LEFT JOIN tblstaff s ON ta.staffid = s.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.task_id) {
        sql += ' AND ta.taskid = ?';
        params.push(args.task_id);
      }

      if (args?.staff_id) {
        sql += ' AND ta.staffid = ?';
        params.push(args.staff_id);
      }

      if (args?.primary_only) {
        sql +=
          ' AND t.description LIKE CONCAT("%[PRIMARY: ", CONCAT(s.firstname, " ", s.lastname), "]%")';
      }

      sql += ' ORDER BY ta.taskid, is_primary DESC, s.firstname';

      const assignments = await mysqlClient.query(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                assignments: assignments.map((a: any) => ({
                  id: a.id,
                  task: {
                    id: a.task_id,
                    name: a.task_name
                  },
                  staff: {
                    id: a.staff_id,
                    name: a.staff_name,
                    email: a.staff_email
                  },
                  is_primary: a.is_primary === 1,
                  assigned_from: a.assigned_from,
                  date_assigned: a.date_assigned
                })),
                total: assignments.length
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
    name: 'set_primary_assignee',
    description: 'Definir responsável primário de uma tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário para ser primário' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id } = args;

      // Verificar se tarefa existe
      const task = await mysqlClient.queryOne<
        {
          id: number;
          description: string;
        } & DatabaseRow
      >('SELECT id, description FROM tbltasks WHERE id = ?', [task_id]);

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      // Verificar se funcionário está atribuído à tarefa
      const assignment = await mysqlClient.queryOne(
        'SELECT id FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
        [task_id, staff_id]
      );

      if (!assignment) {
        throw new Error('Funcionário não está atribuído a esta tarefa');
      }

      // Obter nome do funcionário
      const staff = await mysqlClient.queryOne<
        {
          name: string;
        } & DatabaseRow
      >('SELECT CONCAT(firstname, " ", lastname) as name FROM tblstaff WHERE staffid = ?', [
        staff_id
      ]);

      if (!staff) {
        throw new Error('Funcionário não encontrado');
      }

      // Remover marcação primária existente
      let newDescription = task.description.replace(/\n\n\[PRIMARY: .*?\]$/g, '');

      // Adicionar nova marcação primária
      newDescription += `\n\n[PRIMARY: ${staff.name}]`;

      // Atualizar descrição da tarefa
      await mysqlClient.query<ResultSetHeader>('UPDATE tbltasks SET description = ? WHERE id = ?', [
        newDescription,
        task_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `${staff.name} definido como responsável primário`,
                task_id,
                primary_staff: {
                  id: staff_id,
                  name: staff.name
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
    name: 'bulk_assign_tasks_with_primary',
    description: 'Atribuição em massa de tarefas com responsáveis primários',
    inputSchema: {
      type: 'object',
      properties: {
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'number' },
              staff_ids: { type: 'array', items: { type: 'number' } },
              primary_staff_id: { type: 'number' }
            },
            required: ['task_id', 'staff_ids']
          },
          description: 'Lista de atribuições'
        },
        replace_existing: {
          type: 'boolean',
          description: 'Substituir atribuições existentes (padrão: false)'
        }
      },
      required: ['assignments']
    },
    handler: async (args, mysqlClient) => {
      const { assignments, replace_existing = false } = args;
      const results = [];

      for (const assignment of assignments) {
        const { task_id, staff_ids, primary_staff_id } = assignment;

        try {
          // Verificar se tarefa existe
          const task = await mysqlClient.queryOne('SELECT id FROM tbltasks WHERE id = ?', [
            task_id
          ]);

          if (!task) {
            results.push({
              task_id,
              success: false,
              error: 'Tarefa não encontrada'
            });
            continue;
          }

          // Remover atribuições existentes se solicitado
          if (replace_existing) {
            await mysqlClient.query('DELETE FROM tbltask_assigned WHERE taskid = ?', [task_id]);
          }

          // Adicionar novas atribuições
          const addedStaff = [];
          for (const staff_id of staff_ids) {
            // Verificar se já não está atribuído
            const existing = await mysqlClient.queryOne(
              'SELECT id FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
              [task_id, staff_id]
            );

            if (!existing) {
              await mysqlClient.executeInsert(
                'INSERT INTO tbltask_assigned (taskid, staffid) VALUES (?, ?)',
                [task_id, staff_id]
              );
              addedStaff.push(staff_id);
            }
          }

          // Definir responsável primário se especificado
          if (primary_staff_id && staff_ids.includes(primary_staff_id)) {
            const staffName = await mysqlClient.queryOne<
              {
                name: string;
              } & DatabaseRow
            >('SELECT CONCAT(firstname, " ", lastname) as name FROM tblstaff WHERE staffid = ?', [
              primary_staff_id
            ]);

            if (staffName) {
              const currentTask = await mysqlClient.queryOne<
                {
                  description: string;
                } & DatabaseRow
              >('SELECT description FROM tbltasks WHERE id = ?', [task_id]);

              let newDesc = currentTask?.description || '';

              // Remover marcação primária existente
              newDesc = newDesc.replace(/\n\n\[PRIMARY: .*?\]$/g, '');

              // Adicionar nova marcação
              newDesc += `\n\n[PRIMARY: ${staffName.name}]`;

              await mysqlClient.query('UPDATE tbltasks SET description = ? WHERE id = ?', [
                newDesc,
                task_id
              ]);
            }
          }

          results.push({
            task_id,
            success: true,
            assigned_count: addedStaff.length,
            primary_staff_id: primary_staff_id || null
          });
        } catch (error) {
          results.push({
            task_id,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: failureCount === 0,
                message: `${successCount} tarefas atribuídas com sucesso, ${failureCount} falharam`,
                summary: {
                  total: results.length,
                  successful: successCount,
                  failed: failureCount
                },
                results
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
    name: 'get_primary_assignments_report',
    description: 'Relatório de responsáveis primários por funcionário',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        include_completed: {
          type: 'boolean',
          description: 'Incluir tarefas completadas (padrão: false)'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const { staff_id, include_completed = false } = args;

      let sql = `
        SELECT 
          s.staffid,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          s.email,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE 
            WHEN t.description LIKE CONCAT('%[PRIMARY: ', CONCAT(s.firstname, ' ', s.lastname), ']%') 
            THEN t.id 
          END) as primary_tasks,
          COUNT(DISTINCT CASE 
            WHEN t.status != 5 AND t.description LIKE CONCAT('%[PRIMARY: ', CONCAT(s.firstname, ' ', s.lastname), ']%') 
            THEN t.id 
          END) as active_primary_tasks,
          AVG(CASE 
            WHEN t.duedate < CURDATE() AND t.status != 5 
            THEN DATEDIFF(CURDATE(), t.duedate) 
          END) as avg_overdue_days
        FROM tblstaff s
        INNER JOIN tbltask_assigned ta ON s.staffid = ta.staffid
        INNER JOIN tbltasks t ON ta.taskid = t.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (staff_id) {
        sql += ' AND s.staffid = ?';
        params.push(staff_id);
      }

      if (!include_completed) {
        sql += ' AND t.status != 5';
      }

      sql += `
        GROUP BY s.staffid, s.firstname, s.lastname, s.email
        ORDER BY primary_tasks DESC, total_tasks DESC
      `;

      const report = await mysqlClient.query(sql, params);

      // Buscar tarefas primárias detalhadas para cada funcionário
      const detailedResults = [];
      for (const staffMember of report) {
        const staff = staffMember as any;
        const primaryTasks = await mysqlClient.query(
          `
          SELECT 
            t.id,
            t.name,
            t.status,
            t.priority,
            t.duedate,
            CASE t.status
              WHEN 1 THEN 'Não Iniciado'
              WHEN 2 THEN 'Em Progresso'
              WHEN 3 THEN 'Testando'
              WHEN 4 THEN 'Aguardando Feedback'
              WHEN 5 THEN 'Completa'
              ELSE 'Desconhecido'
            END as status_name,
            CASE 
              WHEN t.duedate < CURDATE() AND t.status != 5 THEN 'Vencida'
              WHEN t.status = 5 THEN 'Completa'
              ELSE 'No Prazo'
            END as deadline_status
          FROM tbltasks t
          INNER JOIN tbltask_assigned ta ON t.id = ta.taskid
          WHERE ta.staffid = ?
            AND t.description LIKE CONCAT('%[PRIMARY: ', ?, ']%')
            ${!include_completed ? 'AND t.status != 5' : ''}
          ORDER BY t.duedate ASC
        `,
          [staff.staffid, staff.staff_name]
        );

        detailedResults.push({
          staffid: staff.staffid,
          staff_name: staff.staff_name,
          email: staff.email,
          total_tasks: staff.total_tasks,
          primary_tasks: staff.primary_tasks,
          active_primary_tasks: staff.active_primary_tasks,
          avg_overdue_days: staff.avg_overdue_days,
          primary_tasks_details: primaryTasks
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                filters: { staff_id, include_completed },
                report: detailedResults,
                summary: {
                  total_staff: report.length,
                  total_primary_assignments: report.reduce(
                    (sum: number, r: any) => sum + (r.primary_tasks || 0),
                    0
                  ),
                  avg_primary_per_staff:
                    report.length > 0
                      ? (
                          Number(
                            report.reduce((sum: number, r: any) => sum + (r.primary_tasks || 0), 0)
                          ) / report.length
                        ).toFixed(1)
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
  }
];
