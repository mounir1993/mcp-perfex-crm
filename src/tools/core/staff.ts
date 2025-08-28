import { MySQLClient } from '../../mysql-client.js';
import { DatabaseRow } from '../../types/mysql.js';

export interface StaffTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

interface StaffRow extends DatabaseRow {
  staffid: number;
  firstname: string;
  lastname: string;
  email: string;
  active: number;
  admin: number;
  full_name: string;
  active_tasks: number;
}

export const staffTools: StaffTool[] = [
  {
    name: 'get_staff',
    description: 'Listar funcionários com filtros',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        active: { type: 'boolean', description: 'Apenas funcionários ativos' },
        search: { type: 'string', description: 'Buscar por nome ou email' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          s.staffid,
          s.firstname,
          s.lastname,
          s.email,
          s.phonenumber,
          s.active,
          s.datecreated,
          s.last_login,
          s.admin,
          CONCAT(s.firstname, ' ', s.lastname) as full_name,
          CASE s.active
            WHEN 1 THEN 'Ativo'
            ELSE 'Inativo'
          END as status_display,
          (SELECT COUNT(*) FROM tbltasks t 
           JOIN tbltask_assigned ta ON t.id = ta.taskid 
           WHERE ta.staffid = s.staffid AND t.status != 5) as active_tasks
        FROM tblstaff s
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.active !== undefined) {
        sql += ' AND s.active = ?';
        params.push(args.active ? 1 : 0);
      }

      if (args?.search) {
        sql += ' AND (s.firstname LIKE ? OR s.lastname LIKE ? OR s.email LIKE ?)';
        const searchTerm = `%${args.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      sql += ' ORDER BY s.firstname, s.lastname LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const staff = await mysqlClient.query<StaffRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                staff: staff.map((s) => ({
                  staffid: s.staffid,
                  full_name: s.full_name,
                  email: s.email,
                  phonenumber: s.phonenumber,
                  active: s.active === 1,
                  status_display: s.status_display,
                  admin: s.admin === 1,
                  active_tasks: s.active_tasks,
                  datecreated: s.datecreated,
                  last_login: s.last_login
                })),
                pagination: {
                  limit,
                  offset,
                  count: staff.length
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
    name: 'get_staff_detail',
    description: 'Obter detalhes completos de um funcionário',
    inputSchema: {
      type: 'object',
      properties: {
        staff_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { staff_id } = args;

      const staff = await mysqlClient.queryOne<StaffRow>(
        `
        SELECT 
          s.*,
          CONCAT(s.firstname, ' ', s.lastname) as full_name
        FROM tblstaff s
        WHERE s.staffid = ?
      `,
        [staff_id]
      );

      if (!staff) {
        throw new Error('Funcionário não encontrado');
      }

      // Buscar tarefas atribuídas
      const tasks = await mysqlClient.query(
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
          END as status_name
        FROM tbltasks t
        JOIN tbltask_assigned ta ON t.id = ta.taskid
        WHERE ta.staffid = ? AND t.status != 5
        ORDER BY t.priority DESC, t.duedate ASC
      `,
        [staff_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                staff: {
                  staffid: staff.staffid,
                  full_name: staff.full_name,
                  firstname: staff.firstname,
                  lastname: staff.lastname,
                  email: staff.email,
                  phonenumber: staff.phonenumber,
                  active: staff.active === 1,
                  admin: staff.admin === 1,
                  datecreated: staff.datecreated,
                  last_login: staff.last_login,
                  active_tasks_count: tasks.length,
                  assigned_tasks: tasks
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
    name: 'staff_workload_summary',
    description: 'Resumo de carga de trabalho dos funcionários',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: { type: 'boolean', description: 'Apenas funcionários ativos' }
      }
    },
    handler: async (args, mysqlClient) => {
      const activeOnly = args?.active_only !== false;

      let sql = `
        SELECT 
          s.staffid,
          CONCAT(s.firstname, ' ', s.lastname) as staff_name,
          s.active,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN t.status = 1 THEN 1 END) as not_started,
          COUNT(CASE WHEN t.status = 2 THEN 1 END) as in_progress,
          COUNT(CASE WHEN t.status = 3 THEN 1 END) as testing,
          COUNT(CASE WHEN t.status = 4 THEN 1 END) as awaiting_feedback,
          COUNT(CASE WHEN t.duedate < CURDATE() AND t.status != 5 THEN 1 END) as overdue_tasks,
          COUNT(CASE WHEN t.priority >= 3 THEN 1 END) as high_priority_tasks
        FROM tblstaff s
        LEFT JOIN tbltask_assigned ta ON s.staffid = ta.staffid
        LEFT JOIN tbltasks t ON ta.taskid = t.id AND t.status != 5
        WHERE 1=1
      `;

      const params: any[] = [];

      if (activeOnly) {
        sql += ' AND s.active = 1';
      }

      sql += `
        GROUP BY s.staffid, s.firstname, s.lastname, s.active
        ORDER BY total_tasks DESC, s.firstname
      `;

      const workload = await mysqlClient.query(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workload_summary: workload.map((w: any) => ({
                  staffid: w.staffid,
                  staff_name: w.staff_name,
                  active: w.active === 1,
                  total_tasks: w.total_tasks,
                  breakdown: {
                    not_started: w.not_started,
                    in_progress: w.in_progress,
                    testing: w.testing,
                    awaiting_feedback: w.awaiting_feedback
                  },
                  overdue_tasks: w.overdue_tasks,
                  high_priority_tasks: w.high_priority_tasks
                })),
                totals: {
                  total_staff: workload.length,
                  total_tasks: workload.reduce((sum: number, w: any) => sum + w.total_tasks, 0),
                  total_overdue: workload.reduce((sum: number, w: any) => sum + w.overdue_tasks, 0)
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
    name: 'create_staff',
    description: 'Criar novo funcionário',
    inputSchema: {
      type: 'object',
      properties: {
        firstname: { type: 'string', description: 'Nome próprio' },
        lastname: { type: 'string', description: 'Apelido' },
        email: { type: 'string', description: 'Email' },
        phonenumber: { type: 'string', description: 'Telefone' },
        password: { type: 'string', description: 'Password' },
        admin: { type: 'boolean', description: 'É administrador' },
        send_welcome_email: { type: 'boolean', description: 'Enviar email de boas-vindas' }
      },
      required: ['firstname', 'lastname', 'email', 'password']
    },
    handler: async (args, mysqlClient) => {
      const {
        firstname,
        lastname,
        email,
        phonenumber = '',
        password,
        admin = false,
        send_welcome_email = false
      } = args;

      // Hash da password (simplificado - em produção usar bcrypt)
      const hashedPassword = password; // TODO: implementar hash adequado

      const staffId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblstaff (
          firstname, lastname, email, phonenumber, password, 
          admin, active, datecreated, send_welcome_email
        ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), ?)
      `,
        [
          firstname,
          lastname,
          email,
          phonenumber,
          hashedPassword,
          admin ? 1 : 0,
          send_welcome_email ? 1 : 0
        ]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Funcionário criado com sucesso',
                staff_id: staffId,
                email,
                full_name: `${firstname} ${lastname}`,
                admin: admin,
                note: 'Password deve ser alterada no primeiro login'
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
