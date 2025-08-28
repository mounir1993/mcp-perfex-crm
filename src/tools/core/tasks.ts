import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface TasksTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

export const tasksTools: TasksTool[] = [
  {
    name: 'get_tasks',
    description: 'Listar tarefas com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        status: {
          type: 'number',
          description:
            'Status (1=Não Iniciado, 2=Em Progresso, 3=Testando, 4=Aguardando Feedback, 5=Completa)'
        },
        priority: {
          type: 'number',
          description: 'Prioridade (1=Baixa, 2=Normal, 3=Alta, 4=Urgente)'
        },
        rel_type: {
          type: 'string',
          description: 'Tipo de relação (project, invoice, estimate, etc.)'
        },
        rel_id: { type: 'number', description: 'ID da relação' },
        assigned_to: { type: 'number', description: 'ID do funcionário responsável' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        overdue_only: { type: 'boolean', description: 'Apenas tarefas vencidas' },
        my_tasks: { type: 'boolean', description: 'Apenas minhas tarefas' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;
      const status = args?.status;
      const priority = args?.priority;
      const relType = args?.rel_type;
      const relId = args?.rel_id;
      const assignedTo = args?.assigned_to;
      const dateFrom = args?.date_from;
      const dateTo = args?.date_to;
      const overdueOnly = args?.overdue_only;
      const myTasks = args?.my_tasks;

      let sql = `
        SELECT 
          t.id,
          t.name,
          t.description,
          t.priority,
          t.status,
          t.startdate,
          t.duedate,
          t.dateadded,
          t.rel_type, t.rel_id,
          '' as tags, CASE t.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Testando'
            WHEN 4 THEN 'Aguardando Feedback'
            WHEN 5 THEN 'Completa'
            ELSE 'Desconhecido'
          END as status_name, CASE t.priority
            WHEN 1 THEN 'Baixa'
            WHEN 2 THEN 'Normal'
            WHEN 3 THEN 'Alta'
            WHEN 4 THEN 'Urgente'
            ELSE 'Não Definida'
          END as priority_name, CASE 
            WHEN t.duedate < CURDATE() AND t.status != 5 THEN 'Vencida'
            WHEN t.status = 5 THEN 'Completa'
            ELSE 'No Prazo'
          END as deadline_status, DATEDIFF(t.duedate, CURDATE()) as days_to_deadline,
          (SELECT COUNT(*) FROM tbltask_assigned WHERE taskid = t.id) as assignees_count,
          (SELECT GROUP_CONCAT(CONCAT(s.firstname, ' ', s.lastname) SEPARATOR ', ') 
           FROM tbltask_assigned ta 
           LEFT JOIN tblstaff s ON ta.staffid = s.staffid 
           WHERE ta.taskid = t.id) as assignees_names, CASE t.rel_type
            WHEN 'project' THEN (SELECT name FROM tblprojects WHERE id = t.rel_id)
            WHEN 'invoice' THEN (SELECT CONCAT('Fatura #', number) FROM tblinvoices WHERE id = t.rel_id)
            WHEN 'estimate' THEN (SELECT CONCAT('Orçamento #', number) FROM tblestimates WHERE id = t.rel_id)
            WHEN 'customer' THEN (SELECT company FROM tblclients WHERE userid = t.rel_id)
            ELSE 'N/A'
          END as related_to_name
        FROM tbltasks t
        WHERE 1=1
      `;

      const params: any[] = [];

      if (status !== undefined) {
        sql += ' AND t.status = ?';
        params.push(status);
      }

      if (priority !== undefined) {
        sql += ' AND t.priority = ?';
        params.push(priority);
      }

      if (relType) {
        sql += ' AND t.rel_type = ?';
        params.push(relType);
      }

      if (relId) {
        sql += ' AND t.rel_id = ?';
        params.push(relId);
      }

      if (assignedTo) {
        sql += ' AND EXISTS (SELECT 1 FROM tbltask_assigned WHERE taskid = t.id AND staffid = ?)';
        params.push(assignedTo);
      }

      if (dateFrom) {
        sql += ' AND t.startdate >= ?';
        params.push(dateFrom);
      }

      if (dateTo) {
        sql += ' AND t.startdate <= ?';
        params.push(dateTo);
      }

      if (overdueOnly) {
        sql += ' AND t.duedate < CURDATE() AND t.status != 5';
      }

      if (myTasks && assignedTo) {
        // Filtro já aplicado acima
      }

      sql += ' ORDER BY t.priority DESC, t.duedate ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const tasks = await mysqlClient.query(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tasks,
                pagination: {
                  limit,
                  offset,
                  count: tasks.length
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
    name: 'get_task',
    description: 'Obter tarefa completa com detalhes, comentários e anexos',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' }
      },
      required: ['task_id']
    },
    handler: async (args, mysqlClient) => {
      const taskId = args?.task_id;
      if (!taskId) {
        throw new Error('task_id é obrigatório');
      }

      const sql = `
        SELECT 
          t.*,
          CASE t.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Testando'
            WHEN 4 THEN 'Aguardando Feedback'
            WHEN 5 THEN 'Completa'
            ELSE 'Desconhecido'
          END as status_name, CASE t.priority
            WHEN 1 THEN 'Baixa'
            WHEN 2 THEN 'Normal'
            WHEN 3 THEN 'Alta'
            WHEN 4 THEN 'Urgente'
            ELSE 'Não Definida'
          END as priority_name, DATEDIFF(t.duedate, CURDATE()) as days_to_deadline, CASE t.rel_type
            WHEN 'project' THEN (SELECT name FROM tblprojects WHERE id = t.rel_id)
            WHEN 'invoice' THEN (SELECT CONCAT('Fatura #', number) FROM tblinvoices WHERE id = t.rel_id)
            WHEN 'estimate' THEN (SELECT CONCAT('Orçamento #', number) FROM tblestimates WHERE id = t.rel_id)
            WHEN 'customer' THEN (SELECT company FROM tblclients WHERE userid = t.rel_id)
            ELSE 'N/A'
          END as related_to_name
        FROM tbltasks t
        WHERE t.id = ?
      `;

      const task = await mysqlClient.queryOne(sql, [taskId]);

      if (!task) {
        return {
          content: [
            {
              type: 'text',
              text: 'Tarefa não encontrada'
            }
          ]
        };
      }

      // Buscar responsáveis
      const assigneesSql = `
        SELECT 
          ta.staffid,
          s.firstname,
          s.lastname,
          s.email
        FROM tbltask_assigned ta
        LEFT JOIN tblstaff s ON ta.staffid = s.staffid
        WHERE ta.taskid = ?
      `;
      const assignees = await mysqlClient.query(assigneesSql, [taskId]);

      // Buscar comentários
      const commentsSql = `
        SELECT 
          tc.id,
          tc.content,
          tc.dateadded,
          tc.staffid,
          s.firstname,
          s.lastname
        FROM tbltask_comments tc
        LEFT JOIN tblstaff s ON tc.staffid = s.staffid
        WHERE tc.taskid = ?
        ORDER BY tc.dateadded DESC
      `;
      const comments = await mysqlClient.query(commentsSql, [taskId]);

      // Buscar anexos
      const attachmentsSql = `
        SELECT 
          f.id,
          f.file_name, f.filetype,
          f.dateadded,
          f.staffid,
          s.firstname,
          s.lastname
        FROM tblfiles f
        LEFT JOIN tblstaff s ON f.staffid = s.staffid
        WHERE f.rel_type = 'task' AND f.rel_id = ?
        ORDER BY f.dateadded DESC
      `;
      const attachments = await mysqlClient.query(attachmentsSql, [taskId]);

      // Buscar tempo registrado
      const timeLogsSql = `
        SELECT 
          tt.id,
          tt.start_time, tt.end_time, TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time), tt.note,
          tt.staff_id, s.firstname,
          s.lastname
        FROM tbltaskstimers tt
        LEFT JOIN tblstaff s ON tt.staff_id = s.staffid
        WHERE tt.task_id = ?
        ORDER BY tt.start_time DESC
      `;
      const timeLogs = await mysqlClient.query(timeLogsSql, [taskId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                task: Object.assign({}, task, {
                  assignees,
                  comments,
                  attachments,
                  time_logs: timeLogs
                })
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
    name: 'create_task',
    description: 'Criar nova tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome da tarefa' },
        description: { type: 'string', description: 'Descrição da tarefa' },
        priority: {
          type: 'number',
          description: 'Prioridade (1=Baixa, 2=Normal, 3=Alta, 4=Urgente)'
        },
        start_date: { type: 'string', description: 'Data de início (YYYY-MM-DD)' },
        due_date: { type: 'string', description: 'Data limite (YYYY-MM-DD)' },
        rel_type: { type: 'string', description: 'Tipo de relação (project, customer, etc.)' },
        rel_id: { type: 'number', description: 'ID da relação' },
        assignees: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs dos responsáveis'
        },
        tags: {
          type: 'string',
          description: 'Tags separadas por vírgula'
        },
        hourly_rate: { type: 'number', description: 'Valor por hora' },
        billable: { type: 'boolean', description: 'Se é faturável' }
      },
      required: ['name']
    },
    handler: async (args, mysqlClient) => {
      const {
        name,
        description,
        priority = 2,
        start_date,
        due_date,
        rel_type,
        rel_id,
        assignees,
        hourly_rate,
        billable = false,
        tags
      } = args;

      const startDate = start_date || new Date().toISOString().split('T')[0];
      const dueDate =
        due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Inserir tarefa
      const taskSql = `
        INSERT INTO tbltasks (
          name, description, priority, startdate, duedate, rel_type, rel_id,
          hourly_rate, billable, status, dateadded, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), 0)
      `;

      const taskId = await mysqlClient.executeInsert(taskSql, [
        name,
        description || '',
        priority,
        startDate,
        dueDate,
        rel_type || '',
        rel_id || null,
        hourly_rate || 0,
        billable ? 1 : 0
      ]);

      // Adicionar tags se fornecidas (armazenar na descrição como workaround)
      if (tags) {
        const currentDesc = await mysqlClient.queryOne<{ description: string } & DatabaseRow>(
          'SELECT description FROM tbltasks WHERE id = ?',
          [taskId]
        );
        const newDesc = currentDesc?.description
          ? `${currentDesc.description}\n\n[TAGS: ${tags}]`
          : `[TAGS: ${tags}]`;
        await mysqlClient.query('UPDATE tbltasks SET description = ? WHERE id = ?', [
          newDesc,
          taskId
        ]);
      }

      // Adicionar responsáveis se fornecidos
      if (assignees && assignees.length > 0) {
        for (const assigneeId of assignees) {
          await mysqlClient.query('INSERT INTO tbltask_assigned (taskid, staffid) VALUES (?, ?)', [
            taskId,
            assigneeId
          ]);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Tarefa criada com sucesso',
                task_id: taskId
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
    name: 'update_task',
    description: 'Atualizar tarefa existente',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        name: { type: 'string', description: 'Novo nome' },
        description: { type: 'string', description: 'Nova descrição' },
        status: { type: 'number', description: 'Novo status' },
        priority: { type: 'number', description: 'Nova prioridade' },
        due_date: { type: 'string', description: 'Nova data limite' },
        tags: { type: 'string', description: 'Novas tags' }
      },
      required: ['task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, name, description, status, priority, due_date, tags } = args;

      // Verificar se tarefa existe
      const task = await mysqlClient.queryOne('SELECT id FROM tbltasks WHERE id = ?', [task_id]);

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      const updateFields = [];
      const updateParams = [];

      if (name) {
        updateFields.push('name = ?');
        updateParams.push(name);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(description);
      }

      if (status !== undefined) {
        updateFields.push('status = ?');
        updateParams.push(status);
      }

      if (priority !== undefined) {
        updateFields.push('priority = ?');
        updateParams.push(priority);
      }

      if (due_date) {
        updateFields.push('duedate = ?');
        updateParams.push(due_date);
      }

      // Handle tags by updating description (workaround)
      if (tags !== undefined) {
        const currentTask = await mysqlClient.queryOne<{ description: string } & DatabaseRow>(
          'SELECT description FROM tbltasks WHERE id = ?',
          [task_id]
        );

        let newDesc = currentTask?.description || '';

        // Remove existing tags
        newDesc = newDesc.replace(/\n\n\[TAGS:.*?\]$/g, '');

        // Add new tags if provided
        if (tags.trim()) {
          newDesc = newDesc ? `${newDesc}\n\n[TAGS: ${tags}]` : `[TAGS: ${tags}]`;
        }

        updateFields.push('description = ?');
        updateParams.push(newDesc);
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(task_id);

      await mysqlClient.query(
        `UPDATE tbltasks SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Tarefa atualizada com sucesso',
                task_id
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
    name: 'assign_task',
    description: 'Atribuir tarefa a funcionários',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs dos funcionários'
        },
        replace_existing: { type: 'boolean', description: 'Substituir responsáveis existentes' },
        primary_assignee: { type: 'number', description: 'ID do responsável primário' }
      },
      required: ['task_id', 'staff_ids']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_ids, replace_existing = false, primary_assignee } = args;

      // Verificar se tarefa existe
      const task = await mysqlClient.queryOne('SELECT id FROM tbltasks WHERE id = ?', [task_id]);

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      // Remover responsáveis existentes se solicitado
      if (replace_existing) {
        await mysqlClient.query('DELETE FROM tbltask_assigned WHERE taskid = ?', [task_id]);
      }

      // Adicionar novos responsáveis
      for (const staffId of staff_ids) {
        // Verificar se já não está atribuído
        const existing = await mysqlClient.queryOne(
          'SELECT id FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
          [task_id, staffId]
        );

        if (!existing) {
          // Determinar se é primário (usar workaround na nota)
          const isPrimary = primary_assignee === staffId;
          await mysqlClient.executeInsert(
            'INSERT INTO tbltask_assigned (taskid, staffid) VALUES (?, ?)',
            [task_id, staffId]
          );

          // Se for primário, adicionar observação na descrição da tarefa
          if (isPrimary) {
            const currentTask = await mysqlClient.queryOne<{ description: string } & DatabaseRow>(
              'SELECT description FROM tbltasks WHERE id = ?',
              [task_id]
            );

            let newDesc = currentTask?.description || '';

            // Remover marcação primária existente
            newDesc = newDesc.replace(/\n\n\[PRIMARY: .*?\]$/g, '');

            // Adicionar nova marcação
            const staffName = await mysqlClient.queryOne<{ name: string } & DatabaseRow>(
              'SELECT CONCAT(firstname, " ", lastname) as name FROM tblstaff WHERE staffid = ?',
              [staffId]
            );

            newDesc += `\n\n[PRIMARY: ${staffName?.name || 'Staff #' + staffId}]`;

            await mysqlClient.query('UPDATE tbltasks SET description = ? WHERE id = ?', [
              newDesc,
              task_id
            ]);
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Tarefa atribuída com sucesso',
                task_id,
                assigned_to: staff_ids.length
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
    name: 'add_task_comment',
    description: 'Adicionar comentário à tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        content: { type: 'string', description: 'Conteúdo do comentário' },
        staff_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['task_id', 'content', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, content, staff_id } = args;

      // Verificar se tarefa existe
      const task = await mysqlClient.queryOne('SELECT id FROM tbltasks WHERE id = ?', [task_id]);

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      const commentId = await mysqlClient.executeInsert(
        `
        INSERT INTO tbltask_comments (taskid, content, staffid, dateadded)
        VALUES (?, ?, ?, NOW())
      `,
        [task_id, content, staff_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Comentário adicionado com sucesso',
                comment_id: commentId,
                task_id
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
    name: 'start_task_timer',
    description: 'Iniciar timer de tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário' },
        note: { type: 'string', description: 'Nota sobre o trabalho' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id, note } = args;

      // Verificar se não há timer ativo para este staff/tarefa
      const activeTimer = await mysqlClient.queryOne(
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
        INSERT INTO tbltaskstimers (task_id, staff_id, start_time, note)
        VALUES (?, ?, NOW(), ?)
      `,
        [task_id, staff_id, note || '']
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
                staff_id
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
    name: 'stop_task_timer',
    description: 'Parar timer de tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário' },
        note: { type: 'string', description: 'Nota final sobre o trabalho' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id, note } = args;

      // Buscar timer ativo
      const activeTimer = await mysqlClient.queryOne<
        { id: number; start_time: Date } & DatabaseRow
      >(
        `
        SELECT id, start_time FROM tbltaskstimers 
        WHERE task_id = ? AND staff_id = ? AND end_time IS NULL
      `,
        [task_id, staff_id]
      );

      if (!activeTimer) {
        throw new Error('Nenhum timer ativo encontrado para esta tarefa');
      }

      // Calcular tempo total
      await mysqlClient.query<ResultSetHeader>(
        `
        UPDATE tbltaskstimers 
        SET end_time = NOW(), 
            total_logged_time = TIME_TO_SEC(TIMEDIFF(NOW(), start_time)),
            note = COALESCE(?, note)
        WHERE id = ?
      `,
        [note, activeTimer.id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Timer parado com sucesso',
                timer_id: activeTimer.id,
                task_id,
                staff_id
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
    name: 'get_task_time_logs',
    description: 'Obter logs de tempo de uma tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' }
      },
      required: ['task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id, date_from, date_to } = args;

      let sql = `
        SELECT 
          tt.id,
          tt.start_time, tt.end_time, TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time), tt.note,
          tt.staff_id, s.firstname,
          s.lastname,
          DATE(tt.start_time) as date_logged, ROUND(TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time) / 3600, 2) as hours_logged
        FROM tbltaskstimers tt
        LEFT JOIN tblstaff s ON tt.staff_id = s.staffid
        WHERE tt.task_id = ?
      `;

      const params: any[] = [task_id];

      if (staff_id) {
        sql += ' AND tt.staff_id = ?';
        params.push(staff_id);
      }

      if (date_from) {
        sql += ' AND DATE(tt.start_time) >= ?';
        params.push(date_from);
      }

      if (date_to) {
        sql += ' AND DATE(tt.start_time) <= ?';
        params.push(date_to);
      }

      sql += ' ORDER BY tt.start_time DESC';

      const timeLogs = await mysqlClient.query(sql, params);

      // Calcular totais
      const totalSeconds = timeLogs.reduce(
        (sum: number, entry: any) => sum + Number(entry.total_logged_time || 0),
        0
      );
      const totalHours = Math.round(((totalSeconds as number) / 3600) * 100) / 100;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                task_id,
                time_logs: timeLogs,
                summary: {
                  total_entries: timeLogs.length,
                  total_hours: totalHours,
                  total_seconds: totalSeconds
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
    name: 'get_overdue_tasks',
    description: 'Obter tarefas vencidas',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        priority: { type: 'number', description: 'Filtrar por prioridade' },
        days_overdue: { type: 'number', description: 'Mínimo de dias em atraso' }
      }
    },
    handler: async (args, mysqlClient) => {
      const { staff_id, priority, days_overdue } = args;

      let sql = `
        SELECT 
          t.id,
          t.name,
          t.priority,
          t.duedate,
          t.status,
          DATEDIFF(CURDATE(), t.duedate) as days_overdue, CASE t.priority
            WHEN 1 THEN 'Baixa'
            WHEN 2 THEN 'Normal'
            WHEN 3 THEN 'Alta'
            WHEN 4 THEN 'Urgente'
            ELSE 'Não Definida'
          END as priority_name,
          (SELECT GROUP_CONCAT(CONCAT(s.firstname, ' ', s.lastname) SEPARATOR ', ') 
           FROM tbltask_assigned ta 
           LEFT JOIN tblstaff s ON ta.staffid = s.staffid 
           WHERE ta.taskid = t.id) as assignees,
          CASE t.rel_type
            WHEN 'project' THEN (SELECT name FROM tblprojects WHERE id = t.rel_id)
            WHEN 'customer' THEN (SELECT company FROM tblclients WHERE userid = t.rel_id)
            ELSE 'N/A'
          END as related_to
        FROM tbltasks t
        WHERE t.duedate < CURDATE() AND t.status != 5
      `;

      const params: any[] = [];

      if (staff_id) {
        sql += ' AND EXISTS (SELECT 1 FROM tbltask_assigned WHERE taskid = t.id AND staffid = ?)';
        params.push(staff_id);
      }

      if (priority !== undefined) {
        sql += ' AND t.priority = ?';
        params.push(priority);
      }

      if (days_overdue) {
        sql += ' AND DATEDIFF(CURDATE(), t.duedate) >= ?';
        params.push(days_overdue);
      }

      sql += ' ORDER BY t.priority DESC, t.duedate ASC';

      const overdueTasks = await mysqlClient.query(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                overdue_tasks: overdueTasks,
                total_overdue: overdueTasks.length,
                filters: { staff_id, priority, days_overdue }
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
    name: 'task_analytics',
    description: 'Analytics de tarefas - produtividade e performance',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        project_id: { type: 'number', description: 'Filtrar por projeto' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const staffId = args?.staff_id;
      const projectId = args?.project_id;

      let dateFilter = '';
      if (period === 'week') dateFilter = 'AND t.dateadded >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
      else if (period === 'month')
        dateFilter = 'AND t.dateadded >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter')
        dateFilter = 'AND t.dateadded >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year')
        dateFilter = 'AND t.dateadded >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      let staffFilter = '';
      let projectFilter = '';
      const params: any[] = [];

      if (staffId) {
        staffFilter =
          'AND EXISTS (SELECT 1 FROM tbltask_assigned WHERE taskid = t.id AND staffid = ?)';
        params.push(staffId);
      }

      if (projectId) {
        projectFilter = 'AND t.rel_type = "project" AND t.rel_id = ?';
        params.push(projectId);
      }

      const sql = `
        SELECT 
          COUNT(*) as total_tasks, COUNT(CASE WHEN t.status = 1 THEN 1 END) as not_started, COUNT(CASE WHEN t.status = 2 THEN 1 END) as in_progress, COUNT(CASE WHEN t.status = 3 THEN 1 END) as testing,
          COUNT(CASE WHEN t.status = 4 THEN 1 END) as waiting_feedback, COUNT(CASE WHEN t.status = 5 THEN 1 END) as completed,
          COUNT(CASE WHEN t.duedate < CURDATE() AND t.status != 5 THEN 1 END) as overdue,
          AVG(CASE WHEN t.status = 5 THEN DATEDIFF(t.dateadded, t.duedate) ELSE NULL END) as avg_completion_time,
          (COUNT(CASE WHEN t.status = 5 THEN 1 END) / COUNT(*) * 100) as completion_rate, COUNT(CASE WHEN t.priority = 4 THEN 1 END) as urgent_tasks, COUNT(CASE WHEN t.priority = 3 THEN 1 END) as high_priority_tasks
        FROM tbltasks t
        WHERE 1=1 ${dateFilter} ${staffFilter} ${projectFilter}
      `;

      const analytics = await mysqlClient.queryOne(sql, params);

      // Análise por status
      const statusSql = `
        SELECT 
          t.status,
          CASE t.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Testando'
            WHEN 4 THEN 'Aguardando Feedback'
            WHEN 5 THEN 'Completa'
          END as status_name, COUNT(*) as count,
          (COUNT(*) / (SELECT COUNT(*) FROM tbltasks WHERE 1=1 ${dateFilter} ${staffFilter} ${projectFilter}) * 100) as percentage
        FROM tbltasks t
        WHERE 1=1 ${dateFilter} ${staffFilter} ${projectFilter}
        GROUP BY t.status
        ORDER BY t.status
      `;

      const statusBreakdown = await mysqlClient.query(statusSql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                staff_id: staffId,
                project_id: projectId,
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
  },

  {
    name: 'assign_task_to_staff',
    description: 'Atribuir tarefa a funcionário específico',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário' },
        is_primary: { type: 'boolean', description: 'Se é o responsável principal' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id, is_primary = false } = args;

      // Verificar se tarefa existe
      const task = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tbltasks WHERE id = ?',
        [task_id]
      );

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      // Verificar se funcionário existe
      const staff = await mysqlClient.queryOne<{ staffid: number } & DatabaseRow>(
        'SELECT staffid FROM tblstaff WHERE staffid = ?',
        [staff_id]
      );

      if (!staff) {
        throw new Error('Funcionário não encontrado');
      }

      // Verificar se já está atribuído
      const existing = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
        [task_id, staff_id]
      );

      if (existing) {
        throw new Error('Funcionário já está atribuído a esta tarefa');
      }

      // Inserir atribuição (sem campo is_primary que não existe)
      const assignmentId = await mysqlClient.executeInsert(
        `
        INSERT INTO tbltask_assigned (taskid, staffid)
        VALUES (?, ?)
      `,
        [task_id, staff_id]
      );

      // Se é primary, marcar na descrição da tarefa
      if (is_primary) {
        const staffName = await mysqlClient.queryOne<{ name: string } & DatabaseRow>(
          'SELECT CONCAT(firstname, " ", lastname) as name FROM tblstaff WHERE staffid = ?',
          [staff_id]
        );

        if (staffName) {
          const currentTask = await mysqlClient.queryOne<{ description: string } & DatabaseRow>(
            'SELECT description FROM tbltasks WHERE id = ?',
            [task_id]
          );

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

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Tarefa atribuída com sucesso',
                assignment_id: assignmentId,
                task_id,
                staff_id,
                is_primary
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
    name: 'remove_task_assignment',
    description: 'Remover atribuição de tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id } = args;

      const result = await mysqlClient.query<ResultSetHeader>(
        'DELETE FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
        [task_id, staff_id]
      );

      if ((result as any)[0].affectedRows === 0) {
        throw new Error('Atribuição não encontrada');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Atribuição removida com sucesso',
                task_id,
                staff_id
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
    name: 'get_task_assignments',
    description: 'Obter todas as atribuições de uma tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' }
      },
      required: ['task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id } = args;

      const assignments = await mysqlClient.query<
        {
          id: number;
          staffid: number;
          firstname: string;
          lastname: string;
          email: string;
          is_primary: number;
          assigned_at: Date;
        } & DatabaseRow
      >(
        `
        SELECT 
          ta.id,
          ta.staffid,
          s.firstname,
          s.lastname,
          s.email,
          CASE 
            WHEN t.description LIKE CONCAT('%[PRIMARY: ', CONCAT(s.firstname, ' ', s.lastname), ']%') 
            THEN 1 
            ELSE 0 
          END as is_primary,
          ta.date_assigned as assigned_at
        FROM tbltask_assigned ta
        LEFT JOIN tblstaff s ON ta.staffid = s.staffid
        LEFT JOIN tbltasks t ON ta.taskid = t.id
        WHERE ta.taskid = ?
        ORDER BY is_primary DESC, ta.date_assigned ASC
      `,
        [task_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                task_id,
                assignments: assignments.map((a) => ({
                  staff_id: a.staffid,
                  name: `${a.firstname} ${a.lastname}`,
                  email: a.email,
                  is_primary: a.is_primary === 1,
                  assigned_at: a.assigned_at
                })),
                total_assignments: assignments.length,
                primary_assignee: assignments.find((a) => a.is_primary)?.staffid || null
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
    name: 'bulk_assign_tasks',
    description: 'Atribuir múltiplas tarefas a um funcionário',
    inputSchema: {
      type: 'object',
      properties: {
        task_ids: { type: 'array', items: { type: 'number' }, description: 'IDs das tarefas' },
        staff_id: { type: 'number', description: 'ID do funcionário' },
        set_as_primary: { type: 'boolean', description: 'Definir como responsável principal' }
      },
      required: ['task_ids', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_ids, staff_id, set_as_primary = false } = args;

      if (!Array.isArray(task_ids) || task_ids.length === 0) {
        throw new Error('Lista de tarefas não pode estar vazia');
      }

      // Verificar se funcionário existe
      const staff = await mysqlClient.queryOne<{ staffid: number } & DatabaseRow>(
        'SELECT staffid FROM tblstaff WHERE staffid = ?',
        [staff_id]
      );

      if (!staff) {
        throw new Error('Funcionário não encontrado');
      }

      const results = [];
      const errors = [];

      for (const task_id of task_ids) {
        try {
          // Verificar se tarefa existe
          const task = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
            'SELECT id FROM tbltasks WHERE id = ?',
            [task_id]
          );

          if (!task) {
            errors.push({ task_id, error: 'Tarefa não encontrada' });
            continue;
          }

          // Verificar se já está atribuído
          const existing = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
            'SELECT id FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
            [task_id, staff_id]
          );

          if (existing) {
            errors.push({ task_id, error: 'Funcionário já atribuído' });
            continue;
          }

          // Se set_as_primary, remover primary de outros
          if (set_as_primary) {
            await mysqlClient.query<ResultSetHeader>(
              'UPDATE tbltask_assigned SET is_primary = 0 WHERE taskid = ?',
              [task_id]
            );
          }

          // Inserir atribuição
          const assignmentId = await mysqlClient.executeInsert(
            `
            INSERT INTO tbltask_assigned (taskid, staffid, is_primary, assigned_at)
            VALUES (?, ?, ?, NOW())
          `,
            [task_id, staff_id, set_as_primary ? 1 : 0]
          );

          results.push({
            task_id,
            assignment_id: assignmentId,
            success: true
          });
        } catch (error) {
          errors.push({
            task_id,
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
                message: `${results.length} tarefas atribuídas com sucesso`,
                staff_id,
                successful_assignments: results,
                failed_assignments: errors,
                total_processed: task_ids.length
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
    name: 'get_staff_workload',
    description: 'Obter carga de trabalho de funcionários',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'ID do funcionário específico' },
        include_inactive: { type: 'boolean', description: 'Incluir funcionários inativos' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' }
      }
    },
    handler: async (args, mysqlClient) => {
      const { staff_id, include_inactive = false, date_from, date_to } = args;

      let staffFilter = '';
      let dateFilter = '';
      const params: any[] = [];

      if (staff_id) {
        staffFilter = 'AND s.staffid = ?';
        params.push(staff_id);
      }

      if (!include_inactive) {
        staffFilter += ' AND s.active = 1';
      }

      if (date_from) {
        dateFilter += ' AND t.startdate >= ?';
        params.push(date_from);
      }

      if (date_to) {
        dateFilter += ' AND t.duedate <= ?';
        params.push(date_to);
      }

      const workload = await mysqlClient.query<
        {
          staff_id: number;
          firstname: string;
          lastname: string;
          email: string;
          total_tasks: number;
          not_started: number;
          in_progress: number;
          testing: number;
          awaiting_feedback: number;
          completed: number;
          overdue_tasks: number;
          high_priority_tasks: number;
          primary_assignments: number;
          workload_score: number;
        } & DatabaseRow
      >(
        `
        SELECT 
          s.staffid as staff_id,
          s.firstname,
          s.lastname,
          s.email,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN t.status = 1 THEN 1 END) as not_started,
          COUNT(CASE WHEN t.status = 2 THEN 1 END) as in_progress,
          COUNT(CASE WHEN t.status = 3 THEN 1 END) as testing,
          COUNT(CASE WHEN t.status = 4 THEN 1 END) as awaiting_feedback,
          COUNT(CASE WHEN t.status = 5 THEN 1 END) as completed,
          COUNT(CASE WHEN t.duedate < CURDATE() AND t.status != 5 THEN 1 END) as overdue_tasks,
          COUNT(CASE WHEN t.priority >= 3 THEN 1 END) as high_priority_tasks,
          COUNT(CASE 
            WHEN t.description LIKE CONCAT('%[PRIMARY: ', CONCAT(s.firstname, ' ', s.lastname), ']%') 
            THEN 1 
          END) as primary_assignments,
          (COUNT(CASE WHEN t.status IN (1,2,3,4) THEN 1 END) * 10 +
           COUNT(CASE WHEN t.priority >= 3 THEN 1 END) * 5 +
           COUNT(CASE WHEN t.duedate < CURDATE() AND t.status != 5 THEN 1 END) * 15) as workload_score
        FROM tblstaff s
        LEFT JOIN tbltask_assigned ta ON s.staffid = ta.staffid
        LEFT JOIN tbltasks t ON ta.taskid = t.id ${dateFilter}
        WHERE 1=1 ${staffFilter}
        GROUP BY s.staffid, s.firstname, s.lastname, s.email
        ORDER BY workload_score DESC
      `,
        params
      );

      // Calcular estatísticas gerais
      const totalTasks = workload.reduce((sum, w) => sum + w.total_tasks, 0);
      const avgWorkload = workload.length > 0 ? totalTasks / workload.length : 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                staff_workload: workload.map((w) => ({
                  staff_id: w.staff_id,
                  name: `${w.firstname} ${w.lastname}`,
                  email: w.email,
                  tasks: {
                    total: w.total_tasks,
                    not_started: w.not_started,
                    in_progress: w.in_progress,
                    testing: w.testing,
                    awaiting_feedback: w.awaiting_feedback,
                    completed: w.completed,
                    overdue: w.overdue_tasks,
                    high_priority: w.high_priority_tasks,
                    primary_assignments: w.primary_assignments
                  },
                  workload_score: w.workload_score,
                  workload_level:
                    w.workload_score > 100 ? 'Alto' : w.workload_score > 50 ? 'Médio' : 'Baixo'
                })),
                summary: {
                  total_staff: workload.length,
                  total_tasks: totalTasks,
                  average_tasks_per_staff: Math.round(avgWorkload * 100) / 100,
                  most_loaded_staff: workload[0]?.firstname + ' ' + workload[0]?.lastname || 'N/A',
                  least_loaded_staff:
                    workload[workload.length - 1]?.firstname +
                      ' ' +
                      workload[workload.length - 1]?.lastname || 'N/A'
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
    name: 'get_task_dependencies',
    description: 'Obter dependências de uma tarefa específica',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' }
      },
      required: ['task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id } = args;

      // Tarefas das quais esta tarefa depende (predecessoras)
      const predecessors = await mysqlClient.query<
        {
          task_id: number;
          task_name: string;
          dependency_type: string;
          status: number;
          status_name: string;
          duedate: Date;
        } & DatabaseRow
      >(
        `
        SELECT 
          t.id as task_id,
          t.name as task_name,
          td.dependency_type,
          t.status,
          CASE t.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Testando'
            WHEN 4 THEN 'Aguardando Feedback'
            WHEN 5 THEN 'Completa'
            ELSE 'Desconhecido'
          END as status_name,
          t.duedate
        FROM tbltask_dependencies td
        JOIN tbltasks t ON td.depends_on_task_id = t.id
        WHERE td.task_id = ?
        ORDER BY t.duedate ASC
      `,
        [task_id]
      );

      // Tarefas que dependem desta tarefa (sucessoras)
      const successors = await mysqlClient.query<
        {
          task_id: number;
          task_name: string;
          dependency_type: string;
          status: number;
          status_name: string;
          startdate: Date;
        } & DatabaseRow
      >(
        `
        SELECT 
          t.id as task_id,
          t.name as task_name,
          td.dependency_type,
          t.status,
          CASE t.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Testando'
            WHEN 4 THEN 'Aguardando Feedback'
            WHEN 5 THEN 'Completa'
            ELSE 'Desconhecido'
          END as status_name,
          t.startdate
        FROM tbltask_dependencies td
        JOIN tbltasks t ON td.task_id = t.id
        WHERE td.depends_on_task_id = ?
        ORDER BY t.startdate ASC
      `,
        [task_id]
      );

      // Verificar bloqueios
      const blocking_tasks = predecessors.filter((p) => p.status !== 5);
      const can_start = blocking_tasks.length === 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                task_id,
                predecessors: predecessors.map((p) => ({
                  task_id: p.task_id,
                  name: p.task_name,
                  dependency_type: p.dependency_type,
                  status: p.status_name,
                  due_date: p.duedate,
                  is_blocking: p.status !== 5
                })),
                successors: successors.map((s) => ({
                  task_id: s.task_id,
                  name: s.task_name,
                  dependency_type: s.dependency_type,
                  status: s.status_name,
                  start_date: s.startdate
                })),
                dependency_analysis: {
                  total_predecessors: predecessors.length,
                  total_successors: successors.length,
                  blocking_tasks: blocking_tasks.length,
                  can_start: can_start,
                  blocking_task_names: blocking_tasks.map((t) => t.task_name)
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
    name: 'set_task_primary_assignee',
    description: 'Definir responsável principal de uma tarefa',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' },
        staff_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['task_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, staff_id } = args;

      // Verificar se a atribuição existe
      const assignment = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tbltask_assigned WHERE taskid = ? AND staffid = ?',
        [task_id, staff_id]
      );

      if (!assignment) {
        throw new Error('Funcionário não está atribuído a esta tarefa');
      }

      // Obter nome do funcionário
      const staff = await mysqlClient.queryOne<{ name: string } & DatabaseRow>(
        'SELECT CONCAT(firstname, " ", lastname) as name FROM tblstaff WHERE staffid = ?',
        [staff_id]
      );

      if (!staff) {
        throw new Error('Funcionário não encontrado');
      }

      // Atualizar descrição da tarefa
      const currentTask = await mysqlClient.queryOne<{ description: string } & DatabaseRow>(
        'SELECT description FROM tbltasks WHERE id = ?',
        [task_id]
      );

      let newDesc = currentTask?.description || '';

      // Remover marcação primária existente
      newDesc = newDesc.replace(/\n\n\[PRIMARY: .*?\]$/g, '');

      // Adicionar nova marcação
      newDesc += `\n\n[PRIMARY: ${staff.name}]`;

      await mysqlClient.query('UPDATE tbltasks SET description = ? WHERE id = ?', [
        newDesc,
        task_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Responsável principal definido com sucesso',
                task_id,
                primary_assignee_id: staff_id
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
    name: 'get_task_timeline',
    description: 'Obter timeline completo de uma tarefa com dependências',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa' }
      },
      required: ['task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id } = args;

      // Obter informações da tarefa principal
      const task = await mysqlClient.queryOne<
        {
          id: number;
          name: string;
          description: string;
          status: number;
          priority: number;
          startdate: Date;
          duedate: Date;
          dateadded: Date;
        } & DatabaseRow
      >(
        `
        SELECT id, name, description, status, priority, startdate, duedate, dateadded
        FROM tbltasks
        WHERE id = ?
      `,
        [task_id]
      );

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      // Obter histórico de atividades
      const activities = await mysqlClient.query<
        {
          id: number;
          description: string;
          date: Date;
          staffid: number;
          staff_name: string;
        } & DatabaseRow
      >(
        `
        SELECT 
          al.id,
          al.description,
          al.date,
          al.staffid,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name
        FROM tblactivity_log al
        LEFT JOIN tblstaff s ON al.staffid = s.staffid
        WHERE al.rel_type = 'task' AND al.rel_id = ?
        ORDER BY al.date DESC
        LIMIT 50
      `,
        [task_id]
      );

      // Obter comentários
      const comments = await mysqlClient.query<
        {
          id: number;
          content: string;
          dateadded: Date;
          staffid: number;
          staff_name: string;
        } & DatabaseRow
      >(
        `
        SELECT 
          c.id,
          c.content,
          c.dateadded,
          c.staffid,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name
        FROM tbltask_comments c
        LEFT JOIN tblstaff s ON c.staffid = s.staffid
        WHERE c.taskid = ?
        ORDER BY c.dateadded DESC
        LIMIT 20
      `,
        [task_id]
      );

      // Calcular métricas de tempo
      const now = new Date();
      const daysToDeadline = Math.ceil(
        (new Date(task.duedate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysActive = Math.ceil(
        (now.getTime() - new Date(task.dateadded).getTime()) / (1000 * 60 * 60 * 24)
      );
      const isOverdue = daysToDeadline < 0 && task.status !== 5;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                task: {
                  id: task.id,
                  name: task.name,
                  description: task.description,
                  status: task.status,
                  priority: task.priority,
                  start_date: task.startdate,
                  due_date: task.duedate,
                  created_date: task.dateadded
                },
                timeline_metrics: {
                  days_to_deadline: daysToDeadline,
                  days_active: daysActive,
                  is_overdue: isOverdue,
                  completion_percentage: task.status === 5 ? 100 : task.status >= 2 ? 50 : 0
                },
                recent_activities: activities.map((a) => ({
                  id: a.id,
                  description: a.description,
                  date: a.date,
                  staff_name: a.staff_name || 'Sistema'
                })),
                recent_comments: comments.map((c) => ({
                  id: c.id,
                  content: c.content,
                  date: c.dateadded,
                  staff_name: c.staff_name
                })),
                summary: {
                  total_activities: activities.length,
                  total_comments: comments.length,
                  last_activity: activities[0]?.date || null,
                  last_comment: comments[0]?.dateadded || null
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
