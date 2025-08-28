import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface ProjectsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

export const projectsTools: ProjectsTool[] = [
  {
    name: 'get_projects',
    description: 'Listar projetos com filtros e status',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        status: {
          type: 'number',
          description:
            'Status (1=Não Iniciado, 2=Em Progresso, 3=Em Pausa, 4=Cancelado, 5=Finalizado)'
        },
        client_id: { type: 'number', description: 'ID do cliente' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        billing_type: {
          type: 'number',
          description: 'Tipo de cobrança (1=Preço Fixo, 2=Por Hora, 3=Por Projeto)'
        },
        overdue_only: { type: 'boolean', description: 'Apenas projetos em atraso' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;
      const status = args?.status;
      const clientId = args?.client_id;
      const dateFrom = args?.date_from;
      const dateTo = args?.date_to;
      const billingType = args?.billing_type;
      const overdueOnly = args?.overdue_only;

      let sql = `
        SELECT 
          p.id,
          p.name,
          p.clientid,
          c.company as client_name, p.start_date, p.deadline,
          p.project_cost, p.project_rate_per_hour, p.estimated_hours, p.status,
          p.progress,
          p.billing_type, p.project_created,
          CASE p.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Em Pausa'
            WHEN 4 THEN 'Cancelado'
            WHEN 5 THEN 'Finalizado'
            ELSE 'Desconhecido'
          END as status_name, CASE p.billing_type
            WHEN 1 THEN 'Preço Fixo'
            WHEN 2 THEN 'Por Hora'
            WHEN 3 THEN 'Por Projeto'
            ELSE 'Não Definido'
          END as billing_type_name, CASE 
            WHEN p.deadline < CURDATE() AND p.status NOT IN (4,5) THEN 'Em Atraso'
            WHEN p.status = 5 THEN 'Finalizado'
            WHEN p.status = 4 THEN 'Cancelado'
            ELSE 'No Prazo'
          END as deadline_status, DATEDIFF(p.deadline, CURDATE()) as days_to_deadline,
          (SELECT COUNT(*) FROM tbltasks WHERE rel_type = 'project' AND rel_id = p.id) as total_tasks,
          (SELECT COUNT(*) FROM tbltasks WHERE rel_type = 'project' AND rel_id = p.id AND status = 5) as completed_tasks,
          (SELECT SUM(TIMESTAMPDIFF(SECOND, start_time, end_time)) FROM tbltaskstimers WHERE end_time IS NOT NULL AND task_id IN (SELECT id FROM tbltasks WHERE rel_type = 'project' AND rel_id = p.id)) as total_logged_hours
        FROM tblprojects p
        LEFT JOIN tblclients c ON p.clientid = c.userid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (status !== undefined) {
        sql += ' AND p.status = ?';
        params.push(status);
      }

      if (clientId) {
        sql += ' AND p.clientid = ?';
        params.push(clientId);
      }

      if (dateFrom) {
        sql += ' AND p.start_date >= ?';
        params.push(dateFrom);
      }

      if (dateTo) {
        sql += ' AND p.start_date <= ?';
        params.push(dateTo);
      }

      if (billingType !== undefined) {
        sql += ' AND p.billing_type = ?';
        params.push(billingType);
      }

      if (overdueOnly) {
        sql += ' AND p.deadline < CURDATE() AND p.status NOT IN (4,5)';
      }

      sql += ' ORDER BY p.project_created DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const projects = await mysqlClient.query(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                projects,
                pagination: {
                  limit,
                  offset,
                  count: projects.length
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
    name: 'get_project',
    description: 'Obter projeto completo com tarefas e membros',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const projectId = args?.project_id;
      if (!projectId) {
        throw new Error('project_id é obrigatório');
      }

      const sql = `
        SELECT 
          p.*,
          c.company as client_name, 
          (SELECT email FROM tblcontacts WHERE userid = c.userid AND is_primary = 1 LIMIT 1) as client_email, 
          c.phonenumber as client_phone, CASE p.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Em Pausa'
            WHEN 4 THEN 'Cancelado'
            WHEN 5 THEN 'Finalizado'
            ELSE 'Desconhecido'
          END as status_name, CASE p.billing_type
            WHEN 1 THEN 'Preço Fixo'
            WHEN 2 THEN 'Por Hora'
            WHEN 3 THEN 'Por Projeto'
            ELSE 'Não Definido'
          END as billing_type_name, DATEDIFF(p.deadline, CURDATE()) as days_to_deadline
        FROM tblprojects p
        LEFT JOIN tblclients c ON p.clientid = c.userid
        WHERE p.id = ?
      `;

      const project = await mysqlClient.queryOne(sql, [projectId]);

      if (!project) {
        return {
          content: [
            {
              type: 'text',
              text: 'Projeto não encontrado'
            }
          ]
        };
      }

      // Buscar membros do projeto
      const membersSql = `
        SELECT 
          pm.staff_id, s.firstname,
          s.lastname,
          s.email
        FROM tblproject_members pm
        LEFT JOIN tblstaff s ON pm.staff_id = s.staffid
        WHERE pm.project_id = ?
      `;
      const members = await mysqlClient.query(membersSql, [projectId]);

      // Buscar tarefas do projeto
      const tasksSql = `
        SELECT 
          t.id,
          t.name,
          t.description,
          t.status,
          t.priority,
          t.startdate,
          t.duedate,
          t.dateadded,
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
          END as priority_name
        FROM tbltasks t
        WHERE t.rel_type = 'project' AND t.rel_id = ?
        ORDER BY t.priority DESC, t.duedate ASC
      `;
      const tasks = await mysqlClient.query(tasksSql, [projectId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project: Object.assign({}, project, { members, tasks })
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
    name: 'create_project',
    description: 'Criar novo projeto',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do projeto' },
        client_id: { type: 'number', description: 'ID do cliente' },
        billing_type: {
          type: 'number',
          description: 'Tipo de cobrança (1=Preço Fixo, 2=Por Hora, 3=Por Projeto)'
        },
        project_cost: { type: 'number', description: 'Custo do projeto (para preço fixo)' },
        project_rate_per_hour: { type: 'number', description: 'Valor por hora' },
        estimated_hours: { type: 'number', description: 'Horas estimadas' },
        start_date: { type: 'string', description: 'Data de início (YYYY-MM-DD)' },
        deadline: { type: 'string', description: 'Data limite (YYYY-MM-DD)' },
        description: { type: 'string', description: 'Descrição do projeto' },
        members: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs dos membros da equipe'
        }
      },
      required: ['name', 'client_id', 'billing_type']
    },
    handler: async (args, mysqlClient) => {
      const {
        name,
        client_id,
        billing_type,
        project_cost,
        project_rate_per_hour,
        estimated_hours,
        start_date,
        deadline,
        description,
        members
      } = args;

      const startDate = start_date || new Date().toISOString().split('T')[0];
      const projectDeadline =
        deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Inserir projeto
      const projectSql = `
        INSERT INTO tblprojects (
          name, clientid, billing_type, project_cost, project_rate_per_hour, estimated_hours, start_date, deadline, description, status, 
          progress, project_created, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), 0)
      `;

      const projectId = await mysqlClient.executeInsert(projectSql, [
        name,
        client_id,
        billing_type,
        project_cost || 0,
        project_rate_per_hour || 0,
        estimated_hours || 0,
        startDate,
        projectDeadline,
        description || ''
      ]);

      // Adicionar membros se fornecidos
      if (members && members.length > 0) {
        for (const memberId of members) {
          await mysqlClient.query(
            'INSERT INTO tblproject_members (project_id, staff_id) VALUES (?, ?)',
            [projectId, memberId]
          );
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Projeto criado com sucesso',
                project_id: projectId
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
    name: 'update_project',
    description: 'Atualizar projeto existente',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        name: { type: 'string', description: 'Novo nome' },
        status: { type: 'number', description: 'Novo status' },
        progress: { type: 'number', description: 'Progresso (0-100)' },
        deadline: { type: 'string', description: 'Nova data limite' },
        description: { type: 'string', description: 'Nova descrição' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, name, status, progress, deadline, description } = args;

      // Verificar se projeto existe
      const project = await mysqlClient.queryOne('SELECT id FROM tblprojects WHERE id = ?', [
        project_id
      ]);

      if (!project) {
        throw new Error('Projeto não encontrado');
      }

      const updateFields = [];
      const updateParams = [];

      if (name) {
        updateFields.push('name = ?');
        updateParams.push(name);
      }

      if (status !== undefined) {
        updateFields.push('status = ?');
        updateParams.push(status);
      }

      if (progress !== undefined) {
        updateFields.push('progress = ?');
        updateParams.push(Math.min(100, Math.max(0, progress)));
      }

      if (deadline) {
        updateFields.push('deadline = ?');
        updateParams.push(deadline);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(description);
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(project_id);

      await mysqlClient.query(
        `UPDATE tblprojects SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Projeto atualizado com sucesso',
                project_id
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
    name: 'add_project_member',
    description: 'Adicionar membro ao projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        staff_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['project_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, staff_id } = args;

      // Verificar se já é membro
      const existingMember = await mysqlClient.queryOne(
        'SELECT id FROM tblproject_members WHERE project_id = ? AND staff_id = ?',
        [project_id, staff_id]
      );

      if (existingMember) {
        throw new Error('Funcionário já é membro do projeto');
      }

      await mysqlClient.query(
        'INSERT INTO tblproject_members (project_id, staff_id) VALUES (?, ?)',
        [project_id, staff_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Membro adicionado ao projeto com sucesso',
                project_id,
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
    name: 'remove_project_member',
    description: 'Remover membro do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        staff_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['project_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, staff_id } = args;

      const result = await mysqlClient.query(
        'DELETE FROM tblproject_members WHERE project_id = ? AND staff_id = ?',
        [project_id, staff_id]
      );

      if (!result || (result as any).length === 0 || (result as any)[0]?.affectedRows === 0) {
        throw new Error('Membro não encontrado no projeto');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Membro removido do projeto com sucesso',
                project_id,
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
    name: 'get_project_activities',
    description: 'Obter atividades e log do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        limit: { type: 'number', description: 'Limite de atividades' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, limit = 50 } = args;

      const sql = `
        SELECT 
          al.id,
          al.description,
          al.date,
          al.staffid,
          s.firstname,
          s.lastname
        FROM tblactivity_log al
        LEFT JOIN tblstaff s ON al.staffid = s.staffid
        WHERE al.rel_type = 'project' AND al.rel_id = ?
        ORDER BY al.date DESC
        LIMIT ?
      `;

      const activities = await mysqlClient.query(sql, [project_id, limit]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id,
                activities,
                total_activities: activities.length
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
    name: 'get_project_files',
    description: 'Obter arquivos do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const projectId = args?.project_id;

      const sql = `
        SELECT 
          f.id,
          f.rel_id, f.rel_type, f.file_name, f.filetype,
          f.dateadded,
          f.staffid,
          s.firstname,
          s.lastname
        FROM tblfiles f
        LEFT JOIN tblstaff s ON f.staffid = s.staffid
        WHERE f.rel_type = 'project' AND f.rel_id = ?
        ORDER BY f.dateadded DESC
      `;

      const files = await mysqlClient.query(sql, [projectId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id: projectId,
                files,
                total_files: files.length
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
    name: 'get_project_milestones',
    description: 'Obter marcos/milestones do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const projectId = args?.project_id;

      const sql = `
        SELECT 
          m.id,
          m.name,
          m.description,
          m.due_date, m.milestone_order, m.datecreated,
          CASE 
            WHEN m.due_date < CURDATE() THEN 'Vencido'
            WHEN m.due_date = CURDATE() THEN 'Hoje'
            WHEN m.due_date > CURDATE() THEN 'Pendente'
          END as status
        FROM tblmilestones m
        WHERE m.project_id = ?
        ORDER BY m.milestone_order ASC, m.due_date ASC
      `;

      const milestones = await mysqlClient.query(sql, [projectId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id: projectId,
                milestones,
                total_milestones: milestones.length
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
    name: 'create_project_milestone',
    description: 'Criar marco/milestone do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        name: { type: 'string', description: 'Nome do milestone' },
        description: { type: 'string', description: 'Descrição' },
        due_date: { type: 'string', description: 'Data limite (YYYY-MM-DD)' },
        milestone_order: { type: 'number', description: 'Ordem do milestone' }
      },
      required: ['project_id', 'name', 'due_date']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, name, description, due_date, milestone_order } = args;

      const sql = `
        INSERT INTO tblmilestones (
          project_id, name, description, due_date, milestone_order, datecreated
        ) VALUES (?, ?, ?, ?, ?, NOW())
      `;

      const milestoneId = await mysqlClient.executeInsert(sql, [
        project_id,
        name,
        description || '',
        due_date,
        milestone_order || 1
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Milestone criado com sucesso',
                milestone_id: milestoneId,
                project_id
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
    name: 'get_project_time_tracking',
    description: 'Obter controle de tempo do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        staff_id: { type: 'number', description: 'Filtrar por funcionário' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, staff_id, date_from, date_to } = args;

      let sql = `
        SELECT 
          tt.id,
          tt.task_id, t.name as task_name, tt.staff_id, s.firstname,
          s.lastname,
          tt.start_time, tt.end_time, TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time) as total_logged_time, tt.hourly_rate, tt.note,
          DATE(tt.start_time) as date_logged
        FROM tbltaskstimers tt
        LEFT JOIN tbltasks t ON tt.task_id = t.id
        LEFT JOIN tblstaff s ON tt.staff_id = s.staffid
        WHERE t.rel_type = 'project' AND t.rel_id = ?
      `;

      const params: any[] = [project_id];

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

      const timeEntries = await mysqlClient.query(sql, params);

      // Calcular totais
      const totalSeconds = timeEntries.reduce(
        (sum: number, entry: any) => sum + Number(entry.total_logged_time || 0),
        0
      );
      const totalHours = (totalSeconds as number) / 3600;
      const totalCost = timeEntries.reduce(
        (sum: number, entry: any) =>
          sum + (Number(entry.total_logged_time || 0) / 3600) * Number(entry.hourly_rate || 0),
        0
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id,
                time_entries: timeEntries,
                summary: {
                  total_entries: timeEntries.length,
                  total_hours: Math.round((totalHours as number) * 100) / 100,
                  total_cost: Math.round((totalCost as number) * 100) / 100
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
    name: 'project_analytics',
    description: 'Analytics completos de projetos',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        client_id: { type: 'number', description: 'Filtrar por cliente' },
        status: { type: 'number', description: 'Filtrar por status' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const clientId = args?.client_id;
      const status = args?.status;

      let dateFilter = '';
      if (period === 'month')
        dateFilter = 'AND p.project_created >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter')
        dateFilter = 'AND p.project_created >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year')
        dateFilter = 'AND p.project_created >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      let clientFilter = '';
      let statusFilter = '';
      const params: any[] = [];

      if (clientId) {
        clientFilter = 'AND p.clientid = ?';
        params.push(clientId);
      }

      if (status !== undefined) {
        statusFilter = 'AND p.status = ?';
        params.push(status);
      }

      const sql = `
        SELECT 
          COUNT(*) as total_projects, COUNT(CASE WHEN p.status = 1 THEN 1 END) as not_started, COUNT(CASE WHEN p.status = 2 THEN 1 END) as in_progress, COUNT(CASE WHEN p.status = 3 THEN 1 END) as on_hold, COUNT(CASE WHEN p.status = 4 THEN 1 END) as cancelled,
          COUNT(CASE WHEN p.status = 5 THEN 1 END) as finished,
          SUM(p.project_cost) as total_project_value, AVG(p.project_cost) as avg_project_value, AVG(p.progress) as avg_progress, COUNT(CASE WHEN p.deadline < CURDATE() AND p.status NOT IN (4,5) THEN 1 END) as overdue_projects, COUNT(DISTINCT p.clientid) as unique_clients, SUM(p.estimated_hours) as total_estimated_hours
        FROM tblprojects p
        WHERE 1=1 ${dateFilter} ${clientFilter} ${statusFilter}
      `;

      const analytics = await mysqlClient.queryOne(sql, params);

      // Análise por status
      const statusSql = `
        SELECT 
          p.status,
          CASE p.status
            WHEN 1 THEN 'Não Iniciado'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Em Pausa'
            WHEN 4 THEN 'Cancelado'
            WHEN 5 THEN 'Finalizado'
          END as status_name, COUNT(*) as count,
          AVG(p.progress) as avg_progress, SUM(p.project_cost) as total_value
        FROM tblprojects p
        WHERE 1=1 ${dateFilter} ${clientFilter}
        GROUP BY p.status
        ORDER BY p.status
      `;

      const statusBreakdown = await mysqlClient.query(statusSql, clientId ? [clientId] : []);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                client_id: clientId,
                status_filter: status,
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
    name: 'get_project_expenses',
    description: 'Obter despesas do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        billable_only: { type: 'boolean', description: 'Apenas despesas faturáveis' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, billable_only } = args;

      let sql = `
        SELECT 
          e.id,
          e.category,
          e.amount,
          e.currency,
          e.tax,
          e.tax2,
          e.billable,
          e.invoiceid,
          e.expense_name, e.note,
          e.date,
          e.date,
          CASE WHEN e.billable = 1 THEN 'Sim' ELSE 'Não' END as is_billable, CASE WHEN e.invoiceid IS NOT NULL THEN 'Faturada' ELSE 'Não Faturada' END as billing_status
        FROM tblexpenses e
        WHERE e.project_id = ?
      `;

      const params: any[] = [project_id];

      if (billable_only) {
        sql += ' AND e.billable = 1';
      }

      sql += ' ORDER BY e.date DESC';

      const expenses = await mysqlClient.query(sql, params);

      // Calcular totais
      const totalAmount = expenses.reduce(
        (sum: number, expense: any) => sum + Number(expense.amount || 0),
        0
      );
      const billableAmount = expenses.reduce(
        (sum: number, expense: any) => sum + (expense.billable ? Number(expense.amount || 0) : 0),
        0
      );
      const billedAmount = expenses.reduce(
        (sum: number, expense: any) => sum + (expense.invoiceid ? Number(expense.amount || 0) : 0),
        0
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id,
                expenses,
                summary: {
                  total_expenses: expenses.length,
                  total_amount: totalAmount,
                  billable_amount: billableAmount,
                  billed_amount: billedAmount,
                  unbilled_amount: (billableAmount as number) - (billedAmount as number)
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
    name: 'update_project_milestone',
    description: 'Atualizar milestone existente',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'number', description: 'ID do milestone' },
        name: { type: 'string', description: 'Nome do milestone' },
        description: { type: 'string', description: 'Descrição' },
        due_date: { type: 'string', description: 'Data limite (YYYY-MM-DD)' },
        milestone_order: { type: 'number', description: 'Ordem do milestone' },
        completed: { type: 'boolean', description: 'Marcar como completo' }
      },
      required: ['milestone_id']
    },
    handler: async (args, mysqlClient) => {
      const { milestone_id, name, description, due_date, milestone_order, completed } = args;

      // Verificar se milestone existe
      const milestone = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tblmilestones WHERE id = ?',
        [milestone_id]
      );

      if (!milestone) {
        throw new Error('Milestone não encontrado');
      }

      const updateFields: string[] = [];
      const updateParams: any[] = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateParams.push(name);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(description);
      }

      if (due_date !== undefined) {
        updateFields.push('due_date = ?');
        updateParams.push(due_date);
      }

      if (milestone_order !== undefined) {
        updateFields.push('milestone_order = ?');
        updateParams.push(milestone_order);
      }

      if (completed !== undefined) {
        updateFields.push('date_finished = ?');
        updateParams.push(completed ? new Date().toISOString().split('T')[0] : null);
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(milestone_id);

      await mysqlClient.query<ResultSetHeader>(
        `UPDATE tblmilestones SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Milestone atualizado com sucesso',
                milestone_id
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
    name: 'delete_project_milestone',
    description: 'Deletar milestone do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'number', description: 'ID do milestone' }
      },
      required: ['milestone_id']
    },
    handler: async (args, mysqlClient) => {
      const { milestone_id } = args;

      const result = await mysqlClient.query<ResultSetHeader>(
        'DELETE FROM tblmilestones WHERE id = ?',
        [milestone_id]
      );

      if (!result || (result as any).length === 0 || (result as any)[0]?.affectedRows === 0) {
        throw new Error('Milestone não encontrado');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Milestone deletado com sucesso',
                milestone_id
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
    name: 'get_project_gantt_data',
    description: 'Obter dados para gráfico de Gantt do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        include_tasks: { type: 'boolean', description: 'Incluir tarefas no Gantt' },
        include_milestones: { type: 'boolean', description: 'Incluir milestones no Gantt' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, include_tasks = true, include_milestones = true } = args;

      // Dados do projeto principal
      const project = await mysqlClient.queryOne<
        {
          id: number;
          name: string;
          start_date: Date;
          deadline: Date;
          status: number;
          progress: number;
        } & DatabaseRow
      >(
        `
        SELECT id, name, start_date, deadline, status, progress
        FROM tblprojects 
        WHERE id = ?
      `,
        [project_id]
      );

      if (!project) {
        throw new Error('Projeto não encontrado');
      }

      const ganttData: any = {
        project: {
          id: project.id,
          name: project.name,
          start_date: project.start_date,
          end_date: project.deadline,
          progress: project.progress,
          type: 'project'
        },
        milestones: [],
        tasks: [],
        dependencies: []
      };

      // Incluir milestones
      if (include_milestones) {
        const milestones = await mysqlClient.query<
          {
            id: number;
            name: string;
            due_date: Date;
            milestone_order: number;
            date_finished: Date | null;
          } & DatabaseRow
        >(
          `
          SELECT id, name, due_date, milestone_order, date_finished
          FROM tblmilestones 
          WHERE project_id = ?
          ORDER BY milestone_order ASC, due_date ASC
        `,
          [project_id]
        );

        ganttData.milestones = milestones.map((milestone) => ({
          id: milestone.id,
          name: milestone.name,
          date: milestone.due_date,
          completed: !!milestone.date_finished,
          order: milestone.milestone_order,
          type: 'milestone'
        }));
      }

      // Incluir tarefas
      if (include_tasks) {
        const tasks = await mysqlClient.query<
          {
            id: number;
            name: string;
            startdate: Date;
            duedate: Date;
            status: number;
            priority: number;
            is_public: number;
            milestone_id: number | null;
          } & DatabaseRow
        >(
          `
          SELECT id, name, startdate, duedate, status, priority, is_public, milestone
          FROM tbltasks 
          WHERE rel_type = 'project' AND rel_id = ?
          ORDER BY startdate ASC
        `,
          [project_id]
        );

        ganttData.tasks = tasks.map((task) => ({
          id: task.id,
          name: task.name,
          start_date: task.startdate,
          end_date: task.duedate,
          status: task.status,
          priority: task.priority,
          milestone_id: task.milestone_id,
          completed: task.status === 5,
          progress: task.status === 5 ? 100 : task.status >= 2 ? 50 : 0,
          type: 'task'
        }));

        // Obter dependências de tarefas
        const dependencies = await mysqlClient.query<
          {
            task_id: number;
            depends_on_task_id: number;
          } & DatabaseRow
        >(
          `
          SELECT task_id, depends_on_task_id
          FROM tbltask_dependencies 
          WHERE task_id IN (SELECT id FROM tbltasks WHERE rel_type = 'project' AND rel_id = ?)
        `,
          [project_id]
        );

        ganttData.dependencies = dependencies;
      }

      // Calcular timeline e estatísticas
      const allDates = [
        project.start_date,
        project.deadline,
        ...ganttData.milestones.map((m: any) => m.date),
        ...ganttData.tasks.map((t: any) => t.start_date),
        ...ganttData.tasks.map((t: any) => t.end_date)
      ].filter(Boolean);

      const minDate = new Date(Math.min(...allDates.map((d) => new Date(d).getTime())));
      const maxDate = new Date(Math.max(...allDates.map((d) => new Date(d).getTime())));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id,
                timeline: {
                  start_date: minDate.toISOString().split('T')[0],
                  end_date: maxDate.toISOString().split('T')[0],
                  duration_days: Math.ceil(
                    (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
                  )
                },
                gantt_data: ganttData
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
    name: 'create_task_dependency',
    description: 'Criar dependência entre tarefas',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa dependente' },
        depends_on_task_id: { type: 'number', description: 'ID da tarefa da qual depende' },
        dependency_type: {
          type: 'string',
          enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
          description: 'Tipo de dependência'
        }
      },
      required: ['task_id', 'depends_on_task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, depends_on_task_id, dependency_type = 'finish_to_start' } = args;

      // Verificar se as tarefas existem
      const task = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tbltasks WHERE id = ?',
        [task_id]
      );

      const dependsOnTask = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tbltasks WHERE id = ?',
        [depends_on_task_id]
      );

      if (!task) {
        throw new Error('Tarefa não encontrada');
      }

      if (!dependsOnTask) {
        throw new Error('Tarefa de dependência não encontrada');
      }

      // Verificar se dependência já existe
      const existingDependency = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        'SELECT id FROM tbltask_dependencies WHERE task_id = ? AND depends_on_task_id = ?',
        [task_id, depends_on_task_id]
      );

      if (existingDependency) {
        throw new Error('Dependência já existe');
      }

      // Criar dependência
      const dependencyId = await mysqlClient.executeInsert(
        `
        INSERT INTO tbltask_dependencies (task_id, depends_on_task_id, dependency_type, created_at)
        VALUES (?, ?, ?, NOW())
      `,
        [task_id, depends_on_task_id, dependency_type]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Dependência criada com sucesso',
                dependency_id: dependencyId,
                task_id,
                depends_on_task_id,
                dependency_type
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
    name: 'remove_task_dependency',
    description: 'Remover dependência entre tarefas',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID da tarefa dependente' },
        depends_on_task_id: { type: 'number', description: 'ID da tarefa da qual depende' }
      },
      required: ['task_id', 'depends_on_task_id']
    },
    handler: async (args, mysqlClient) => {
      const { task_id, depends_on_task_id } = args;

      const result = await mysqlClient.query<ResultSetHeader>(
        'DELETE FROM tbltask_dependencies WHERE task_id = ? AND depends_on_task_id = ?',
        [task_id, depends_on_task_id]
      );

      if (!result || (result as any).length === 0 || (result as any)[0]?.affectedRows === 0) {
        throw new Error('Dependência não encontrada');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Dependência removida com sucesso',
                task_id,
                depends_on_task_id
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
    name: 'get_project_critical_path',
    description: 'Calcular caminho crítico do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id } = args;

      // Obter todas as tarefas do projeto
      const tasks = await mysqlClient.query<
        {
          id: number;
          name: string;
          startdate: Date;
          duedate: Date;
          status: number;
        } & DatabaseRow
      >(
        `
        SELECT id, name, startdate, duedate, status
        FROM tbltasks 
        WHERE rel_type = 'project' AND rel_id = ?
      `,
        [project_id]
      );

      // Obter dependências
      const dependencies = await mysqlClient.query<
        {
          task_id: number;
          depends_on_task_id: number;
          dependency_type: string;
        } & DatabaseRow
      >(
        `
        SELECT td.task_id, td.depends_on_task_id, td.dependency_type
        FROM tbltask_dependencies td
        JOIN tbltasks t ON td.task_id = t.id
        WHERE t.rel_type = 'project' AND t.rel_id = ?
      `,
        [project_id]
      );

      // Algoritmo simplificado para calcular caminho crítico
      const taskMap = new Map();
      tasks.forEach((task) => {
        const duration = Math.ceil(
          (new Date(task.duedate).getTime() - new Date(task.startdate).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        taskMap.set(task.id, {
          ...task,
          duration,
          earliest_start: 0,
          earliest_finish: 0,
          latest_start: 0,
          latest_finish: 0,
          slack: 0,
          is_critical: false
        });
      });

      // Forward pass - calcular earliest start/finish
      const visited = new Set();
      const calculateEarliest = (taskId: number): number => {
        if (visited.has(taskId)) return taskMap.get(taskId).earliest_finish;

        visited.add(taskId);
        const task = taskMap.get(taskId);
        if (!task) return 0;

        const predecessors = dependencies.filter((d) => d.task_id === taskId);
        let maxPredecessorFinish = 0;

        for (const dep of predecessors) {
          const predFinish = calculateEarliest(dep.depends_on_task_id);
          maxPredecessorFinish = Math.max(maxPredecessorFinish, predFinish);
        }

        task.earliest_start = maxPredecessorFinish;
        task.earliest_finish = task.earliest_start + task.duration;
        return task.earliest_finish;
      };

      tasks.forEach((task) => calculateEarliest(task.id));

      // Encontrar finish time do projeto
      const projectFinish = Math.max(
        ...Array.from(taskMap.values()).map((t: any) => t.earliest_finish)
      );

      // Backward pass - calcular latest start/finish
      const visitedBackward = new Set();
      const calculateLatest = (taskId: number): number => {
        if (visitedBackward.has(taskId)) return taskMap.get(taskId).latest_start;

        visitedBackward.add(taskId);
        const task = taskMap.get(taskId);
        if (!task) return projectFinish;

        const successors = dependencies.filter((d) => d.depends_on_task_id === taskId);
        let minSuccessorStart = projectFinish;

        if (successors.length === 0) {
          // Tarefa final
          task.latest_finish = projectFinish;
        } else {
          for (const dep of successors) {
            const succStart = calculateLatest(dep.task_id);
            minSuccessorStart = Math.min(minSuccessorStart, succStart);
          }
          task.latest_finish = minSuccessorStart;
        }

        task.latest_start = task.latest_finish - task.duration;
        task.slack = task.latest_start - task.earliest_start;
        task.is_critical = task.slack === 0;

        return task.latest_start;
      };

      tasks.forEach((task) => calculateLatest(task.id));

      // Identificar caminho crítico
      const criticalTasks = Array.from(taskMap.values()).filter((t: any) => t.is_critical);
      const criticalPath = criticalTasks.map((t: any) => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        earliest_start: t.earliest_start,
        latest_start: t.latest_start,
        slack: t.slack
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                project_id,
                project_duration: projectFinish,
                critical_path: criticalPath,
                total_critical_tasks: criticalPath.length,
                all_tasks_analysis: Array.from(taskMap.values()).map((t: any) => ({
                  id: t.id,
                  name: t.name,
                  duration: t.duration,
                  slack: t.slack,
                  is_critical: t.is_critical
                }))
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
    name: 'update_project_timeline',
    description: 'Atualizar timeline do projeto baseado em dependências',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'ID do projeto' },
        auto_schedule: {
          type: 'boolean',
          description: 'Reagendar automaticamente baseado em dependências'
        }
      },
      required: ['project_id']
    },
    handler: async (args, mysqlClient) => {
      const { project_id, auto_schedule = true } = args;

      if (!auto_schedule) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Auto-schedule desabilitado',
                  project_id
                },
                null,
                2
              )
            }
          ]
        };
      }

      // Obter tarefas e dependências
      const tasks = await mysqlClient.query<
        {
          id: number;
          name: string;
          startdate: Date;
          duedate: Date;
          status: number;
        } & DatabaseRow
      >(
        `
        SELECT id, name, startdate, duedate, status
        FROM tbltasks 
        WHERE rel_type = 'project' AND rel_id = ?
      `,
        [project_id]
      );

      const dependencies = await mysqlClient.query<
        {
          task_id: number;
          depends_on_task_id: number;
        } & DatabaseRow
      >(
        `
        SELECT td.task_id, td.depends_on_task_id
        FROM tbltask_dependencies td
        JOIN tbltasks t ON td.task_id = t.id
        WHERE t.rel_type = 'project' AND t.rel_id = ?
      `,
        [project_id]
      );

      // Reescalonar tarefas baseado em dependências
      const taskMap = new Map();
      tasks.forEach((task) => {
        const duration =
          Math.ceil(
            (new Date(task.duedate).getTime() - new Date(task.startdate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) || 1;
        taskMap.set(task.id, { ...task, duration, new_start: null, new_end: null });
      });

      const scheduled = new Set();
      const scheduleTask = (taskId: number, projectStartDate: Date): void => {
        if (scheduled.has(taskId)) return;

        const task = taskMap.get(taskId);
        if (!task) return;

        const predecessors = dependencies.filter((d) => d.task_id === taskId);
        let earliestStart = projectStartDate;

        // Considerar predecessores
        for (const dep of predecessors) {
          scheduleTask(dep.depends_on_task_id, projectStartDate);
          const predecessorTask = taskMap.get(dep.depends_on_task_id);
          if (predecessorTask && predecessorTask.new_end) {
            const predecessorEnd = new Date(predecessorTask.new_end);
            predecessorEnd.setDate(predecessorEnd.getDate() + 1); // Dia seguinte
            if (predecessorEnd > earliestStart) {
              earliestStart = predecessorEnd;
            }
          }
        }

        task.new_start = earliestStart;
        task.new_end = new Date(earliestStart);
        task.new_end.setDate(task.new_end.getDate() + task.duration);

        scheduled.add(taskId);
      };

      // Obter data de início do projeto
      const project = await mysqlClient.queryOne<{ start_date: Date } & DatabaseRow>(
        'SELECT start_date FROM tblprojects WHERE id = ?',
        [project_id]
      );

      const projectStartDate = project ? new Date(project.start_date) : new Date();

      // Escalonar todas as tarefas
      tasks.forEach((task) => scheduleTask(task.id, projectStartDate));

      // Atualizar no banco de dados
      const updates = [];
      const taskIds = Array.from(taskMap.keys());
      for (const taskId of taskIds) {
        const task = taskMap.get(taskId);
        if (task && task.new_start && task.new_end) {
          await mysqlClient.query<ResultSetHeader>(
            'UPDATE tbltasks SET startdate = ?, duedate = ? WHERE id = ?',
            [
              task.new_start.toISOString().split('T')[0],
              task.new_end.toISOString().split('T')[0],
              taskId
            ]
          );

          updates.push({
            task_id: taskId,
            task_name: task.name,
            old_start: task.startdate,
            new_start: task.new_start.toISOString().split('T')[0],
            old_end: task.duedate,
            new_end: task.new_end.toISOString().split('T')[0]
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Timeline do projeto atualizado com sucesso',
                project_id,
                updated_tasks: updates.length,
                updates
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
