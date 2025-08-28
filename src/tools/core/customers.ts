import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';
import { Customer } from '../../types/db.js';
import { BaseTool } from '../../types/tools.js';

// Customer specific row types that extend the base types
interface CustomerRow extends Customer, DatabaseRow {
  country_name?: string;
  total_invoices?: number;
  total_paid?: number;
  total_projects?: number;
  total_tickets?: number;
}

interface CustomerDetailRow extends CustomerRow {
  groups_names?: string;
  last_invoice_date?: Date;
}

interface ContactRow extends DatabaseRow {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  phonenumber: string;
  title: string;
  is_primary: number;
  active: number;
  last_login: Date;
}

interface GroupRow extends DatabaseRow {
  id: number;
  name: string;
  description: string;
  customer_count?: number;
}

interface AnalyticsRow extends DatabaseRow {
  company: string;
  total_invoices: number;
  total_invoiced: number;
  total_paid: number;
  avg_invoice_value: number;
  active_projects: number;
  support_tickets: number;
  days_as_customer: number;
  last_invoice_date: Date;
  payment_efficiency: number;
}

export const customersTools: BaseTool[] = [
  {
    name: 'get_customers',
    description: 'Lista clientes com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        active: { type: 'boolean', description: 'Filtrar apenas clientes ativos' },
        search: { type: 'string', description: 'Pesquisar por nome da empresa' },
        country: { type: 'number', description: 'Filtrar por país (ID)' },
        created_from: { type: 'string', description: 'Data inicial criação (YYYY-MM-DD)' },
        created_to: { type: 'string', description: 'Data final criação (YYYY-MM-DD)' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;
      const active = args?.active;
      const search = args?.search;
      const country = args?.country;
      const createdFrom = args?.created_from;
      const createdTo = args?.created_to;

      let sql = `
        SELECT 
          c.userid,
          c.company,
          c.vat,
          c.phonenumber,
          c.city,
          c.country,
          co.short_name as country_name, c.website,
          c.datecreated,
          c.active,
          COUNT(DISTINCT i.id) as total_invoices, SUM(CASE WHEN i.status = 2 THEN i.total ELSE 0 END) as total_paid, COUNT(DISTINCT p.id) as total_projects, COUNT(DISTINCT t.ticketid) as total_tickets
        FROM tblclients c
        LEFT JOIN tblcountries co ON c.country = co.country_id
        LEFT JOIN tblinvoices i ON c.userid = i.clientid
        LEFT JOIN tblprojects p ON c.userid = p.clientid
        LEFT JOIN tbltickets t ON c.userid = t.userid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (active !== undefined) {
        sql += ' AND c.active = ?';
        params.push(active ? 1 : 0);
      }

      if (search) {
        sql += ' AND (c.company LIKE ? OR c.vat LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (country) {
        sql += ' AND c.country = ?';
        params.push(country);
      }

      if (createdFrom) {
        sql += ' AND DATE(c.datecreated) >= ?';
        params.push(createdFrom);
      }

      if (createdTo) {
        sql += ' AND DATE(c.datecreated) <= ?';
        params.push(createdTo);
      }

      sql += ` 
        GROUP BY c.userid
        ORDER BY c.company ASC 
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const customers = await mysqlClient.query<CustomerRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                customers,
                pagination: {
                  limit,
                  offset,
                  count: customers.length
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
    name: 'get_customer',
    description: 'Obter detalhes completos de um cliente específico',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' }
      },
      required: ['client_id']
    },
    handler: async (args, mysqlClient) => {
      const clientId = args?.client_id;
      if (!clientId) {
        throw new Error('client_id é obrigatório');
      }

      const sql = `
        SELECT 
          c.*,
          co.short_name as country_name, GROUP_CONCAT(DISTINCT cg.name) as groups_names,
          (SELECT COUNT(*) FROM tblinvoices WHERE clientid = c.userid) as total_invoices,
          (SELECT SUM(total) FROM tblinvoices WHERE clientid = c.userid AND status = 2) as total_paid,
          (SELECT COUNT(*) FROM tblprojects WHERE clientid = c.userid) as total_projects,
          (SELECT COUNT(*) FROM tbltickets WHERE userid = c.userid) as total_tickets,
          (SELECT MAX(date) FROM tblinvoices WHERE clientid = c.userid) as last_invoice_date
        FROM tblclients c
        LEFT JOIN tblcountries co ON c.country = co.country_id
        LEFT JOIN tblcustomer_groups cug ON c.userid = cug.customer_id
        LEFT JOIN tblcustomers_groups cg ON cug.groupid = cg.id
        LEFT JOIN tblcustomfieldsvalues cfm ON c.userid = cfm.relid AND cfm.fieldto = 'customers'
        LEFT JOIN tblcustomfields cf ON cfm.fieldid = cf.id
        WHERE c.userid = ?
        GROUP BY c.userid
      `;

      const customer = await mysqlClient.queryOne<CustomerDetailRow>(sql, [clientId]);

      if (!customer) {
        return {
          content: [
            {
              type: 'text',
              text: 'Cliente não encontrado'
            }
          ]
        };
      }

      // Buscar contactos do cliente
      const contactsSql = `
        SELECT 
          id, firstname, lastname, email, phonenumber, title, 
          is_primary, active, last_login
        FROM tblcontacts 
        WHERE userid = ? 
        ORDER BY is_primary DESC, firstname
      `;
      const contacts = await mysqlClient.query<ContactRow>(contactsSql, [clientId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                customer: {
                  ...customer,
                  contacts
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
    name: 'create_customer',
    description: 'Criar novo cliente no sistema',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Nome da empresa (obrigatório)' },
        vat: { type: 'string', description: 'Número VAT/NIF' },
        phonenumber: { type: 'string', description: 'Número de telefone' },
        website: { type: 'string', description: 'Website da empresa' },
        address: { type: 'string', description: 'Morada' },
        city: { type: 'string', description: 'Cidade' },
        state: { type: 'string', description: 'Estado/Distrito' },
        zip: { type: 'string', description: 'Código postal' },
        country: { type: 'number', description: 'ID do país' },
        active: { type: 'boolean', description: 'Cliente ativo (padrão_true)' }
      },
      required: ['company']
    },
    handler: async (args, mysqlClient) => {
      const { company, vat, phonenumber, website, address, city, state, zip, country, active } =
        args || {};

      if (!company) {
        throw new Error('Campo "company" é obrigatório');
      }

      const sql = `
        INSERT INTO tblclients (
          company, vat, phonenumber, website, address, city, state, zip,
          country, active, datecreated, addedfrom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)
      `;

      const params = [
        company,
        vat || '',
        phonenumber || '',
        website || '',
        address || '',
        city || '',
        state || '',
        zip || '',
        country || 0,
        active !== false ? 1 : 0
      ];

      const newClientId = await mysqlClient.executeInsert(sql, params);

      // Buscar cliente criado
      const newCustomer = await mysqlClient.queryOne<CustomerDetailRow>(
        'SELECT * FROM tblclients WHERE userid = ?',
        [newClientId]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Cliente criado com sucesso',
                client_id: newClientId,
                customer: newCustomer
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
    name: 'search_customers',
    description: 'Pesquisa avançada de clientes multi-campo',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de pesquisa' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Campos para pesquisar_company, vat, email, phone, city'
        },
        limit: { type: 'number', description: 'Limite de resultados (padrão: 20)' }
      },
      required: ['query']
    },
    handler: async (args, mysqlClient) => {
      const { query, fields = ['company', 'vat'], limit = 20 } = args;

      const validFields = ['company', 'vat', 'phonenumber', 'city', 'website'];
      const searchFields = (fields as string[]).filter((f) => validFields.includes(f));

      if (searchFields.length === 0) {
        searchFields.push('company'); // default fallback
      }

      const whereClause = searchFields.map((field) => `c.${field} LIKE ?`).join(' OR ');
      const searchParams = searchFields.map(() => `%${query}%`);

      const sql = `
        SELECT 
          c.userid, c.company, c.vat, c.phonenumber, c.city,
          c.active, co.short_name as country_name, COUNT(DISTINCT i.id) as invoice_count, SUM(CASE WHEN i.status = 2 THEN i.total ELSE 0 END) as total_revenue
        FROM tblclients c
        LEFT JOIN tblcountries co ON c.country = co.country_id
        LEFT JOIN tblinvoices i ON c.userid = i.clientid
        WHERE (${whereClause})
        GROUP BY c.userid
        ORDER BY c.company
        LIMIT ?
      `;

      const customers = await mysqlClient.query<CustomerRow>(sql, [...searchParams, limit]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                fields_searched: searchFields,
                results: customers,
                count: customers.length
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
    name: 'get_customer_groups',
    description: 'Listar e gerir grupos de clientes',
    inputSchema: {
      type: 'object',
      properties: {
        with_counts: { type: 'boolean', description: 'Incluir contagem de clientes por grupo' }
      }
    },
    handler: async (args, mysqlClient) => {
      const withCounts = args?.with_counts || false;

      const sql = `
        SELECT 
          g.id, 
          g.name
          ${withCounts ? ', COUNT(cg.customer_id) as customer_count' : ''}
        FROM tblcustomers_groups g
        ${withCounts ? 'LEFT JOIN tblcustomer_groups cg ON g.id = cg.groupid' : ''}
        ${withCounts ? 'GROUP BY g.id, g.name' : ''}
        ORDER BY g.name
      `;

      const groups = await mysqlClient.query<GroupRow>(sql);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                groups,
                total_groups: groups.length
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
    name: 'customer_analytics',
    description: 'Analytics específicos do cliente',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year', 'all'],
          description: 'Período para análise'
        }
      },
      required: ['client_id']
    },
    handler: async (args, mysqlClient) => {
      const clientId = args?.client_id;
      const period = args?.period || 'year';

      let dateFilter = '';
      if (period === 'month') dateFilter = 'AND i.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      else if (period === 'quarter') dateFilter = 'AND i.date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
      else if (period === 'year') dateFilter = 'AND i.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

      const sql = `
        SELECT 
          c.company,
          COUNT(DISTINCT i.id) as total_invoices, SUM(i.total) as total_invoiced, SUM(CASE WHEN i.status = 2 THEN i.total ELSE 0 END) as total_paid, AVG(i.total) as avg_invoice_value, COUNT(DISTINCT p.id) as active_projects, COUNT(DISTINCT t.ticketid) as support_tickets, DATEDIFF(NOW(), MIN(i.date)) as days_as_customer, MAX(i.date) as last_invoice_date,
          (SUM(CASE WHEN i.status = 2 THEN i.total ELSE 0 END) / COUNT(DISTINCT i.id)) as payment_efficiency
        FROM tblclients c
        LEFT JOIN tblinvoices i ON c.userid = i.clientid ${dateFilter}
        LEFT JOIN tblprojects p ON c.userid = p.clientid AND p.status IN (2,3)
        LEFT JOIN tbltickets t ON c.userid = t.userid
        WHERE c.userid = ?
      `;

      const analytics = await mysqlClient.queryOne<AnalyticsRow>(sql, [clientId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                client_id: clientId,
                period,
                analytics
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
    name: 'update_customer',
    description: 'Atualizar dados de um cliente',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        company: { type: 'string', description: 'Nome da empresa' },
        vat: { type: 'string', description: 'NIF/VAT' },
        phonenumber: { type: 'string', description: 'Telefone' },
        country: { type: 'number', description: 'ID do país' },
        city: { type: 'string', description: 'Cidade' },
        zip: { type: 'string', description: 'Código postal' },
        state: { type: 'string', description: 'Estado/Província' },
        address: { type: 'string', description: 'Morada' },
        website: { type: 'string', description: 'Website' },
        active: { type: 'number', description: 'Ativo (0 ou 1)' }
      },
      required: ['client_id']
    },
    handler: async (args, mysqlClient) => {
      const clientId = args?.client_id;
      if (!clientId) {
        throw new Error('client_id é obrigatório');
      }

      const updateFields: string[] = [];
      const params: any[] = [];

      const allowedFields = [
        'company',
        'vat',
        'phonenumber',
        'country',
        'city',
        'zip',
        'state',
        'address',
        'website',
        'active'
      ];

      for (const field of allowedFields) {
        if (args[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          params.push(args[field]);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('Nenhum campo para atualizar');
      }

      params.push(clientId);

      const sql = `UPDATE tblclients SET ${updateFields.join(', ')} WHERE userid = ?`;

      const result = await mysqlClient.query<ResultSetHeader>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                client_id: clientId,
                affected_rows: result[0]?.affectedRows || 0,
                message: 'Cliente atualizado com sucesso'
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
    name: 'delete_customer',
    description: 'Eliminar um cliente (soft delete)',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'ID do cliente' },
        hard_delete: { type: 'boolean', description: 'Eliminação permanente (padrão: false)' }
      },
      required: ['client_id']
    },
    handler: async (args, mysqlClient) => {
      const clientId = args?.client_id;
      const hardDelete = args?.hard_delete || false;

      if (!clientId) {
        throw new Error('client_id é obrigatório');
      }

      let sql: string;

      if (hardDelete) {
        // Hard delete - remove permanentemente
        sql = 'DELETE FROM tblclients WHERE userid = ?';
      } else {
        // Soft delete - marcar como inativo
        sql = 'UPDATE tblclients SET active = 0 WHERE userid = ?';
      }

      const result = await mysqlClient.query<ResultSetHeader>(sql, [clientId]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                client_id: clientId,
                affected_rows: result[0]?.affectedRows || 0,
                operation: hardDelete ? 'hard_delete' : 'soft_delete',
                message: `Cliente ${hardDelete ? 'eliminado permanentemente' : 'marcado como inativo'} com sucesso`
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
    name: 'manage_customer_contacts',
    description: 'Gerir contactos do cliente (listar, adicionar, atualizar, remover)',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'update', 'delete'],
          description: 'Ação a executar'
        },
        client_id: { type: 'number', description: 'ID do cliente' },
        contact_id: { type: 'number', description: 'ID do contacto (para update/delete)' },
        firstname: { type: 'string', description: 'Primeiro nome' },
        lastname: { type: 'string', description: 'Último nome' },
        email: { type: 'string', description: 'Email' },
        phonenumber: { type: 'string', description: 'Telefone' },
        title: { type: 'string', description: 'Cargo' },
        is_primary: { type: 'number', description: 'Contacto principal (0 ou 1)' },
        password: { type: 'string', description: 'Password (apenas para add)' },
        send_welcome_email: { type: 'number', description: 'Enviar email de boas-vindas (0 ou 1)' },
        permissions: { type: 'object', description: 'Permissões do contacto' }
      },
      required: ['action', 'client_id']
    },
    handler: async (args, mysqlClient) => {
      const action = args?.action;
      const clientId = args?.client_id;

      if (!action || !clientId) {
        throw new Error('action e client_id são obrigatórios');
      }

      switch (action) {
        case 'list': {
          const sql = `
            SELECT 
              id,
              firstname,
              lastname,
              email,
              phonenumber,
              title,
              is_primary,
              active,
              last_login,
              datecreated
            FROM tblcontacts
            WHERE userid = ?
            ORDER BY is_primary DESC, firstname ASC
          `;

          const contacts = await mysqlClient.query<ContactRow>(sql, [clientId]);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    client_id: clientId,
                    contacts,
                    total_contacts: contacts.length
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case 'add': {
          const requiredFields = ['firstname', 'lastname', 'email'];
          for (const field of requiredFields) {
            if (!args[field]) {
              throw new Error(`${field} é obrigatório para adicionar contacto`);
            }
          }

          const sql = `
            INSERT INTO tblcontacts 
            (userid, firstname, lastname, email, phonenumber, title, is_primary, password, send_set_password_email, datecreated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          const params = [
            clientId,
            args.firstname,
            args.lastname,
            args.email,
            args.phonenumber || '',
            args.title || '',
            args.is_primary || 0,
            args.password ? args.password : '',
            args.send_welcome_email || 0
          ];

          const contactId = await mysqlClient.executeInsert(sql, params);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    contact_id: contactId,
                    message: 'Contacto adicionado com sucesso'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case 'update': {
          if (!args.contact_id) {
            throw new Error('contact_id é obrigatório para atualizar');
          }

          const updateFields: string[] = [];
          const params: any[] = [];

          const allowedFields = [
            'firstname',
            'lastname',
            'email',
            'phonenumber',
            'title',
            'is_primary',
            'active'
          ];

          for (const field of allowedFields) {
            if (args[field] !== undefined) {
              updateFields.push(`${field} = ?`);
              params.push(args[field]);
            }
          }

          if (updateFields.length === 0) {
            throw new Error('Nenhum campo para atualizar');
          }

          params.push(args.contact_id, clientId);

          const sql = `UPDATE tblcontacts SET ${updateFields.join(', ')} WHERE id = ? AND userid = ?`;

          const result = await mysqlClient.query<ResultSetHeader>(sql, params);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    contact_id: args.contact_id,
                    affected_rows: result[0]?.affectedRows || 0,
                    message: 'Contacto atualizado com sucesso'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        case 'delete': {
          if (!args.contact_id) {
            throw new Error('contact_id é obrigatório para eliminar');
          }

          const sql = 'DELETE FROM tblcontacts WHERE id = ? AND userid = ?';

          const result = await mysqlClient.query<ResultSetHeader>(sql, [args.contact_id, clientId]);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    contact_id: args.contact_id,
                    affected_rows: result[0]?.affectedRows || 0,
                    message: 'Contacto eliminado com sucesso'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        default:
          throw new Error(`Ação inválida: ${action}`);
      }
    }
  }
];
