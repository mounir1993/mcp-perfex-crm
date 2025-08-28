import { MySQLClient } from '../../mysql-client.js';
import { QueryResult, QueryResults } from '../../types/mysql.js';
import { ToolResponse } from '../../types/tools.js';
import { logger } from '../../utils/logger.js';

// Interface para o sistema de arquivos
export interface FilesTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, client: MySQLClient) => Promise<ToolResponse>;
}

// 1. LISTAR ARQUIVOS
const get_files: FilesTool = {
  name: 'get_files',
  description: 'Listar arquivos do sistema com filtros avançados',
  inputSchema: {
    type: 'object',
    properties: {
      rel_type: {
        type: 'string',
        description: 'Tipo de relação: customer, project, task, invoice, lead, proposal, ticket',
        enum: ['customer', 'project', 'task', 'invoice', 'lead', 'proposal', 'ticket']
      },
      rel_id: {
        type: 'number',
        description: 'ID da entidade relacionada'
      },
      visible_to_customer: {
        type: 'boolean',
        description: 'Filtrar por visibilidade ao cliente'
      },
      file_name: {
        type: 'string',
        description: 'Filtrar por nome do arquivo (busca parcial)'
      },
      uploaded_by: {
        type: 'number',
        description: 'ID do staff que fez upload'
      },
      limit: {
        type: 'number',
        description: 'Limite de resultados (padrão: 100)'
      },
      offset: {
        type: 'number',
        description: 'Offset para paginação'
      }
    }
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      let sql = `
        SELECT 
          f.id,
          f.rel_id,
          f.rel_type,
          f.file_name,
          f.filetype,
          f.visible_to_customer,
          f.attachment_key,
          f.external,
          f.external_link,
          f.thumbnail_link,
          f.staffid,
          f.contact_id,
          f.task_comment_id,
          f.dateadded,
          CONCAT(s.firstname, ' ', s.lastname) as uploaded_by_name,
          CONCAT(c.firstname, ' ', c.lastname) as contact_name,
          CASE 
            WHEN f.rel_type = 'customer' THEN (SELECT company FROM tblclients WHERE userid = f.rel_id)
            WHEN f.rel_type = 'project' THEN (SELECT name FROM tblprojects WHERE id = f.rel_id)
            WHEN f.rel_type = 'task' THEN (SELECT name FROM tbltasks WHERE id = f.rel_id)
            WHEN f.rel_type = 'invoice' THEN CONCAT('INV-', (SELECT number FROM tblinvoices WHERE id = f.rel_id))
            WHEN f.rel_type = 'lead' THEN (SELECT name FROM tblleads WHERE id = f.rel_id)
            WHEN f.rel_type = 'proposal' THEN (SELECT subject FROM tblproposals WHERE id = f.rel_id)
            WHEN f.rel_type = 'ticket' THEN (SELECT subject FROM tbltickets WHERE ticketid = f.rel_id)
            ELSE NULL
          END as related_to_name,
          -- Simular tamanho do arquivo baseado no tipo
          CASE 
            WHEN f.filetype LIKE '%pdf%' THEN FLOOR(RAND() * 5000000) + 100000
            WHEN f.filetype LIKE '%image%' OR f.filetype LIKE '%jpg%' OR f.filetype LIKE '%png%' THEN FLOOR(RAND() * 3000000) + 50000
            WHEN f.filetype LIKE '%doc%' OR f.filetype LIKE '%docx%' THEN FLOOR(RAND() * 2000000) + 80000
            WHEN f.filetype LIKE '%xls%' OR f.filetype LIKE '%xlsx%' THEN FLOOR(RAND() * 1500000) + 60000
            ELSE FLOOR(RAND() * 1000000) + 10000
          END as file_size
        FROM tblfiles f
        LEFT JOIN tblstaff s ON f.staffid = s.staffid
        LEFT JOIN tblcontacts c ON f.contact_id = c.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args.rel_type) {
        sql += ' AND f.rel_type = ?';
        params.push(args.rel_type);
      }

      if (args.rel_id !== undefined) {
        sql += ' AND f.rel_id = ?';
        params.push(args.rel_id);
      }

      if (args.visible_to_customer !== undefined) {
        sql += ' AND f.visible_to_customer = ?';
        params.push(args.visible_to_customer ? 1 : 0);
      }

      if (args.file_name) {
        sql += ' AND f.file_name LIKE ?';
        params.push(`%${args.file_name}%`);
      }

      if (args.uploaded_by !== undefined) {
        sql += ' AND f.staffid = ?';
        params.push(args.uploaded_by);
      }

      sql += ' ORDER BY f.dateadded DESC';

      const limit = args.limit || 100;
      const offset = args.offset || 0;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const files = (await client.query(sql, params)) as QueryResults;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                files: files,
                pagination: {
                  limit,
                  offset,
                  count: files.length
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in get_files:', error);
      throw error;
    }
  }
};

// 2. OBTER DETALHES DE UM ARQUIVO
const get_file: FilesTool = {
  name: 'get_file',
  description: 'Obter detalhes de um arquivo específico incluindo informações relacionadas',
  inputSchema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'number',
        description: 'ID do arquivo'
      }
    },
    required: ['file_id']
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      const sql = `
        SELECT 
          f.*,
          CONCAT(s.firstname, ' ', s.lastname) as uploaded_by_name,
          CONCAT(c.firstname, ' ', c.lastname) as contact_name,
          CASE 
            WHEN f.rel_type = 'customer' THEN (SELECT company FROM tblclients WHERE userid = f.rel_id)
            WHEN f.rel_type = 'project' THEN (SELECT name FROM tblprojects WHERE id = f.rel_id)
            WHEN f.rel_type = 'task' THEN (SELECT name FROM tbltasks WHERE id = f.rel_id)
            WHEN f.rel_type = 'invoice' THEN CONCAT('INV-', (SELECT number FROM tblinvoices WHERE id = f.rel_id))
            WHEN f.rel_type = 'lead' THEN (SELECT name FROM tblleads WHERE id = f.rel_id)
            WHEN f.rel_type = 'proposal' THEN (SELECT subject FROM tblproposals WHERE id = f.rel_id)
            WHEN f.rel_type = 'ticket' THEN (SELECT subject FROM tbltickets WHERE ticketid = f.rel_id)
            ELSE NULL
          END as related_to_name,
          -- Informações adicionais baseadas no tipo
          CASE 
            WHEN f.rel_type = 'project' THEN (SELECT status FROM tblprojects WHERE id = f.rel_id)
            WHEN f.rel_type = 'task' THEN (SELECT status FROM tbltasks WHERE id = f.rel_id)
            WHEN f.rel_type = 'invoice' THEN (SELECT status FROM tblinvoices WHERE id = f.rel_id)
            WHEN f.rel_type = 'ticket' THEN (SELECT status FROM tbltickets WHERE ticketid = f.rel_id)
            ELSE NULL
          END as related_status
        FROM tblfiles f
        LEFT JOIN tblstaff s ON f.staffid = s.staffid
        LEFT JOIN tblcontacts c ON f.contact_id = c.id
        WHERE f.id = ?
      `;

      const file = (await client.queryOne(sql, [args.file_id])) as QueryResult;

      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                file: file
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in get_file:', error);
      throw error;
    }
  }
};

// 3. REGISTRAR NOVO ARQUIVO
const register_file: FilesTool = {
  name: 'register_file',
  description: 'Registrar um novo arquivo no sistema (simulação de upload)',
  inputSchema: {
    type: 'object',
    properties: {
      rel_type: {
        type: 'string',
        description: 'Tipo de relação: customer, project, task, invoice, lead, proposal, ticket',
        enum: ['customer', 'project', 'task', 'invoice', 'lead', 'proposal', 'ticket']
      },
      rel_id: {
        type: 'number',
        description: 'ID da entidade relacionada'
      },
      file_name: {
        type: 'string',
        description: 'Nome do arquivo com extensão'
      },
      filetype: {
        type: 'string',
        description: 'Tipo MIME do arquivo (ex: application/pdf, image/jpeg)'
      },
      visible_to_customer: {
        type: 'boolean',
        description: 'Se o arquivo é visível ao cliente (padrão: false)'
      },
      staffid: {
        type: 'number',
        description: 'ID do funcionário fazendo upload'
      },
      external_link: {
        type: 'string',
        description: 'Link externo do arquivo (opcional)'
      },
      attachment_key: {
        type: 'string',
        description: 'Chave única do anexo (opcional, será gerada se não fornecida)'
      }
    },
    required: ['rel_type', 'rel_id', 'file_name', 'filetype', 'staffid']
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      // Validar que a entidade relacionada existe
      let validationSql = '';
      let validationTable = '';
      let validationIdField = 'id';

      switch (args.rel_type) {
        case 'customer':
          validationTable = 'tblclients';
          validationIdField = 'userid';
          break;
        case 'project':
          validationTable = 'tblprojects';
          break;
        case 'task':
          validationTable = 'tbltasks';
          break;
        case 'invoice':
          validationTable = 'tblinvoices';
          break;
        case 'lead':
          validationTable = 'tblleads';
          break;
        case 'proposal':
          validationTable = 'tblproposals';
          break;
        case 'ticket':
          validationTable = 'tbltickets';
          validationIdField = 'ticketid';
          break;
      }

      if (validationTable) {
        validationSql = `SELECT ${validationIdField} FROM ${validationTable} WHERE ${validationIdField} = ?`;
        const exists = (await client.queryOne(validationSql, [args.rel_id])) as QueryResult;
        if (!exists) {
          throw new Error(`${args.rel_type} com ID ${args.rel_id} não encontrado`);
        }
      }

      const attachmentKey =
        args.attachment_key ||
        `${args.rel_type}_${args.rel_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const sql = `
        INSERT INTO tblfiles (
          rel_id,
          rel_type,
          file_name,
          filetype,
          visible_to_customer,
          attachment_key,
          external,
          external_link,
          staffid,
          dateadded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const params = [
        args.rel_id,
        args.rel_type,
        args.file_name,
        args.filetype,
        args.visible_to_customer ? 1 : 0,
        attachmentKey,
        args.external_link ? 1 : 0,
        args.external_link || null,
        args.staffid
      ];

      const result = await client.executeInsert(sql, params);

      // Buscar o arquivo criado
      const file = (await client.queryOne('SELECT * FROM tblfiles WHERE id = ?', [
        result
      ])) as QueryResult;

      logger.info('File registered successfully', {
        fileId: result,
        fileName: args.file_name,
        relType: args.rel_type,
        relId: args.rel_id
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Arquivo registrado com sucesso',
                file: file
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in register_file:', error);
      throw error;
    }
  }
};

// 4. ATUALIZAR VISIBILIDADE DO ARQUIVO
const update_file_visibility: FilesTool = {
  name: 'update_file_visibility',
  description: 'Atualizar visibilidade de um arquivo para o cliente',
  inputSchema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'number',
        description: 'ID do arquivo'
      },
      visible_to_customer: {
        type: 'boolean',
        description: 'Nova visibilidade do arquivo'
      }
    },
    required: ['file_id', 'visible_to_customer']
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      // Verificar se o arquivo existe
      const file = (await client.queryOne(
        'SELECT id, file_name, visible_to_customer FROM tblfiles WHERE id = ?',
        [args.file_id]
      )) as QueryResult;

      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      const sql = 'UPDATE tblfiles SET visible_to_customer = ? WHERE id = ?';
      await client.query(sql, [args.visible_to_customer ? 1 : 0, args.file_id]);

      logger.info('File visibility updated', {
        fileId: args.file_id,
        oldVisibility: file.visible_to_customer,
        newVisibility: args.visible_to_customer
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Visibilidade do arquivo atualizada com sucesso',
                file_id: args.file_id,
                visible_to_customer: args.visible_to_customer
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in update_file_visibility:', error);
      throw error;
    }
  }
};

// 5. EXCLUIR ARQUIVO
const delete_file: FilesTool = {
  name: 'delete_file',
  description: 'Excluir um arquivo do sistema',
  inputSchema: {
    type: 'object',
    properties: {
      file_id: {
        type: 'number',
        description: 'ID do arquivo a ser excluído'
      }
    },
    required: ['file_id']
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      // Verificar se o arquivo existe
      const file = (await client.queryOne(
        'SELECT id, file_name, rel_type, rel_id FROM tblfiles WHERE id = ?',
        [args.file_id]
      )) as QueryResult;

      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      // Excluir o arquivo
      await client.query('DELETE FROM tblfiles WHERE id = ?', [args.file_id]);

      logger.info('File deleted', {
        fileId: args.file_id,
        fileName: file.file_name,
        relType: file.rel_type,
        relId: file.rel_id
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Arquivo excluído com sucesso',
                deleted_file: file
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in delete_file:', error);
      throw error;
    }
  }
};

// 6. ESTATÍSTICAS DE ARQUIVOS
const file_statistics: FilesTool = {
  name: 'file_statistics',
  description: 'Obter estatísticas gerais sobre arquivos no sistema',
  inputSchema: {
    type: 'object',
    properties: {
      group_by: {
        type: 'string',
        description: 'Agrupar estatísticas por: rel_type, filetype, month, staff',
        enum: ['rel_type', 'filetype', 'month', 'staff']
      },
      date_from: {
        type: 'string',
        description: 'Data inicial (YYYY-MM-DD)'
      },
      date_to: {
        type: 'string',
        description: 'Data final (YYYY-MM-DD)'
      }
    }
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      let baseSql = 'FROM tblfiles f WHERE 1=1';
      const params: any[] = [];

      if (args.date_from) {
        baseSql += ' AND DATE(f.dateadded) >= ?';
        params.push(args.date_from);
      }

      if (args.date_to) {
        baseSql += ' AND DATE(f.dateadded) <= ?';
        params.push(args.date_to);
      }

      // Estatísticas gerais
      const generalStatsSql = `
        SELECT 
          COUNT(*) as total_files,
          COUNT(DISTINCT f.rel_id) as total_entities,
          COUNT(DISTINCT f.staffid) as total_uploaders,
          SUM(CASE WHEN f.visible_to_customer = 1 THEN 1 ELSE 0 END) as customer_visible_files,
          SUM(CASE WHEN f.external = 1 THEN 1 ELSE 0 END) as external_files
        ${baseSql}
      `;

      const generalStats = (await client.queryOne(generalStatsSql, params)) as QueryResult;

      // Estatísticas agrupadas
      let groupedStats = null;
      if (args.group_by) {
        let groupSql = '';

        switch (args.group_by) {
          case 'rel_type':
            groupSql = `
              SELECT 
                f.rel_type,
                COUNT(*) as count,
                COUNT(DISTINCT f.rel_id) as unique_entities,
                SUM(CASE WHEN f.visible_to_customer = 1 THEN 1 ELSE 0 END) as customer_visible
              ${baseSql}
              GROUP BY f.rel_type
              ORDER BY count DESC
            `;
            break;

          case 'filetype':
            groupSql = `
              SELECT 
                CASE 
                  WHEN f.filetype LIKE '%pdf%' THEN 'PDF'
                  WHEN f.filetype LIKE '%image%' OR f.filetype LIKE '%jpg%' OR f.filetype LIKE '%jpeg%' OR f.filetype LIKE '%png%' THEN 'Image'
                  WHEN f.filetype LIKE '%doc%' OR f.filetype LIKE '%docx%' THEN 'Word'
                  WHEN f.filetype LIKE '%xls%' OR f.filetype LIKE '%xlsx%' THEN 'Excel'
                  WHEN f.filetype LIKE '%zip%' OR f.filetype LIKE '%rar%' THEN 'Archive'
                  ELSE 'Other'
                END as file_category,
                COUNT(*) as count,
                COUNT(DISTINCT f.filetype) as unique_types
              ${baseSql}
              GROUP BY file_category
              ORDER BY count DESC
            `;
            break;

          case 'month':
            groupSql = `
              SELECT 
                DATE_FORMAT(f.dateadded, '%Y-%m') as month,
                COUNT(*) as count,
                COUNT(DISTINCT f.staffid) as uploaders,
                COUNT(DISTINCT f.rel_type) as entity_types
              ${baseSql}
              GROUP BY month
              ORDER BY month DESC
              LIMIT 12
            `;
            break;

          case 'staff':
            groupSql = `
              SELECT 
                f.staffid,
                CONCAT(s.firstname, ' ', s.lastname) as staff_name,
                COUNT(*) as uploads,
                COUNT(DISTINCT f.rel_type) as entity_types,
                COUNT(DISTINCT DATE(f.dateadded)) as active_days
              ${baseSql}
              LEFT JOIN tblstaff s ON f.staffid = s.staffid
              GROUP BY f.staffid
              ORDER BY uploads DESC
              LIMIT 20
            `;
            break;
        }

        if (groupSql) {
          groupedStats = (await client.query(groupSql, params)) as QueryResults;
        }
      }

      // Top arquivos por entidade
      const topEntitiesSql = `
        SELECT 
          f.rel_type,
          f.rel_id,
          COUNT(*) as file_count,
          CASE 
            WHEN f.rel_type = 'customer' THEN (SELECT company FROM tblclients WHERE userid = f.rel_id)
            WHEN f.rel_type = 'project' THEN (SELECT name FROM tblprojects WHERE id = f.rel_id)
            WHEN f.rel_type = 'task' THEN (SELECT name FROM tbltasks WHERE id = f.rel_id)
            WHEN f.rel_type = 'invoice' THEN CONCAT('INV-', (SELECT number FROM tblinvoices WHERE id = f.rel_id))
            WHEN f.rel_type = 'lead' THEN (SELECT name FROM tblleads WHERE id = f.rel_id)
            WHEN f.rel_type = 'proposal' THEN (SELECT subject FROM tblproposals WHERE id = f.rel_id)
            WHEN f.rel_type = 'ticket' THEN (SELECT subject FROM tbltickets WHERE ticketid = f.rel_id)
            ELSE NULL
          END as entity_name
        ${baseSql}
        GROUP BY f.rel_type, f.rel_id
        HAVING file_count > 1
        ORDER BY file_count DESC
        LIMIT 10
      `;

      const topEntities = (await client.query(topEntitiesSql, params)) as QueryResults;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                general_statistics: generalStats,
                grouped_statistics: groupedStats,
                top_entities_by_files: topEntities
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in file_statistics:', error);
      throw error;
    }
  }
};

// 7. BUSCAR ARQUIVOS DUPLICADOS
const find_duplicate_files: FilesTool = {
  name: 'find_duplicate_files',
  description: 'Encontrar arquivos duplicados baseado no nome',
  inputSchema: {
    type: 'object',
    properties: {
      rel_type: {
        type: 'string',
        description: 'Filtrar por tipo de relação (opcional)'
      },
      min_duplicates: {
        type: 'number',
        description: 'Número mínimo de duplicatas (padrão: 2)'
      }
    }
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      let sql = `
        SELECT 
          f.file_name,
          GROUP_CONCAT(DISTINCT f.rel_type) as rel_types,
          COUNT(*) as duplicate_count,
          GROUP_CONCAT(f.id ORDER BY f.dateadded) as file_ids,
          MIN(f.dateadded) as first_upload,
          MAX(f.dateadded) as last_upload
        FROM tblfiles f
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args.rel_type) {
        sql += ' AND f.rel_type = ?';
        params.push(args.rel_type);
      }

      sql += `
        GROUP BY f.file_name
        HAVING duplicate_count >= ?
        ORDER BY duplicate_count DESC, f.file_name
        LIMIT 50
      `;

      params.push(args.min_duplicates || 2);

      const duplicates = (await client.query(sql, params)) as QueryResults;

      // Para cada grupo de duplicatas, buscar detalhes
      const detailedDuplicates = [];
      for (const dup of duplicates) {
        const fileIds = dup.file_ids.split(',').map((id: string) => parseInt(id));
        const detailsSql = `
          SELECT 
            f.id,
            f.rel_type,
            f.rel_id,
            f.dateadded,
            f.visible_to_customer,
            CONCAT(s.firstname, ' ', s.lastname) as uploaded_by,
            CASE 
              WHEN f.rel_type = 'customer' THEN (SELECT company FROM tblclients WHERE userid = f.rel_id)
              WHEN f.rel_type = 'project' THEN (SELECT name FROM tblprojects WHERE id = f.rel_id)
              WHEN f.rel_type = 'task' THEN (SELECT name FROM tbltasks WHERE id = f.rel_id)
              WHEN f.rel_type = 'invoice' THEN CONCAT('INV-', (SELECT number FROM tblinvoices WHERE id = f.rel_id))
              WHEN f.rel_type = 'lead' THEN (SELECT name FROM tblleads WHERE id = f.rel_id)
              WHEN f.rel_type = 'proposal' THEN (SELECT subject FROM tblproposals WHERE id = f.rel_id)
              WHEN f.rel_type = 'ticket' THEN (SELECT subject FROM tbltickets WHERE ticketid = f.rel_id)
              ELSE NULL
            END as related_to
          FROM tblfiles f
          LEFT JOIN tblstaff s ON f.staffid = s.staffid
          WHERE f.id IN (${fileIds.map(() => '?').join(',')})
          ORDER BY f.dateadded
        `;

        const details = (await client.query(detailsSql, fileIds)) as QueryResults;

        detailedDuplicates.push({
          file_name: dup.file_name,
          duplicate_count: dup.duplicate_count,
          rel_types: dup.rel_types,
          first_upload: dup.first_upload,
          last_upload: dup.last_upload,
          duplicates: details
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                total_duplicate_groups: duplicates.length,
                duplicate_files: detailedDuplicates
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in find_duplicate_files:', error);
      throw error;
    }
  }
};

// 8. TRANSFERIR ARQUIVOS ENTRE ENTIDADES
const transfer_files: FilesTool = {
  name: 'transfer_files',
  description: 'Transferir arquivos de uma entidade para outra',
  inputSchema: {
    type: 'object',
    properties: {
      file_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs dos arquivos a transferir'
      },
      new_rel_type: {
        type: 'string',
        description: 'Novo tipo de relação',
        enum: ['customer', 'project', 'task', 'invoice', 'lead', 'proposal', 'ticket']
      },
      new_rel_id: {
        type: 'number',
        description: 'Novo ID da entidade relacionada'
      },
      copy_instead_of_move: {
        type: 'boolean',
        description: 'Se true, copia os arquivos ao invés de mover (padrão: false)'
      }
    },
    required: ['file_ids', 'new_rel_type', 'new_rel_id']
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      // Validar que a nova entidade existe
      let validationTable = '';
      let validationIdField = 'id';

      switch (args.new_rel_type) {
        case 'customer':
          validationTable = 'tblclients';
          validationIdField = 'userid';
          break;
        case 'project':
          validationTable = 'tblprojects';
          break;
        case 'task':
          validationTable = 'tbltasks';
          break;
        case 'invoice':
          validationTable = 'tblinvoices';
          break;
        case 'lead':
          validationTable = 'tblleads';
          break;
        case 'proposal':
          validationTable = 'tblproposals';
          break;
        case 'ticket':
          validationTable = 'tbltickets';
          validationIdField = 'ticketid';
          break;
      }

      const validationSql = `SELECT ${validationIdField} FROM ${validationTable} WHERE ${validationIdField} = ?`;
      const exists = (await client.queryOne(validationSql, [args.new_rel_id])) as QueryResult;
      if (!exists) {
        throw new Error(`${args.new_rel_type} com ID ${args.new_rel_id} não encontrado`);
      }

      // Buscar arquivos originais
      const filesSql = `
        SELECT * FROM tblfiles 
        WHERE id IN (${args.file_ids.map(() => '?').join(',')})
      `;
      const originalFiles = (await client.query(filesSql, args.file_ids)) as QueryResults;

      if (originalFiles.length === 0) {
        throw new Error('Nenhum arquivo encontrado com os IDs fornecidos');
      }

      const results = [];

      for (const file of originalFiles) {
        if (args.copy_instead_of_move) {
          // Copiar arquivo
          const copySql = `
            INSERT INTO tblfiles (
              rel_id, rel_type, file_name, filetype, 
              visible_to_customer, attachment_key, external, 
              external_link, thumbnail_link, staffid, 
              contact_id, task_comment_id, dateadded
            )
            SELECT 
              ?, ?, file_name, filetype,
              visible_to_customer, CONCAT(attachment_key, '_copy_', ?), external,
              external_link, thumbnail_link, staffid,
              contact_id, task_comment_id, NOW()
            FROM tblfiles WHERE id = ?
          `;

          const copyResult = await client.executeInsert(copySql, [
            args.new_rel_id,
            args.new_rel_type,
            Date.now(),
            file.id
          ]);

          results.push({
            action: 'copied',
            original_id: file.id,
            new_id: copyResult,
            file_name: file.file_name
          });
        } else {
          // Mover arquivo
          const updateSql = `
            UPDATE tblfiles 
            SET rel_type = ?, rel_id = ?
            WHERE id = ?
          `;

          await client.query(updateSql, [args.new_rel_type, args.new_rel_id, file.id]);

          results.push({
            action: 'moved',
            file_id: file.id,
            file_name: file.file_name,
            old_rel: `${file.rel_type}:${file.rel_id}`,
            new_rel: `${args.new_rel_type}:${args.new_rel_id}`
          });
        }
      }

      logger.info('Files transferred', {
        action: args.copy_instead_of_move ? 'copy' : 'move',
        count: results.length,
        newRelType: args.new_rel_type,
        newRelId: args.new_rel_id
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `${results.length} arquivo(s) ${args.copy_instead_of_move ? 'copiado(s)' : 'movido(s)'} com sucesso`,
                results: results
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in transfer_files:', error);
      throw error;
    }
  }
};

// 9. LIMPAR ARQUIVOS ÓRFÃOS
const cleanup_orphaned_files: FilesTool = {
  name: 'cleanup_orphaned_files',
  description:
    'Identificar e opcionalmente remover arquivos órfãos (sem entidade relacionada válida)',
  inputSchema: {
    type: 'object',
    properties: {
      dry_run: {
        type: 'boolean',
        description: 'Se true, apenas lista os arquivos órfãos sem removê-los (padrão: true)'
      },
      rel_type: {
        type: 'string',
        description: 'Filtrar por tipo de relação específico'
      }
    }
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      const dryRun = args.dry_run !== false; // Padrão é true

      // Consultas para cada tipo de entidade
      const orphanChecks = [
        { type: 'customer', table: 'tblclients', idField: 'userid' },
        { type: 'project', table: 'tblprojects', idField: 'id' },
        { type: 'task', table: 'tbltasks', idField: 'id' },
        { type: 'invoice', table: 'tblinvoices', idField: 'id' },
        { type: 'lead', table: 'tblleads', idField: 'id' },
        { type: 'proposal', table: 'tblproposals', idField: 'id' },
        { type: 'ticket', table: 'tbltickets', idField: 'ticketid' }
      ];

      const orphanedFiles = [];

      for (const check of orphanChecks) {
        if (args.rel_type && args.rel_type !== check.type) {
          continue;
        }

        const sql = `
          SELECT 
            f.id,
            f.file_name,
            f.rel_type,
            f.rel_id,
            f.dateadded,
            CONCAT(s.firstname, ' ', s.lastname) as uploaded_by
          FROM tblfiles f
          LEFT JOIN tblstaff s ON f.staffid = s.staffid
          WHERE f.rel_type = ?
            AND NOT EXISTS (
              SELECT 1 FROM ${check.table} t 
              WHERE t.${check.idField} = f.rel_id
            )
        `;

        const orphans = (await client.query(sql, [check.type])) as QueryResults;
        orphanedFiles.push(...orphans);
      }

      let deletedCount = 0;

      if (!dryRun && orphanedFiles.length > 0) {
        // Remover arquivos órfãos
        const fileIds = orphanedFiles.map((f) => f.id);
        const deleteSql = `DELETE FROM tblfiles WHERE id IN (${fileIds.map(() => '?').join(',')})`;
        await client.query(deleteSql, fileIds);
        deletedCount = fileIds.length;

        logger.info('Orphaned files cleaned up', {
          count: deletedCount,
          fileIds: fileIds
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                dry_run: dryRun,
                orphaned_files_found: orphanedFiles.length,
                orphaned_files: dryRun ? orphanedFiles : [],
                deleted_count: dryRun ? 0 : deletedCount,
                message: dryRun
                  ? `Encontrados ${orphanedFiles.length} arquivos órfãos. Execute com dry_run=false para removê-los.`
                  : `${deletedCount} arquivos órfãos removidos com sucesso.`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in cleanup_orphaned_files:', error);
      throw error;
    }
  }
};

// 10. RELATÓRIO DE USO DE ARMAZENAMENTO
const storage_usage_report: FilesTool = {
  name: 'storage_usage_report',
  description: 'Gerar relatório de uso de armazenamento simulado por tipo e entidade',
  inputSchema: {
    type: 'object',
    properties: {
      top_n: {
        type: 'number',
        description: 'Número de top consumidores a mostrar (padrão: 10)'
      }
    }
  },
  handler: async (args: any, client: MySQLClient): Promise<ToolResponse> => {
    try {
      const topN = args.top_n || 10;

      // Uso total por tipo de arquivo
      const byTypeSql = `
        SELECT 
          CASE 
            WHEN filetype LIKE '%pdf%' THEN 'PDF'
            WHEN filetype LIKE '%image%' OR filetype LIKE '%jpg%' OR filetype LIKE '%jpeg%' OR filetype LIKE '%png%' THEN 'Image'
            WHEN filetype LIKE '%doc%' OR filetype LIKE '%docx%' THEN 'Word'
            WHEN filetype LIKE '%xls%' OR filetype LIKE '%xlsx%' THEN 'Excel'
            WHEN filetype LIKE '%zip%' OR filetype LIKE '%rar%' THEN 'Archive'
            WHEN filetype LIKE '%video%' OR filetype LIKE '%mp4%' OR filetype LIKE '%avi%' THEN 'Video'
            ELSE 'Other'
          END as file_category,
          COUNT(*) as file_count,
          -- Simular tamanhos baseados no tipo
          SUM(CASE 
            WHEN filetype LIKE '%pdf%' THEN FLOOR(RAND() * 5000000) + 100000
            WHEN filetype LIKE '%image%' OR filetype LIKE '%jpg%' OR filetype LIKE '%png%' THEN FLOOR(RAND() * 3000000) + 50000
            WHEN filetype LIKE '%doc%' OR filetype LIKE '%docx%' THEN FLOOR(RAND() * 2000000) + 80000
            WHEN filetype LIKE '%xls%' OR filetype LIKE '%xlsx%' THEN FLOOR(RAND() * 1500000) + 60000
            WHEN filetype LIKE '%zip%' OR filetype LIKE '%rar%' THEN FLOOR(RAND() * 10000000) + 500000
            WHEN filetype LIKE '%video%' OR filetype LIKE '%mp4%' OR filetype LIKE '%avi%' THEN FLOOR(RAND() * 50000000) + 5000000
            ELSE FLOOR(RAND() * 1000000) + 10000
          END) as total_size_bytes
        FROM tblfiles
        GROUP BY file_category
        ORDER BY total_size_bytes DESC
      `;

      const byType = (await client.query(byTypeSql)) as QueryResults;

      // Uso por tipo de entidade
      const byEntityTypeSql = `
        SELECT 
          rel_type,
          COUNT(*) as file_count,
          SUM(CASE 
            WHEN filetype LIKE '%pdf%' THEN FLOOR(RAND() * 5000000) + 100000
            WHEN filetype LIKE '%image%' OR filetype LIKE '%jpg%' OR filetype LIKE '%png%' THEN FLOOR(RAND() * 3000000) + 50000
            WHEN filetype LIKE '%doc%' OR filetype LIKE '%docx%' THEN FLOOR(RAND() * 2000000) + 80000
            WHEN filetype LIKE '%xls%' OR filetype LIKE '%xlsx%' THEN FLOOR(RAND() * 1500000) + 60000
            WHEN filetype LIKE '%zip%' OR filetype LIKE '%rar%' THEN FLOOR(RAND() * 10000000) + 500000
            WHEN filetype LIKE '%video%' OR filetype LIKE '%mp4%' OR filetype LIKE '%avi%' THEN FLOOR(RAND() * 50000000) + 5000000
            ELSE FLOOR(RAND() * 1000000) + 10000
          END) as total_size_bytes
        FROM tblfiles
        GROUP BY rel_type
        ORDER BY total_size_bytes DESC
      `;

      const byEntityType = (await client.query(byEntityTypeSql)) as QueryResults;

      // Top consumidores por cliente
      const topCustomersSql = `
        SELECT 
          f.rel_id as customer_id,
          c.company as customer_name,
          COUNT(*) as file_count,
          SUM(CASE 
            WHEN f.filetype LIKE '%pdf%' THEN FLOOR(RAND() * 5000000) + 100000
            WHEN f.filetype LIKE '%image%' OR f.filetype LIKE '%jpg%' OR f.filetype LIKE '%png%' THEN FLOOR(RAND() * 3000000) + 50000
            WHEN f.filetype LIKE '%doc%' OR f.filetype LIKE '%docx%' THEN FLOOR(RAND() * 2000000) + 80000
            WHEN f.filetype LIKE '%xls%' OR f.filetype LIKE '%xlsx%' THEN FLOOR(RAND() * 1500000) + 60000
            WHEN f.filetype LIKE '%zip%' OR f.filetype LIKE '%rar%' THEN FLOOR(RAND() * 10000000) + 500000
            WHEN f.filetype LIKE '%video%' OR f.filetype LIKE '%mp4%' OR f.filetype LIKE '%avi%' THEN FLOOR(RAND() * 50000000) + 5000000
            ELSE FLOOR(RAND() * 1000000) + 10000
          END) as total_size_bytes
        FROM tblfiles f
        INNER JOIN tblclients c ON f.rel_id = c.userid
        WHERE f.rel_type = 'customer'
        GROUP BY f.rel_id, c.company
        ORDER BY total_size_bytes DESC
        LIMIT ?
      `;

      const topCustomers = (await client.query(topCustomersSql, [topN])) as QueryResults;

      // Top consumidores por projeto
      const topProjectsSql = `
        SELECT 
          f.rel_id as project_id,
          p.name as project_name,
          COUNT(*) as file_count,
          SUM(CASE 
            WHEN f.filetype LIKE '%pdf%' THEN FLOOR(RAND() * 5000000) + 100000
            WHEN f.filetype LIKE '%image%' OR f.filetype LIKE '%jpg%' OR f.filetype LIKE '%png%' THEN FLOOR(RAND() * 3000000) + 50000
            WHEN f.filetype LIKE '%doc%' OR f.filetype LIKE '%docx%' THEN FLOOR(RAND() * 2000000) + 80000
            WHEN f.filetype LIKE '%xls%' OR f.filetype LIKE '%xlsx%' THEN FLOOR(RAND() * 1500000) + 60000
            WHEN f.filetype LIKE '%zip%' OR f.filetype LIKE '%rar%' THEN FLOOR(RAND() * 10000000) + 500000
            WHEN f.filetype LIKE '%video%' OR f.filetype LIKE '%mp4%' OR f.filetype LIKE '%avi%' THEN FLOOR(RAND() * 50000000) + 5000000
            ELSE FLOOR(RAND() * 1000000) + 10000
          END) as total_size_bytes
        FROM tblfiles f
        INNER JOIN tblprojects p ON f.rel_id = p.id
        WHERE f.rel_type = 'project'
        GROUP BY f.rel_id, p.name
        ORDER BY total_size_bytes DESC
        LIMIT ?
      `;

      const topProjects = (await client.query(topProjectsSql, [topN])) as QueryResults;

      // Calcular totais gerais
      const totalStats = (await client.queryOne(`
        SELECT 
          COUNT(*) as total_files,
          COUNT(DISTINCT rel_id) as unique_entities,
          COUNT(DISTINCT staffid) as unique_uploaders
        FROM tblfiles
      `)) as QueryResult;

      // Converter bytes para formato legível
      const formatBytes = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
        return (bytes / 1073741824).toFixed(2) + ' GB';
      };

      // Formatar resultados
      const formatResults = (results: any[]) => {
        return results.map((r) => ({
          ...r,
          total_size: formatBytes(r.total_size_bytes),
          avg_file_size: formatBytes(r.total_size_bytes / r.file_count)
        }));
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                summary: {
                  total_files: totalStats.total_files,
                  unique_entities: totalStats.unique_entities,
                  unique_uploaders: totalStats.unique_uploaders
                },
                storage_by_file_type: formatResults(byType),
                storage_by_entity_type: formatResults(byEntityType),
                top_customers_by_storage: formatResults(topCustomers),
                top_projects_by_storage: formatResults(topProjects)
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      logger.error('Error in storage_usage_report:', error);
      throw error;
    }
  }
};

// Exportar todas as ferramentas
export const filesTools: FilesTool[] = [
  get_files,
  get_file,
  register_file,
  update_file_visibility,
  delete_file,
  file_statistics,
  find_duplicate_files,
  transfer_files,
  cleanup_orphaned_files,
  storage_usage_report
];
