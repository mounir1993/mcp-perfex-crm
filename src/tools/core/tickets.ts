import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface TicketsTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface TicketRow extends DatabaseRow {
  ticketid: number;
  ticketkey: string;
  subject: string;
  userid: number;
  client_name: string;
  contactid: number;
  contact_name: string;
  email: string;
  department: number;
  department_name: string;
  priority: number;
  priority_name: string;
  status: number;
  status_name: string;
  date: Date;
  // last_reply não é campo padrão - será calculado baseado nas respostas
  assigned: number;
  assigned_name: string;
  tags: string;
  project_id: number;
  cc: string;
}

interface TicketDetailRow extends DatabaseRow {
  ticketid: number;
  ticketkey: string;
  subject: string;
  userid: number;
  client_name: string;
  contactid: number;
  contact_name: string;
  contact_email: string;
  department: number;
  department_name: string;
  priority: number;
  priority_name: string;
  status: number;
  status_name: string;
  date: Date;
  // last_reply não é campo padrão - será calculado baseado nas respostas
  assigned: number;
  assigned_name: string;
  message: string;
  admin_replying: number;
  project_id: number;
  cc: string;
  tags: string;
  knowledge_link: number;
  merged_ticket_id: number;
}

interface TicketReplyRow extends DatabaseRow {
  id: number;
  ticketid: number;
  userid: number;
  contactid: number;
  name: string;
  email: string;
  date: Date;
  message: string;
  attachment: string;
  admin: number;
  admin_name: string;
}

interface TicketStatsRow extends DatabaseRow {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  answered_tickets: number;
  on_hold_tickets: number;
  closed_tickets: number;
  avg_response_time: number;
  avg_resolution_time: number;
  satisfaction_rating: number;
}

interface DepartmentStatsRow extends DatabaseRow {
  department_id: number;
  department_name: string;
  total_tickets: number;
  open_tickets: number;
  closed_tickets: number;
  avg_response_time: number;
  resolution_rate: number;
}

