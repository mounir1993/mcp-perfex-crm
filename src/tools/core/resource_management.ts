import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface ResourceManagementTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface ResourceRow extends DatabaseRow {
  id: number;
  name: string;
  type: string;
  description: string;
  availability: string;
  capacity: number;
  hourly_rate: number;
  location: string;
  department_id: number;
  department_name: string;
  status: string;
  skills: string;
  date_created: Date;
}

interface ResourceBookingRow extends DatabaseRow {
  id: number;
  resource_id: number;
  resource_name: string;
  project_id: number;
  project_name: string;
  start_date: Date;
  end_date: Date;
  hours_allocated: number;
  utilization_rate: number;
  status: string;
  booked_by: number;
  booked_by_name: string;
}

interface ResourceUtilizationRow extends DatabaseRow {
  resource_id: number;
  resource_name: string;
  total_capacity: number;
  allocated_hours: number;
  available_hours: number;
  utilization_percentage: number;
  efficiency_score: number;
}

export const resourceManagementTools: ResourceManagementTool[] = [
  {
    name: 'get_resources',
    description: 'Listar recursos com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        type: {
          type: 'string',
          enum: ['human', 'equipment', 'facility', 'software'],
          description: 'Tipo de recurso'
        },
        department_id: { type: 'number', description: 'Filtrar por departamento' },
        availability_status: {
          type: 'string',
          enum: ['available', 'busy', 'unavailable', 'maintenance'],
          description: 'Status de disponibilidade'
        },
        skills: { type: 'string', description: 'Filtrar por habilidades/competências' },
        location: { type: 'string', description: 'Filtrar por localização' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          r.id,
          r.name,
          r.type,
          r.description,
          r.availability,
          r.capacity,
          r.hourly_rate,
          r.location,
          r.department_id,
          d.name as department_name,
          r.status,
          r.skills,
          r.date_created
        FROM tblresources r
        LEFT JOIN tbldepartments d ON r.department_id = d.departmentid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.type) {
        sql += ' AND r.type = ?';
        params.push(args.type);
      }

      if (args?.department_id) {
        sql += ' AND r.department_id = ?';
        params.push(args.department_id);
      }

      if (args?.availability_status) {
        sql += ' AND r.availability = ?';
        params.push(args.availability_status);
      }

      if (args?.skills) {
        sql += ' AND r.skills LIKE ?';
        params.push(`%${args.skills}%`);
      }

      if (args?.location) {
        sql += ' AND r.location LIKE ?';
        params.push(`%${args.location}%`);
      }

      sql += ' ORDER BY r.name ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const resources = await mysqlClient.query<ResourceRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                resources,
                pagination: {
                  limit,
                  offset,
                  count: resources.length
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
    name: 'create_resource',
    description: 'Criar novo recurso',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do recurso' },
        type: {
          type: 'string',
          enum: ['human', 'equipment', 'facility', 'software'],
          description: 'Tipo de recurso'
        },
        description: { type: 'string', description: 'Descrição do recurso' },
        capacity: { type: 'number', description: 'Capacidade máxima (horas/semana para pessoas)' },
        hourly_rate: { type: 'number', description: 'Taxa por hora' },
        location: { type: 'string', description: 'Localização' },
        department_id: { type: 'number', description: 'ID do departamento' },
        skills: { type: 'string', description: 'Habilidades/competências (separadas por vírgula)' },
        availability: {
          type: 'string',
          enum: ['available', 'busy', 'unavailable', 'maintenance'],
          description: 'Status inicial de disponibilidade'
        }
      },
      required: ['name', 'type']
    },
    handler: async (args, mysqlClient) => {
      const {
        name,
        type,
        description = '',
        capacity = 40,
        hourly_rate = 0,
        location = '',
        department_id,
        skills = '',
        availability = 'available'
      } = args;

      // Verificar se departamento existe (se fornecido)
      if (department_id) {
        const department = await mysqlClient.queryOne<{ departmentid: number } & DatabaseRow>(
          'SELECT departmentid FROM tbldepartments WHERE departmentid = ?',
          [department_id]
        );

        if (!department) {
          throw new Error('Departamento não encontrado');
        }
      }

      // Criar tabela se não existir
      await mysqlClient.query(`
        CREATE TABLE IF NOT EXISTS tblresources (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type ENUM('human', 'equipment', 'facility', 'software') NOT NULL,
          description TEXT,
          capacity DECIMAL(10,2) DEFAULT 40,
          hourly_rate DECIMAL(10,2) DEFAULT 0,
          location VARCHAR(255),
          department_id INT,
          skills TEXT,
          availability ENUM('available', 'busy', 'unavailable', 'maintenance') DEFAULT 'available',
          status ENUM('active', 'inactive') DEFAULT 'active',
          date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
          date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX(type),
          INDEX(department_id),
          INDEX(availability),
          INDEX(status)
        )
      `);

      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblresources (
          name, type, description, capacity, hourly_rate, 
          location, department_id, skills, availability
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          name,
          type,
          description,
          capacity,
          hourly_rate,
          location,
          department_id || null,
          skills,
          availability
        ]
      );

      const resourceId = result[0]?.insertId;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Recurso criado com sucesso',
                resource_id: resourceId,
                name,
                type,
                availability
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
    name: 'book_resource',
    description: 'Reservar recurso para projeto/período',
    inputSchema: {
      type: 'object',
      properties: {
        resource_id: { type: 'number', description: 'ID do recurso' },
        project_id: { type: 'number', description: 'ID do projeto' },
        start_date: { type: 'string', description: 'Data de início (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'Data de fim (YYYY-MM-DD)' },
        hours_per_day: { type: 'number', description: 'Horas por dia alocadas' },
        notes: { type: 'string', description: 'Notas sobre a reserva' },
        booked_by: { type: 'number', description: 'ID do usuário que fez a reserva' }
      },
      required: ['resource_id', 'project_id', 'start_date', 'end_date', 'booked_by']
    },
    handler: async (args, mysqlClient) => {
      const {
        resource_id,
        project_id,
        start_date,
        end_date,
        hours_per_day = 8,
        notes = '',
        booked_by
      } = args;

      // Verificar se recurso existe e está disponível
      const resource = await mysqlClient.queryOne<
        {
          id: number;
          name: string;
          availability: string;
          capacity: number;
        } & DatabaseRow
      >(
        `
        SELECT id, name, availability, capacity 
        FROM tblresources 
        WHERE id = ?
      `,
        [resource_id]
      );

      if (!resource) {
        throw new Error('Recurso não encontrado');
      }

      if (resource.availability !== 'available') {
        throw new Error(`Recurso não disponível. Status atual: ${resource.availability}`);
      }

      // Verificar se projeto existe
      const project = await mysqlClient.queryOne<{ id: number; name: string } & DatabaseRow>(
        'SELECT id, name FROM tblprojects WHERE id = ?',
        [project_id]
      );

      if (!project) {
        throw new Error('Projeto não encontrado');
      }

      // Verificar conflitos de reserva
      const existingBooking = await mysqlClient.queryOne<{ id: number } & DatabaseRow>(
        `
        SELECT id 
        FROM tblresource_bookings 
        WHERE resource_id = ? 
        AND status IN ('confirmed', 'in_progress')
        AND (
          (start_date <= ? AND end_date >= ?) OR
          (start_date <= ? AND end_date >= ?) OR
          (start_date >= ? AND end_date <= ?)
        )
      `,
        [resource_id, start_date, start_date, end_date, end_date, start_date, end_date]
      );

      if (existingBooking) {
        throw new Error('Recurso já reservado para este período');
      }

      // Criar tabela de reservas se não existir
      await mysqlClient.query(`
        CREATE TABLE IF NOT EXISTS tblresource_bookings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          resource_id INT NOT NULL,
          project_id INT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          hours_per_day DECIMAL(5,2) DEFAULT 8,
          total_hours DECIMAL(10,2),
          notes TEXT,
          status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled') DEFAULT 'confirmed',
          booked_by INT NOT NULL,
          date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX(resource_id),
          INDEX(project_id),
          INDEX(start_date),
          INDEX(status)
        )
      `);

      // Calcular total de horas
      const startDateTime = new Date(start_date);
      const endDateTime = new Date(end_date);
      const diffTime = Math.abs(endDateTime.getTime() - startDateTime.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const totalHours = diffDays * hours_per_day;

      // Criar reserva
      const result = await mysqlClient.query<ResultSetHeader>(
        `
        INSERT INTO tblresource_bookings (
          resource_id, project_id, start_date, end_date, 
          hours_per_day, total_hours, notes, booked_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [resource_id, project_id, start_date, end_date, hours_per_day, totalHours, notes, booked_by]
      );

      const bookingId = result[0]?.insertId;

      // Atualizar status do recurso se necessário
      await mysqlClient.query('UPDATE tblresources SET availability = ? WHERE id = ?', [
        'busy',
        resource_id
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Recurso reservado com sucesso',
                booking_id: bookingId,
                resource_name: resource.name,
                project_name: project.name,
                period: `${start_date} a ${end_date}`,
                total_hours: totalHours
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
    name: 'get_resource_bookings',
    description: 'Listar reservas de recursos',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        resource_id: { type: 'number', description: 'Filtrar por recurso' },
        project_id: { type: 'number', description: 'Filtrar por projeto' },
        date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        status: {
          type: 'string',
          enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
          description: 'Status da reserva'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          rb.id,
          rb.resource_id,
          r.name as resource_name,
          rb.project_id,
          p.name as project_name,
          rb.start_date,
          rb.end_date,
          rb.hours_per_day,
          rb.total_hours,
          ROUND((rb.total_hours / r.capacity) * 100, 2) as utilization_rate,
          rb.status,
          rb.booked_by,
          CONCAT(s.firstname, ' ', s.lastname) as booked_by_name,
          rb.notes,
          rb.date_created
        FROM tblresource_bookings rb
        LEFT JOIN tblresources r ON rb.resource_id = r.id
        LEFT JOIN tblprojects p ON rb.project_id = p.id
        LEFT JOIN tblstaff s ON rb.booked_by = s.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.resource_id) {
        sql += ' AND rb.resource_id = ?';
        params.push(args.resource_id);
      }

      if (args?.project_id) {
        sql += ' AND rb.project_id = ?';
        params.push(args.project_id);
      }

      if (args?.date_from) {
        sql += ' AND rb.end_date >= ?';
        params.push(args.date_from);
      }

      if (args?.date_to) {
        sql += ' AND rb.start_date <= ?';
        params.push(args.date_to);
      }

      if (args?.status) {
        sql += ' AND rb.status = ?';
        params.push(args.status);
      }

      sql += ' ORDER BY rb.start_date DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const bookings = await mysqlClient.query<ResourceBookingRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                bookings,
                pagination: {
                  limit,
                  offset,
                  count: bookings.length
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
    name: 'resource_utilization_report',
    description: 'Relatório de utilização de recursos',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        resource_type: {
          type: 'string',
          enum: ['human', 'equipment', 'facility', 'software'],
          description: 'Tipo de recurso'
        },
        department_id: { type: 'number', description: 'Filtrar por departamento' },
        include_inactive: { type: 'boolean', description: 'Incluir recursos inativos' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const resourceType = args?.resource_type;
      const departmentId = args?.department_id;
      const includeInactive = args?.include_inactive || false;

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND rb.start_date >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND rb.start_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND rb.start_date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND rb.start_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      let sql = `
        SELECT 
          r.id as resource_id,
          r.name as resource_name,
          r.type,
          r.capacity as total_capacity,
          COALESCE(SUM(CASE WHEN rb.status IN ('confirmed', 'in_progress', 'completed') THEN rb.total_hours ELSE 0 END), 0) as allocated_hours,
          (r.capacity - COALESCE(SUM(CASE WHEN rb.status IN ('confirmed', 'in_progress', 'completed') THEN rb.total_hours ELSE 0 END), 0)) as available_hours,
          ROUND(
            (COALESCE(SUM(CASE WHEN rb.status IN ('confirmed', 'in_progress', 'completed') THEN rb.total_hours ELSE 0 END), 0) / r.capacity) * 100, 
            2
          ) as utilization_percentage,
          COUNT(DISTINCT rb.project_id) as projects_count,
          r.availability,
          r.location,
          d.name as department_name
        FROM tblresources r
        LEFT JOIN tblresource_bookings rb ON r.id = rb.resource_id ${dateFilter}
        LEFT JOIN tbldepartments d ON r.department_id = d.departmentid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (resourceType) {
        sql += ' AND r.type = ?';
        params.push(resourceType);
      }

      if (departmentId) {
        sql += ' AND r.department_id = ?';
        params.push(departmentId);
      }

      if (!includeInactive) {
        sql += ' AND r.status = "active"';
      }

      sql += `
        GROUP BY r.id, r.name, r.type, r.capacity, r.availability, r.location, d.name
        ORDER BY utilization_percentage DESC
      `;

      const utilization = await mysqlClient.query<ResourceUtilizationRow>(sql, params);

      // Estatísticas resumidas
      const summary = {
        total_resources: utilization.length,
        avg_utilization:
          utilization.length > 0
            ? (
                utilization.reduce((sum, r) => sum + r.utilization_percentage, 0) /
                utilization.length
              ).toFixed(2)
            : '0.00',
        overutilized: utilization.filter((r) => r.utilization_percentage > 100).length,
        underutilized: utilization.filter((r) => r.utilization_percentage < 50).length,
        fully_booked: utilization.filter(
          (r) => r.utilization_percentage >= 90 && r.utilization_percentage <= 100
        ).length
      };

      // Top 5 recursos mais utilizados
      const topUtilized = utilization.slice(0, 5);

      // Análise por tipo de recurso
      const byType = utilization.reduce((acc: any, resource) => {
        if (!acc[resource.type]) {
          acc[resource.type] = {
            count: 0,
            total_capacity: 0,
            total_allocated: 0,
            avg_utilization: 0
          };
        }
        acc[resource.type].count++;
        acc[resource.type].total_capacity += resource.total_capacity;
        acc[resource.type].total_allocated += resource.allocated_hours;
        return acc;
      }, {});

      // Calcular utilização média por tipo
      Object.keys(byType).forEach((type) => {
        byType[type].avg_utilization =
          byType[type].total_capacity > 0
            ? ((byType[type].total_allocated / byType[type].total_capacity) * 100).toFixed(2)
            : '0.00';
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                filters: { resource_type: resourceType, department_id: departmentId },
                summary,
                resource_utilization: utilization,
                top_utilized: topUtilized,
                analysis_by_type: byType,
                insights: {
                  most_utilized: topUtilized[0]?.resource_name || 'N/A',
                  bottleneck_resources: utilization.filter((r) => r.utilization_percentage > 90)
                    .length,
                  idle_resources: utilization.filter((r) => r.utilization_percentage === 0).length,
                  optimization_potential:
                    utilization.filter((r) => r.utilization_percentage < 30).length +
                    ' recursos subutilizados'
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