export const ticketsTools: TicketsTool[] = [
  {
    name: 'get_tickets',
    description: 'Listar tickets com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        status: {
          type: 'number',
          description:
            'ID do status (1=Aberto, 2=Em Progresso, 3=Respondido, 4=Em Espera, 5=Fechado)'
        },
        priority: {
          type: 'number',
          description: 'ID da prioridade (1=Baixa, 2=Média, 3=Alta, 4=Urgente)'
        },
        department: { type: 'number', description: 'ID do departamento' },
        assigned: { type: 'number', description: 'ID do funcionário responsável' },
        client_id: { type: 'number', description: 'ID do cliente' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        search: { type: 'string', description: 'Buscar por assunto, ticketkey ou email' },
        unassigned_only: { type: 'boolean', description: 'Apenas tickets não atribuídos' },
        overdue_only: { type: 'boolean', description: 'Apenas tickets em atraso' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          t.ticketid,
          t.ticketkey,
          t.subject,
          t.userid,
          c.company as client_name,
          t.contactid,
          co.firstname as contact_name,
          t.email,
          t.department,
          d.name as department_name,
          t.priority,
          CASE t.priority
            WHEN 1 THEN 'Baixa'
            WHEN 2 THEN 'Média'
            WHEN 3 THEN 'Alta'
            WHEN 4 THEN 'Urgente'
            ELSE 'Desconhecido'
          END as priority_name,
          t.status,
          CASE t.status
            WHEN 1 THEN 'Aberto'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Respondido'
            WHEN 4 THEN 'Em Espera'
            WHEN 5 THEN 'Fechado'
            ELSE 'Desconhecido'
          END as status_name,
          t.date,
          (SELECT MAX(date) FROM tblticket_replies WHERE ticketid = t.ticketid) as last_reply_date,
          t.assigned,
          CONCAT(s.firstname, ' ', s.lastname) as assigned_name,
          t.project_id,
          t.cc,
          '' as tags
        FROM tbltickets t
        LEFT JOIN tblclients c ON t.userid = c.userid
        LEFT JOIN tblcontacts co ON t.contactid = co.id
        LEFT JOIN tbldepartments d ON t.department = d.departmentid
        LEFT JOIN tblstaff s ON t.assigned = s.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.status !== undefined) {
        sql += ' AND t.status = ?';
        params.push(args.status);
      }

      if (args?.priority !== undefined) {
        sql += ' AND t.priority = ?';
        params.push(args.priority);
      }

      if (args?.department !== undefined) {
        sql += ' AND t.department = ?';
        params.push(args.department);
      }

      if (args?.assigned !== undefined) {
        sql += ' AND t.assigned = ?';
        params.push(args.assigned);
      }

      if (args?.client_id !== undefined) {
        sql += ' AND t.userid = ?';
        params.push(args.client_id);
      }

      if (args?.date_from) {
        sql += ' AND DATE(t.date) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(t.date) <= ?';
        params.push(args.date_to);
      }

      if (args?.search) {
        sql += ' AND (t.subject LIKE ? OR t.ticketkey LIKE ? OR t.email LIKE ?)';
        const searchTerm = `%${args.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (args?.unassigned_only) {
        sql += ' AND (t.assigned IS NULL OR t.assigned = 0)';
      }

      if (args?.overdue_only) {
        sql +=
          ' AND t.status IN (1,2,3,4) AND DATEDIFF(NOW(), COALESCE((SELECT MAX(date) FROM tblticket_replies WHERE ticketid = t.ticketid), t.date)) > 24';
      }

      sql += ' ORDER BY t.priority DESC, t.date DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const tickets = await mysqlClient.query<TicketRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tickets,
                pagination: {
                  limit,
                  offset,
                  count: tickets.length
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
    name: 'get_ticket',
    description: 'Obter detalhes completos de um ticket específico',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket' },
        ticketkey: { type: 'string', description: 'Chave do ticket (alternativa ao ID)' }
      }
    },
    handler: async (args, mysqlClient) => {
      if (!args?.ticket_id && !args?.ticketkey) {
        throw new Error('ticket_id ou ticketkey é obrigatório');
      }

      let whereClause = '';
      let whereParam;

      if (args.ticket_id) {
        whereClause = 't.ticketid = ?';
        whereParam = args.ticket_id;
      } else {
        whereClause = 't.ticketkey = ?';
        whereParam = args.ticketkey;
      }

      const sql = `
        SELECT 
          t.*,
          c.company as client_name,
          co.firstname as contact_name,
          co.email as contact_email,
          d.name as department_name,
          CASE t.priority
            WHEN 1 THEN 'Baixa'
            WHEN 2 THEN 'Média'
            WHEN 3 THEN 'Alta'
            WHEN 4 THEN 'Urgente'
            ELSE 'Desconhecido'
          END as priority_name,
          CASE t.status
            WHEN 1 THEN 'Aberto'
            WHEN 2 THEN 'Em Progresso'
            WHEN 3 THEN 'Respondido'
            WHEN 4 THEN 'Em Espera'
            WHEN 5 THEN 'Fechado'
            ELSE 'Desconhecido'
          END as status_name,
          CONCAT(s.firstname, ' ', s.lastname) as assigned_name,
          '' as tags
        FROM tbltickets t
        LEFT JOIN tblclients c ON t.userid = c.userid
        LEFT JOIN tblcontacts co ON t.contactid = co.id
        LEFT JOIN tbldepartments d ON t.department = d.departmentid
        LEFT JOIN tblstaff s ON t.assigned = s.staffid
        WHERE ${whereClause}
      `;

      const ticket = await mysqlClient.queryOne<TicketDetailRow>(sql, [whereParam]);

      if (!ticket) {
        return {
          content: [
            {
              type: 'text',
              text: 'Ticket não encontrado'
            }
          ]
        };
      }

      // Buscar replies do ticket
      const repliesSql = `
        SELECT 
          tr.id,
          tr.ticketid,
          tr.userid,
          tr.contactid,
          tr.name,
          tr.email,
          tr.date,
          tr.message,
          tr.attachment,
          tr.admin,
          CONCAT(s.firstname, ' ', s.lastname) as admin_name
        FROM tblticket_replies tr
        LEFT JOIN tblstaff s ON tr.admin = s.staffid
        WHERE tr.ticketid = ?
        ORDER BY tr.date ASC
      `;
      const replies = await mysqlClient.query<TicketReplyRow>(repliesSql, [ticket.ticketid]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ticket: {
                  ...ticket,
                  replies
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
    name: 'create_ticket',
    description: 'Criar novo ticket de suporte',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Assunto do ticket' },
        message: { type: 'string', description: 'Mensagem inicial' },
        client_id: { type: 'number', description: 'ID do cliente' },
        contact_id: { type: 'number', description: 'ID do contacto' },
        email: { type: 'string', description: 'Email do requerente' },
        name: { type: 'string', description: 'Nome do requerente' },
        department: { type: 'number', description: 'ID do departamento' },
        priority: { type: 'number', description: 'Prioridade (1-4)' },
        assigned: { type: 'number', description: 'ID do funcionário responsável' },
        project_id: { type: 'number', description: 'ID do projeto relacionado' },
        cc: { type: 'string', description: 'Emails CC (separados por vírgula)' },
        tags: { type: 'string', description: 'Tags (separadas por vírgula)' }
      },
      required: ['subject', 'message']
    },
    handler: async (args, mysqlClient) => {
      const {
        subject,
        message,
        client_id = 0,
        contact_id = 0,
        email = '',
        name = '',
        department = 1,
        priority = 2,
        assigned = 0,
        project_id = 0,
        cc = '',
        tags = ''
      } = args;

      // Gerar ticketkey único
      const ticketkey = `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Armazenar tags na mensagem se fornecidas
      const messageWithTags = tags ? `${message}\n\n[TAGS: ${tags}]` : message;

      // Inserir ticket
      const ticketSql = `
        INSERT INTO tbltickets (
          ticketkey, subject, message, userid, contactid, email, name,
          department, priority, status, date, assigned, 
          project_id, cc, admin_replying
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?, ?, 0)
      `;

      const ticketId = await mysqlClient.executeInsert(ticketSql, [
        ticketkey,
        subject,
        messageWithTags,
        client_id,
        contact_id,
        email,
        name,
        department,
        priority,
        assigned,
        project_id,
        cc
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Ticket criado com sucesso',
                ticket_id: ticketId,
                ticketkey: ticketkey,
                subject: subject,
                priority: priority,
                department: department,
                assigned: assigned
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
    name: 'reply_ticket',
    description: 'Adicionar resposta a um ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket' },
        message: { type: 'string', description: 'Mensagem da resposta' },
        admin: { type: 'number', description: 'ID do funcionário (0 se for cliente)' },
        contact_id: { type: 'number', description: 'ID do contacto (se for cliente)' },
        name: { type: 'string', description: 'Nome do remetente' },
        email: { type: 'string', description: 'Email do remetente' },
        change_status: { type: 'number', description: 'Novo status do ticket' },
        internal_note: { type: 'boolean', description: 'É nota interna' }
      },
      required: ['ticket_id', 'message']
    },
    handler: async (args, mysqlClient) => {
      const {
        ticket_id,
        message,
        admin = 0,
        contact_id = 0,
        name = '',
        email = '',
        change_status,
        internal_note = false
      } = args;

      // Verificar se ticket existe
      const ticket = await mysqlClient.queryOne<
        { ticketid: number; status: number; userid: number } & DatabaseRow
      >('SELECT ticketid, status, userid FROM tbltickets WHERE ticketid = ?', [ticket_id]);

      if (!ticket) {
        throw new Error('Ticket não encontrado');
      }

      const messageContent = internal_note ? `[NOTA INTERNA] ${message}` : message;

      // Inserir resposta
      const replyId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblticket_replies (
          ticketid, userid, contactid, name, email, date, message, admin
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)
      `,
        [ticket_id, ticket.userid, contact_id, name, email, messageContent, admin]
      );

      // Atualizar status do ticket
      const newStatus = change_status !== undefined ? change_status : admin > 0 ? 3 : ticket.status; // Status 3 = Respondido se for admin

      await mysqlClient.query(
        `
        UPDATE tbltickets 
        SET status = ?, admin_replying = ?
        WHERE ticketid = ?
      `,
        [newStatus, admin, ticket_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Resposta adicionada com sucesso',
                reply_id: replyId,
                ticket_id: ticket_id,
                new_status: newStatus,
                is_internal_note: internal_note
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
    name: 'update_ticket',
    description: 'Atualizar propriedades de um ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket' },
        subject: { type: 'string', description: 'Novo assunto' },
        status: { type: 'number', description: 'Novo status' },
        priority: { type: 'number', description: 'Nova prioridade' },
        assigned: { type: 'number', description: 'Novo responsável' },
        department: { type: 'number', description: 'Novo departamento' },
        project_id: { type: 'number', description: 'Novo projeto' },
        tags: { type: 'string', description: 'Novas tags' }
      },
      required: ['ticket_id']
    },
    handler: async (args, mysqlClient) => {
      const { ticket_id, tags, ...updateFields } = args;

      // Verificar se ticket existe
      const ticket = await mysqlClient.queryOne<
        { ticketid: number; message: string } & DatabaseRow
      >('SELECT ticketid, message FROM tbltickets WHERE ticketid = ?', [ticket_id]);

      if (!ticket) {
        throw new Error('Ticket não encontrado');
      }

      const updateParts = [];
      const updateParams = [];

      // Campos normais
      const allowedFields = [
        'subject',
        'status',
        'priority',
        'assigned',
        'department',
        'project_id'
      ];
      for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
          updateParts.push(`${field} = ?`);
          updateParams.push(updateFields[field]);
        }
      }

      // Atualizar tags na mensagem se fornecidas
      if (tags !== undefined) {
        let newMessage = ticket.message;

        // Remover tags existentes
        newMessage = newMessage.replace(/\n\n\[TAGS:.*?\]/g, '');

        // Adicionar novas tags se fornecidas
        if (tags) {
          newMessage += `\n\n[TAGS: ${tags}]`;
        }

        updateParts.push('message = ?');
        updateParams.push(newMessage);
      }

      if (updateParts.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      updateParams.push(ticket_id);

      await mysqlClient.query(
        `UPDATE tbltickets SET ${updateParts.join(', ')} WHERE ticketid = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Ticket atualizado com sucesso',
                ticket_id: ticket_id,
                updated_fields: Object.keys(updateFields).filter(
                  (k) => updateFields[k] !== undefined
                )
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
    name: 'close_ticket',
    description: 'Fechar ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket' },
        close_message: { type: 'string', description: 'Mensagem de encerramento' },
        admin_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['ticket_id']
    },
    handler: async (args, mysqlClient) => {
      const { ticket_id, close_message, admin_id = 0 } = args;

      // Verificar se ticket existe
      const ticket = await mysqlClient.queryOne<{ ticketid: number; status: number } & DatabaseRow>(
        'SELECT ticketid, status FROM tbltickets WHERE ticketid = ?',
        [ticket_id]
      );

      if (!ticket) {
        throw new Error('Ticket não encontrado');
      }

      if (ticket.status === 5) {
        throw new Error('Ticket já está fechado');
      }

      // Adicionar mensagem de encerramento se fornecida
      if (close_message) {
        await mysqlClient.executeInsert(
          `
          INSERT INTO tblticket_replies (
            ticketid, userid, name, email, date, message, admin
          ) VALUES (?, 0, 'Sistema', '', NOW(), ?, ?)
        `,
          [ticket_id, `[ENCERRAMENTO] ${close_message}`, admin_id]
        );
      }

      // Fechar ticket
      await mysqlClient.query('UPDATE tbltickets SET status = 5 WHERE ticketid = ?', [ticket_id]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Ticket fechado com sucesso',
                ticket_id: ticket_id,
                closed_by: admin_id,
                close_message: close_message || 'Ticket encerrado'
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
    name: 'reopen_ticket',
    description: 'Reabrir ticket fechado',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket' },
        reopen_message: { type: 'string', description: 'Motivo da reabertura' },
        admin_id: { type: 'number', description: 'ID do funcionário' }
      },
      required: ['ticket_id']
    },
    handler: async (args, mysqlClient) => {
      const { ticket_id, reopen_message, admin_id = 0 } = args;

      // Verificar se ticket existe e está fechado
      const ticket = await mysqlClient.queryOne<{ ticketid: number; status: number } & DatabaseRow>(
        'SELECT ticketid, status FROM tbltickets WHERE ticketid = ?',
        [ticket_id]
      );

      if (!ticket) {
        throw new Error('Ticket não encontrado');
      }

      if (ticket.status !== 5) {
        throw new Error('Apenas tickets fechados podem ser reabertos');
      }

      // Adicionar mensagem de reabertura se fornecida
      if (reopen_message) {
        await mysqlClient.executeInsert(
          `
          INSERT INTO tblticket_replies (
            ticketid, userid, name, email, date, message, admin
          ) VALUES (?, 0, 'Sistema', '', NOW(), ?, ?)
        `,
          [ticket_id, `[REABERTURA] ${reopen_message}`, admin_id]
        );
      }

      // Reabrir ticket
      await mysqlClient.query('UPDATE tbltickets SET status = 1 WHERE ticketid = ?', [ticket_id]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Ticket reaberto com sucesso',
                ticket_id: ticket_id,
                reopened_by: admin_id,
                reopen_message: reopen_message || 'Ticket reaberto'
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
    name: 'assign_ticket',
    description: 'Atribuir ticket a funcionário',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket' },
        staff_id: { type: 'number', description: 'ID do funcionário' },
        note: { type: 'string', description: 'Nota sobre a atribuição' }
      },
      required: ['ticket_id', 'staff_id']
    },
    handler: async (args, mysqlClient) => {
      const { ticket_id, staff_id, note } = args;

      // Verificar se ticket e funcionário existem
      const ticket = await mysqlClient.queryOne<
        { ticketid: number; assigned: number } & DatabaseRow
      >('SELECT ticketid, assigned FROM tbltickets WHERE ticketid = ?', [ticket_id]);

      if (!ticket) {
        throw new Error('Ticket não encontrado');
      }

      const staff = await mysqlClient.queryOne<
        { staffid: number; firstname: string; lastname: string } & DatabaseRow
      >('SELECT staffid, firstname, lastname FROM tblstaff WHERE staffid = ?', [staff_id]);

      if (!staff) {
        throw new Error('Funcionário não encontrado');
      }

      // Atualizar atribuição
      await mysqlClient.query('UPDATE tbltickets SET assigned = ?, status = 2 WHERE ticketid = ?', [
        staff_id,
        ticket_id
      ]);

      // Adicionar nota de atribuição
      const assignmentNote = note || `Ticket atribuído a ${staff.firstname} ${staff.lastname}`;

      await mysqlClient.executeInsert(
        `
        INSERT INTO tblticket_replies (
          ticketid, userid, name, email, date, message, admin
        ) VALUES (?, 0, 'Sistema', '', NOW(), ?, ?)
      `,
        [ticket_id, `[ATRIBUIÇÃO] ${assignmentNote}`, staff_id]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Ticket atribuído com sucesso',
                ticket_id: ticket_id,
                assigned_to: `${staff.firstname} ${staff.lastname}`,
                staff_id: staff_id,
                note: assignmentNote
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
    name: 'ticket_analytics',
    description: 'Analytics de tickets - performance e estatísticas',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        department_id: { type: 'number', description: 'Filtrar por departamento' },
        staff_id: { type: 'number', description: 'Filtrar por funcionário' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const departmentId = args?.department_id;
      const staffId = args?.staff_id;

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND t.date >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND t.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND t.date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND t.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      let filters = '';
      const params: any[] = [];

      if (departmentId) {
        filters += ' AND t.department = ?';
        params.push(departmentId);
      }

      if (staffId) {
        filters += ' AND t.assigned = ?';
        params.push(staffId);
      }

      // Estatísticas gerais
      const statsSql = `
        SELECT 
          COUNT(*) as total_tickets,
          COUNT(CASE WHEN t.status = 1 THEN 1 END) as open_tickets,
          COUNT(CASE WHEN t.status = 2 THEN 1 END) as in_progress_tickets,
          COUNT(CASE WHEN t.status = 3 THEN 1 END) as answered_tickets,
          COUNT(CASE WHEN t.status = 4 THEN 1 END) as on_hold_tickets,
          COUNT(CASE WHEN t.status = 5 THEN 1 END) as closed_tickets,
          AVG(CASE WHEN t.status = 5 THEN TIMESTAMPDIFF(HOUR, t.date, COALESCE((SELECT MAX(date) FROM tblticket_replies WHERE ticketid = t.ticketid), t.date)) END) as avg_resolution_time,
          AVG(TIMESTAMPDIFF(HOUR, t.date, (SELECT MIN(tr.date) FROM tblticket_replies tr WHERE tr.ticketid = t.ticketid AND tr.admin > 0))) as avg_response_time
        FROM tbltickets t
        WHERE 1=1 ${dateFilter} ${filters}
      `;

      const stats = await mysqlClient.queryOne<TicketStatsRow>(statsSql, params);

      // Estatísticas por departamento
      const deptStatsSql = `
        SELECT 
          d.departmentid as department_id,
          d.name as department_name,
          COUNT(t.ticketid) as total_tickets,
          COUNT(CASE WHEN t.status IN (1,2,3,4) THEN 1 END) as open_tickets,
          COUNT(CASE WHEN t.status = 5 THEN 1 END) as closed_tickets,
          AVG(TIMESTAMPDIFF(HOUR, t.date, (SELECT MIN(tr.date) FROM tblticket_replies tr WHERE tr.ticketid = t.ticketid AND tr.admin > 0))) as avg_response_time,
          (COUNT(CASE WHEN t.status = 5 THEN 1 END) / COUNT(t.ticketid) * 100) as resolution_rate
        FROM tbldepartments d
        LEFT JOIN tbltickets t ON d.departmentid = t.department ${dateFilter.replace('AND t.', 'AND ')} ${filters}
        GROUP BY d.departmentid, d.name
        HAVING total_tickets > 0
        ORDER BY total_tickets DESC
      `;

      const departmentStats = await mysqlClient.query<DepartmentStatsRow>(
        deptStatsSql,
        staffId ? [staffId] : []
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                department_id: departmentId,
                staff_id: staffId,
                overall_stats: stats,
                department_breakdown: departmentStats,
                metrics: {
                  resolution_rate: stats
                    ? ((stats.closed_tickets / stats.total_tickets) * 100).toFixed(2) + '%'
                    : '0%',
                  response_time_hours: stats?.avg_response_time?.toFixed(1) || '0',
                  resolution_time_hours: stats?.avg_resolution_time?.toFixed(1) || '0'
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
    name: 'get_departments',
    description: 'Listar departamentos de suporte disponíveis',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: { type: 'boolean', description: 'Apenas departamentos ativos' }
      }
    },
    handler: async (args, mysqlClient) => {
      const activeOnly = args?.active_only !== false;

      let sql = `
        SELECT 
          d.departmentid,
          d.name,
          d.email,
          d.imap_username,
          d.host,
          d.password,
          d.calendar_id,
          COUNT(t.ticketid) as ticket_count,
          COUNT(CASE WHEN t.status IN (1,2,3,4) THEN 1 END) as open_tickets
        FROM tbldepartments d
        LEFT JOIN tbltickets t ON d.departmentid = t.department
        WHERE 1=1
      `;

      if (activeOnly) {
        sql += ' AND d.imap_username IS NOT NULL AND d.imap_username != ""';
      }

      sql += `
        GROUP BY d.departmentid, d.name, d.email, d.imap_username, d.host, d.password, d.calendar_id
        ORDER BY ticket_count DESC
      `;

      const departments = await mysqlClient.query(sql);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                departments,
                total_departments: departments.length
              },
              null,
              2
            )
          }
        ]
      };
    }
  },

  // FERRAMENTA URGENTE - Deletar ticket individual (para eliminar spam)
  {
    name: 'delete_ticket',
    description: '🚨 URGENTE: Deletar um ticket específico (use com cuidado!)',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket a deletar', required: true },
        confirm: {
          type: 'boolean',
          description: 'Confirmação de deleção (deve ser true)',
          required: true
        },
        reason: { type: 'string', description: 'Motivo da deleção (ex: spam, duplicado)' }
      },
      required: ['ticket_id', 'confirm']
    },
    handler: async (args, mysqlClient) => {
      if (!args.ticket_id) {
        throw new Error('ticket_id é obrigatório');
      }

      if (args.confirm !== true) {
        throw new Error('Confirmação necessária. Defina confirm: true para deletar');
      }

      const ticketId = args.ticket_id;

      // Verificar se o ticket existe
      const checkTicket = await mysqlClient.query<DatabaseRow>(
        'SELECT ticketid, ticketkey, subject FROM tbltickets WHERE ticketid = ?',
        [ticketId]
      );

      if (checkTicket.length === 0) {
        throw new Error(`Ticket ${ticketId} não encontrado`);
      }

      const ticket = checkTicket[0];

      // Iniciar transação
      await mysqlClient.query('START TRANSACTION');

      try {
        // 1. Deletar anexos
        await mysqlClient.query('DELETE FROM tblticket_attachments WHERE ticketid = ?', [ticketId]);

        // 2. Deletar respostas
        await mysqlClient.query('DELETE FROM tblticket_replies WHERE ticketid = ?', [ticketId]);

        // 3. Deletar notas - COMENTADO: tabela tblstaffticketsnotes não existe
        // await mysqlClient.query(
        //   'DELETE FROM tblstaffticketsnotes WHERE ticketid = ?',
        //   [ticketId]
        // );

        // 4. Deletar o ticket
        await mysqlClient.query<ResultSetHeader>('DELETE FROM tbltickets WHERE ticketid = ?', [
          ticketId
        ]);

        // 5. Log da ação
        if (args.reason) {
          await mysqlClient.query(
            `INSERT INTO tblactivity_log 
            (description, date, staffid) 
            VALUES (?, NOW(), 0)`,
            [`Ticket #${ticket.ticketkey} deletado. Motivo: ${args.reason}`]
          );
        }

        await mysqlClient.query('COMMIT');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Ticket #${ticket.ticketkey} deletado com sucesso`,
                  deleted_ticket: {
                    id: ticketId,
                    key: ticket.ticketkey,
                    subject: ticket.subject
                  },
                  reason: args.reason || 'Não especificado'
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        await mysqlClient.query('ROLLBACK');
        throw error;
      }
    }
  },

  // Deletar múltiplos tickets de uma vez
  {
    name: 'bulk_delete_tickets',
    description: 'Deletar múltiplos tickets de uma vez (útil para limpar spam em massa)',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array com IDs dos tickets a deletar',
          required: true
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmação de deleção (deve ser true)',
          required: true
        },
        reason: { type: 'string', description: 'Motivo da deleção em massa' }
      },
      required: ['ticket_ids', 'confirm']
    },
    handler: async (args, mysqlClient) => {
      if (!args.ticket_ids || !Array.isArray(args.ticket_ids) || args.ticket_ids.length === 0) {
        throw new Error('ticket_ids deve ser um array com pelo menos um ID');
      }

      if (args.confirm !== true) {
        throw new Error('Confirmação necessária. Defina confirm: true para deletar');
      }

      const ticketIds = args.ticket_ids;
      const placeholders = ticketIds.map(() => '?').join(',');

      // Verificar tickets existentes
      const checkTickets = await mysqlClient.query<DatabaseRow>(
        `SELECT ticketid, ticketkey, subject FROM tbltickets WHERE ticketid IN (${placeholders})`,
        ticketIds
      );

      if (checkTickets.length === 0) {
        throw new Error('Nenhum ticket encontrado com os IDs fornecidos');
      }

      // Iniciar transação
      await mysqlClient.query('START TRANSACTION');

      try {
        // 1. Deletar anexos
        await mysqlClient.query(
          `DELETE FROM tblticket_attachments WHERE ticketid IN (${placeholders})`,
          ticketIds
        );

        // 2. Deletar respostas
        await mysqlClient.query(
          `DELETE FROM tblticket_replies WHERE ticketid IN (${placeholders})`,
          ticketIds
        );

        // 3. Deletar notas - COMENTADO: tabela tblstaffticketsnotes não existe
        // await mysqlClient.query(
        //   `DELETE FROM tblstaffticketsnotes WHERE ticketid IN (${placeholders})`,
        //   ticketIds
        // );

        // 4. Deletar os tickets
        await mysqlClient.query<ResultSetHeader>(
          `DELETE FROM tbltickets WHERE ticketid IN (${placeholders})`,
          ticketIds
        );

        // 5. Log da ação
        const ticketKeys = checkTickets.map((t) => t.ticketkey).join(', ');
        await mysqlClient.query(
          `INSERT INTO tblactivity_log 
          (description, date, staffid) 
          VALUES (?, NOW(), 0)`,
          [
            `${checkTickets.length} tickets deletados em massa: ${ticketKeys}. Motivo: ${args.reason || 'Não especificado'}`
          ]
        );

        await mysqlClient.query('COMMIT');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `${checkTickets.length} tickets deletados com sucesso`,
                  deleted_tickets: checkTickets.map((t) => ({
                    id: t.ticketid,
                    key: t.ticketkey,
                    subject: t.subject
                  })),
                  total_deleted: checkTickets.length,
                  reason: args.reason || 'Não especificado'
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        await mysqlClient.query('ROLLBACK');
        throw error;
      }
    }
  },

  // Upload de anexo para ticket
  {
    name: 'upload_ticket_attachment',
    description: 'Fazer upload de anexo para um ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'ID do ticket', required: true },
        reply_id: { type: 'number', description: 'ID da resposta (opcional)' },
        file_name: { type: 'string', description: 'Nome do arquivo', required: true },
        file_type: { type: 'string', description: 'Tipo MIME do arquivo' },
        file_content: {
          type: 'string',
          description: 'Conteúdo do arquivo em base64',
          required: true
        }
      },
      required: ['ticket_id', 'file_name', 'file_content']
    },
    handler: async (args, mysqlClient) => {
      const { ticket_id, reply_id, file_name, file_type } = args;
      // file_content not used in current implementation

      // Verificar se o ticket existe
      const checkTicket = await mysqlClient.query<DatabaseRow>(
        'SELECT ticketid FROM tbltickets WHERE ticketid = ?',
        [ticket_id]
      );

      if (checkTicket.length === 0) {
        throw new Error(`Ticket ${ticket_id} não encontrado`);
      }

      // Gerar nome único para o arquivo
      const uniqueFileName = `${Date.now()}_${file_name}`;

      // Inserir anexo no banco
      const [result] = await mysqlClient.query<ResultSetHeader[]>(
        `INSERT INTO tblticket_attachments 
        (ticketid, replyid, file_name, filetype, dateadded) 
        VALUES (?, ?, ?, ?, NOW())`,
        [ticket_id, reply_id || 0, uniqueFileName, file_type || 'application/octet-stream']
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Anexo adicionado com sucesso',
                attachment: {
                  id: (result as any).insertId,
                  ticket_id: ticket_id,
                  reply_id: reply_id || null,
                  file_name: uniqueFileName,
                  file_type: file_type || 'application/octet-stream',
                  original_name: file_name
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

  // Exportar tickets
  {
    name: 'export_tickets',
    description: 'Exportar tickets com filtros para relatórios',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Formato de exportação (json, csv)',
          enum: ['json', 'csv'],
          default: 'json'
        },
        status: { type: 'number', description: 'Filtrar por status' },
        department: { type: 'number', description: 'Filtrar por departamento' },
        priority: { type: 'number', description: 'Filtrar por prioridade' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        include_replies: { type: 'boolean', description: 'Incluir respostas dos tickets' },
        limit: { type: 'number', description: 'Limite de tickets (padrão: 1000)' }
      }
    },
    handler: async (args, mysqlClient) => {
      const format = args?.format || 'json';
      const limit = args?.limit || 1000;

      let sql = `
        SELECT 
          t.ticketid,
          t.ticketkey,
          t.subject,
          t.userid,
          COALESCE(c.company, CONCAT(ct.firstname, ' ', ct.lastname)) as client_name,
          t.contactid,
          CONCAT(ct.firstname, ' ', ct.lastname) as contact_name,
          t.email,
          t.department,
          d.name as department_name,
          t.priority,
          p.name as priority_name,
          t.status,
          s.name as status_name,
          t.date as created_date,
          t.lastreply as last_reply_date,
          t.message,
          t.assigned,
          CONCAT(st.firstname, ' ', st.lastname) as assigned_name,
          t.tags,
          t.project_id
        FROM tbltickets t
        LEFT JOIN tblclients c ON t.userid = c.userid
        LEFT JOIN tblcontacts ct ON t.contactid = ct.id
        LEFT JOIN tbldepartments d ON t.department = d.departmentid
        LEFT JOIN tbltickets_priorities p ON t.priority = p.priorityid
        LEFT JOIN tblticketstatus s ON t.status = s.ticketstatusid
        LEFT JOIN tblstaff st ON t.assigned = st.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.status) {
        sql += ' AND t.status = ?';
        params.push(args.status);
      }

      if (args?.department) {
        sql += ' AND t.department = ?';
        params.push(args.department);
      }

      if (args?.priority) {
        sql += ' AND t.priority = ?';
        params.push(args.priority);
      }

      if (args?.date_from) {
        sql += ' AND DATE(t.date) >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND DATE(t.date) <= ?';
        params.push(args.date_to);
      }

      sql += ` ORDER BY t.date DESC LIMIT ${limit}`;

      const tickets = await mysqlClient.query<any>(sql, params);

      // Se incluir respostas
      if (args?.include_replies && tickets.length > 0) {
        const ticketIds = tickets.map((t: any) => t.ticketid);
        const placeholders = ticketIds.map(() => '?').join(',');

        const replies = await mysqlClient.query<any>(
          `SELECT 
            r.id as reply_id,
            r.ticketid,
            r.userid,
            r.contactid,
            r.name,
            r.email,
            r.date,
            r.message,
            r.admin,
            CONCAT(s.firstname, ' ', s.lastname) as staff_name
          FROM tblticket_replies r
          LEFT JOIN tblstaff s ON r.admin = s.staffid AND r.admin IS NOT NULL
          WHERE r.ticketid IN (${placeholders})
          ORDER BY r.ticketid, r.date`,
          ticketIds
        );

        // Agrupar respostas por ticket
        const repliesByTicket = replies.reduce((acc: any, reply: any) => {
          if (!acc[reply.ticketid]) acc[reply.ticketid] = [];
          acc[reply.ticketid].push(reply);
          return acc;
        }, {});

        // Adicionar respostas aos tickets
        tickets.forEach((ticket: any) => {
          ticket.replies = repliesByTicket[ticket.ticketid] || [];
        });
      }

      if (format === 'csv') {
        // Converter para CSV
        const headers = Object.keys(tickets[0] || {}).filter((k) => k !== 'replies');
        const csv = [
          headers.join(','),
          ...tickets.map((t: any) =>
            headers
              .map((h) => {
                const value = t[h];
                // Escapar valores com vírgulas ou quebras de linha
                if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
              })
              .join(',')
          )
        ].join('\n');

        return {
          content: [
            {
              type: 'text',
              text: csv
            }
          ]
        };
      }

      // Formato JSON (padrão)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                export_date: new Date().toISOString(),
                total_tickets: tickets.length,
                filters_applied: {
                  status: args?.status,
                  department: args?.department,
                  priority: args?.priority,
                  date_from: args?.date_from,
                  date_to: args?.date_to
                },
                tickets: tickets
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
