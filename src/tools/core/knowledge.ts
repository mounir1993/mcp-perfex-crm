import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface KnowledgeTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface KnowledgeBaseRow extends DatabaseRow {
  kb_id: number;
  subject: string;
  description: string;
  articleid: number;
  article_description: string;
  kb_group_id: number;
  group_name: string;
  group_description: string;
  group_color: string;
  staff_article: number;
  date_created: Date;
  last_updated: Date;
  views: number;
  article_order: number;
  disabled: number;
}

interface KnowledgeArticleRow extends DatabaseRow {
  articleid: number;
  subject: string;
  description: string;
  slug: string;
  kb_group_id: number;
  group_name: string;
  staff_article: number;
  views: number;
  date_created: Date;
  last_updated: Date;
  article_order: number;
  disabled: number;
  tags: string;
  related_articles: string;
}

interface KnowledgeGroupRow extends DatabaseRow {
  kb_group_id: number;
  name: string;
  description: string;
  color: string;
  group_slug: string;
  group_order: number;
  disabled: number;
  article_count: number;
  total_views: number;
  last_article_date: Date;
}

interface KnowledgeStatsRow extends DatabaseRow {
  total_articles: number;
  total_groups: number;
  total_views: number;
  staff_articles: number;
  public_articles: number;
  popular_articles: number;
  recent_articles: number;
  avg_views_per_article: number;
}

export const knowledgeTools: KnowledgeTool[] = [
  {
    name: 'get_knowledge_articles',
    description: 'Listar artigos da base de conhecimento com filtros',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        kb_group_id: { type: 'number', description: 'ID do grupo de conhecimento' },
        search: { type: 'string', description: 'Buscar por título ou conteúdo' },
        staff_only: { type: 'boolean', description: 'Apenas artigos de staff' },
        popular: { type: 'boolean', description: 'Ordenar por mais visualizados' },
        recent: { type: 'boolean', description: 'Apenas artigos recentes (30 dias)' },
        active_only: { type: 'boolean', description: 'Apenas artigos ativos (padrão: true)' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;
      const activeOnly = args?.active_only !== false;

      let sql = `
        SELECT 
          kb.articleid,
          kb.subject,
          kb.description,
          kb.articlegroup,
          kg.name as group_name,
          kb.articlesubgroup,
          kb.staff_article,
          kb.datecreated as date_created,
          kb.article_order,
          kb.active,
          kb.slug,
          '' as tags
        FROM tblknowledge_base kb
        LEFT JOIN tblknowledge_base_groups kg ON kb.articlegroup = kg.groupid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (activeOnly) {
        sql += ' AND kb.active = 1';
      }

      if (args?.kb_group_id) {
        sql += ' AND kb.articlegroup = ?';
        params.push(args.kb_group_id);
      }

      if (args?.search) {
        sql += ' AND (kb.subject LIKE ? OR kb.description LIKE ? OR kb.article_description LIKE ?)';
        const searchTerm = `%${args.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (args?.staff_only) {
        sql += ' AND kb.staff_article = 1';
      }

      if (args?.recent) {
        sql += ' AND kb.datecreated >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
      }

      if (args?.popular) {
        sql += ' ORDER BY kb.views DESC, kb.datecreated DESC';
      } else {
        sql += ' ORDER BY kb.article_order ASC, kb.datecreated DESC';
      }

      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const articles = await mysqlClient.query<KnowledgeBaseRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                articles,
                pagination: {
                  limit,
                  offset,
                  count: articles.length
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
    name: 'get_knowledge_article',
    description: 'Obter artigo específico da base de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        article_id: { type: 'number', description: 'ID do artigo' },
        slug: { type: 'string', description: 'Slug do artigo (alternativa ao ID)' },
        increment_views: { type: 'boolean', description: 'Incrementar contador de visualizações' }
      }
    },
    handler: async (args, mysqlClient) => {
      if (!args?.article_id && !args?.slug) {
        throw new Error('article_id ou slug é obrigatório');
      }

      let whereClause = '';
      let whereParam;

      if (args.article_id) {
        whereClause = 'kb.articleid = ?';
        whereParam = args.article_id;
      } else {
        // Para slug, vamos usar o subject como base
        whereClause = 'LOWER(REPLACE(kb.subject, " ", "-")) = LOWER(?)';
        whereParam = args.slug;
      }

      const sql = `
        SELECT 
          kb.*,
          kg.name as group_name,
          kg.description as group_description,
          kg.color as group_color,
          '' as tags,
          '' as related_articles
        FROM tblknowledge_base kb
        LEFT JOIN tblknowledge_base_groups kg ON kb.articlegroup = kg.kb_group_id
        WHERE ${whereClause}
      `;

      const article = await mysqlClient.queryOne<KnowledgeArticleRow>(sql, [whereParam]);

      if (!article) {
        return {
          content: [
            {
              type: 'text',
              text: 'Artigo não encontrado'
            }
          ]
        };
      }

      // Incrementar visualizações se solicitado
      if (args?.increment_views && article.articleid) {
        await mysqlClient.query(
          'UPDATE tblknowledge_base SET views = views + 1 WHERE articleid = ?',
          [article.articleid]
        );
        article.views = (article.views || 0) + 1;
      }

      // Buscar artigos relacionados do mesmo grupo
      const relatedSql = `
        SELECT articleid, subject, views
        FROM tblknowledge_base 
        WHERE kb_group_id = ? AND articleid != ? AND disabled = 0
        ORDER BY views DESC
        LIMIT 5
      `;
      const relatedArticles = await mysqlClient.query(relatedSql, [
        article.kb_group_id,
        article.articleid
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                article: {
                  ...article,
                  related_articles: relatedArticles
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
    name: 'create_knowledge_article',
    description: 'Criar novo artigo na base de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Título do artigo' },
        description: { type: 'string', description: 'Resumo do artigo' },
        article_description: { type: 'string', description: 'Conteúdo completo do artigo' },
        kb_group_id: { type: 'number', description: 'ID do grupo de conhecimento' },
        staff_article: { type: 'boolean', description: 'Artigo restrito ao staff' },
        tags: { type: 'string', description: 'Tags separadas por vírgula' },
        article_order: { type: 'number', description: 'Ordem de exibição' },
        disabled: { type: 'boolean', description: 'Artigo desativado' }
      },
      required: ['subject', 'article_description', 'kb_group_id']
    },
    handler: async (args, mysqlClient) => {
      const {
        subject,
        description = '',
        article_description,
        kb_group_id,
        staff_article = false,
        tags = '',
        article_order = 0,
        disabled = false
      } = args;

      // Verificar se grupo existe
      const group = await mysqlClient.queryOne(
        'SELECT kb_group_id FROM tblknowledge_base_groups WHERE kb_group_id = ?',
        [kb_group_id]
      );

      if (!group) {
        throw new Error('Grupo de conhecimento não encontrado');
      }

      // Armazenar tags no description se fornecidas
      const descriptionWithTags = tags ? `${description}\n\n[TAGS: ${tags}]` : description;

      // Inserir artigo
      const articleId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblknowledge_base (
          subject, description, article_description, kb_group_id,
          staff_article, datecreated, article_last_updated,
          views, article_order, disabled
        ) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0, ?, ?)
      `,
        [
          subject,
          descriptionWithTags,
          article_description,
          kb_group_id,
          staff_article ? 1 : 0,
          article_order,
          disabled ? 1 : 0
        ]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Artigo criado com sucesso',
                article_id: articleId,
                subject: subject,
                kb_group_id: kb_group_id,
                staff_article: staff_article,
                tags: tags
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
    name: 'update_knowledge_article',
    description: 'Atualizar artigo existente',
    inputSchema: {
      type: 'object',
      properties: {
        article_id: { type: 'number', description: 'ID do artigo' },
        subject: { type: 'string', description: 'Novo título' },
        description: { type: 'string', description: 'Nova descrição' },
        article_description: { type: 'string', description: 'Novo conteúdo' },
        kb_group_id: { type: 'number', description: 'Novo grupo' },
        staff_article: { type: 'boolean', description: 'Restrito ao staff' },
        tags: { type: 'string', description: 'Novas tags' },
        article_order: { type: 'number', description: 'Nova ordem' },
        disabled: { type: 'boolean', description: 'Desativar artigo' }
      },
      required: ['article_id']
    },
    handler: async (args, mysqlClient) => {
      const { article_id, tags, ...updateFields } = args;

      // Verificar se artigo existe
      const article = await mysqlClient.queryOne<
        { articleid: number; description: string } & DatabaseRow
      >('SELECT articleid, description FROM tblknowledge_base WHERE articleid = ?', [article_id]);

      if (!article) {
        throw new Error('Artigo não encontrado');
      }

      const updateParts = [];
      const updateParams = [];

      // Campos normais
      const allowedFields = [
        'subject',
        'article_description',
        'kb_group_id',
        'staff_article',
        'article_order',
        'disabled'
      ];
      for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
          if (field === 'staff_article' || field === 'disabled') {
            updateParts.push(`${field} = ?`);
            updateParams.push(updateFields[field] ? 1 : 0);
          } else {
            updateParts.push(`${field} = ?`);
            updateParams.push(updateFields[field]);
          }
        }
      }

      // Atualizar description com tags se fornecidas
      if (updateFields.description !== undefined || tags !== undefined) {
        let newDescription =
          updateFields.description !== undefined ? updateFields.description : article.description;

        // Remover tags existentes
        newDescription = newDescription.replace(/\n\n\[TAGS:.*?\]/g, '');

        // Adicionar novas tags se fornecidas
        if (tags) {
          newDescription += `\n\n[TAGS: ${tags}]`;
        }

        updateParts.push('description = ?');
        updateParams.push(newDescription);
      }

      if (updateParts.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      // Sempre atualizar data de modificação
      updateParts.push('article_last_updated = NOW()');
      updateParams.push(article_id);

      await mysqlClient.query(
        `UPDATE tblknowledge_base SET ${updateParts.join(', ')} WHERE articleid = ?`,
        updateParams
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Artigo atualizado com sucesso',
                article_id: article_id,
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
    name: 'delete_knowledge_article',
    description: 'Eliminar artigo da base de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        article_id: { type: 'number', description: 'ID do artigo' },
        soft_delete: { type: 'boolean', description: 'Desativar em vez de eliminar (padrão: true)' }
      },
      required: ['article_id']
    },
    handler: async (args, mysqlClient) => {
      const { article_id, soft_delete = true } = args;

      // Verificar se artigo existe
      const article = await mysqlClient.queryOne<
        { articleid: number; subject: string } & DatabaseRow
      >('SELECT articleid, subject FROM tblknowledge_base WHERE articleid = ?', [article_id]);

      if (!article) {
        throw new Error('Artigo não encontrado');
      }

      if (soft_delete) {
        // Soft delete - apenas desativar
        await mysqlClient.query('UPDATE tblknowledge_base SET disabled = 1 WHERE articleid = ?', [
          article_id
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Artigo desativado com sucesso',
                  article_id: article_id,
                  action: 'disabled',
                  title: article.subject
                },
                null,
                2
              )
            }
          ]
        };
      } else {
        // Hard delete - eliminar completamente
        const result = await mysqlClient.query<ResultSetHeader>(
          'DELETE FROM tblknowledge_base WHERE articleid = ?',
          [article_id]
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Artigo eliminado permanentemente',
                  article_id: article_id,
                  action: 'deleted',
                  affected_rows: result[0]?.affectedRows || 0,
                  title: article.subject
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  },

  {
    name: 'get_knowledge_groups',
    description: 'Listar grupos da base de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: { type: 'boolean', description: 'Apenas grupos ativos (padrão: true)' },
        with_stats: { type: 'boolean', description: 'Incluir estatísticas de artigos' }
      }
    },
    handler: async (args, mysqlClient) => {
      const activeOnly = args?.active_only !== false;
      const withStats = args?.with_stats || false;

      let sql = `
        SELECT 
          kg.kb_group_id,
          kg.name,
          kg.description,
          kg.color,
          kg.group_order,
          kg.disabled
      `;

      if (withStats) {
        sql += `,
          COUNT(kb.articleid) as article_count,
          SUM(kb.views) as total_views,
          MAX(kb.datecreated) as last_article_date
        `;
      }

      sql += `
        FROM tblknowledge_base_groups kg
      `;

      if (withStats) {
        sql += `
          LEFT JOIN tblknowledge_base kb ON kg.kb_group_id = kb.articlegroup 
            AND kb.active = 1
        `;
      }

      sql += ' WHERE 1=1';

      if (activeOnly) {
        sql += ' AND kg.disabled = 0';
      }

      if (withStats) {
        sql += `
          GROUP BY kg.kb_group_id, kg.name, kg.description, kg.color, 
                   kg.group_order, kg.disabled
        `;
      }

      sql += ' ORDER BY kg.group_order ASC, kg.name ASC';

      const groups = await mysqlClient.query<KnowledgeGroupRow>(sql);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                groups,
                total_groups: groups.length,
                with_statistics: withStats
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
    name: 'create_knowledge_group',
    description: 'Criar novo grupo de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do grupo' },
        description: { type: 'string', description: 'Descrição do grupo' },
        color: { type: 'string', description: 'Cor do grupo (hex)' },
        group_order: { type: 'number', description: 'Ordem de exibição' },
        disabled: { type: 'boolean', description: 'Grupo desativado' }
      },
      required: ['name']
    },
    handler: async (args, mysqlClient) => {
      const { name, description = '', color = '#007BFF', group_order = 0, disabled = false } = args;

      // Verificar se nome já existe
      const existingGroup = await mysqlClient.queryOne(
        'SELECT kb_group_id FROM tblknowledge_base_groups WHERE name = ?',
        [name]
      );

      if (existingGroup) {
        throw new Error('Já existe um grupo com este nome');
      }

      // Inserir grupo
      const groupId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblknowledge_base_groups (
          name, description, color, group_order, disabled
        ) VALUES (?, ?, ?, ?, ?)
      `,
        [name, description, color, group_order, disabled ? 1 : 0]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Grupo criado com sucesso',
                kb_group_id: groupId,
                name: name,
                description: description,
                color: color,
                group_order: group_order
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
    name: 'search_knowledge_base',
    description: 'Pesquisa avançada na base de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de pesquisa' },
        kb_group_id: { type: 'number', description: 'Filtrar por grupo' },
        staff_only: { type: 'boolean', description: 'Apenas artigos de staff' },
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 20)' },
        search_content: { type: 'boolean', description: 'Pesquisar no conteúdo (padrão: true)' }
      },
      required: ['query']
    },
    handler: async (args, mysqlClient) => {
      const { query, kb_group_id, staff_only, limit = 20, search_content = true } = args;

      let sql = `
        SELECT 
          kb.articleid,
          kb.subject,
          kb.description,
          kb.articlegroup,
          kg.name as group_name,
          kg.color as group_color,
          kb.staff_article,
          kb.views,
          kb.datecreated,
          MATCH(kb.subject, kb.description${search_content ? ', kb.article_description' : ''}) 
            AGAINST(? IN BOOLEAN MODE) as relevance_score
        FROM tblknowledge_base kb
        LEFT JOIN tblknowledge_base_groups kg ON kb.articlegroup = kg.kb_group_id
        WHERE kb.active = 1
          AND MATCH(kb.subject, kb.description${search_content ? ', kb.article_description' : ''}) 
              AGAINST(? IN BOOLEAN MODE)
      `;

      const params = [query, query];

      if (kb_group_id) {
        sql += ' AND kb.articlegroup = ?';
        params.push(kb_group_id);
      }

      if (staff_only) {
        sql += ' AND kb.staff_article = 1';
      }

      sql += ' ORDER BY relevance_score DESC, kb.views DESC LIMIT ?';
      params.push(limit);

      const results = await mysqlClient.query(sql, params);

      // Se não encontrou resultados com FULLTEXT, fazer busca LIKE
      if (results.length === 0) {
        const fallbackSql = `
          SELECT 
            kb.articleid,
            kb.subject,
            kb.description,
            kb.articlegroup,
            kg.name as group_name,
            kg.color as group_color,
            kb.staff_article,
            kb.views,
            kb.datecreated,
            1 as relevance_score
          FROM tblknowledge_base kb
          LEFT JOIN tblknowledge_base_groups kg ON kb.articlegroup = kg.kb_group_id
          WHERE kb.active = 1
            AND (kb.subject LIKE ? OR kb.description LIKE ?${search_content ? ' OR kb.article_description LIKE ?' : ''})
        `;

        const fallbackParams = [`%${query}%`, `%${query}%`];
        if (search_content) {
          fallbackParams.push(`%${query}%`);
        }

        if (kb_group_id) {
          sql += ' AND kb.articlegroup = ?';
          fallbackParams.push(kb_group_id);
        }

        if (staff_only) {
          sql += ' AND kb.staff_article = 1';
        }

        sql += ' ORDER BY kb.views DESC LIMIT ?';
        fallbackParams.push(limit);

        const fallbackResults = await mysqlClient.query(fallbackSql, fallbackParams);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: query,
                  results: fallbackResults,
                  total_results: fallbackResults.length,
                  search_method: 'fallback_like',
                  searched_content: search_content
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query: query,
                results: results,
                total_results: results.length,
                search_method: 'fulltext',
                searched_content: search_content
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
    name: 'knowledge_analytics',
    description: 'Analytics da base de conhecimento',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        group_breakdown: { type: 'boolean', description: 'Incluir breakdown por grupo' }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const groupBreakdown = args?.group_breakdown || false;

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND kb.datecreated >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND kb.datecreated >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND kb.datecreated >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND kb.datecreated >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      // Estatísticas gerais
      const statsSql = `
        SELECT 
          COUNT(*) as total_articles,
          COUNT(DISTINCT kb.articlegroup) as total_groups,
          SUM(kb.views) as total_views,
          COUNT(CASE WHEN kb.staff_article = 1 THEN 1 END) as staff_articles,
          COUNT(CASE WHEN kb.staff_article = 0 THEN 1 END) as public_articles,
          COUNT(CASE WHEN kb.views >= 100 THEN 1 END) as popular_articles,
          COUNT(CASE WHEN kb.datecreated >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as recent_articles,
          AVG(kb.views) as avg_views_per_article
        FROM tblknowledge_base kb
        WHERE kb.active = 1 ${dateFilter}
      `;

      const stats = await mysqlClient.queryOne<KnowledgeStatsRow>(statsSql);

      let groupStats = null;
      if (groupBreakdown) {
        const groupStatsSql = `
          SELECT 
            kg.kb_group_id,
            kg.name as group_name,
            kg.color as group_color,
            COUNT(kb.articleid) as article_count,
            SUM(kb.views) as total_views,
            AVG(kb.views) as avg_views,
            MAX(kb.datecreated) as last_article_date
          FROM tblknowledge_base_groups kg
          LEFT JOIN tblknowledge_base kb ON kg.kb_group_id = kb.articlegroup 
            AND kb.active = 1 ${dateFilter}
          WHERE kg.disabled = 0
          GROUP BY kg.kb_group_id, kg.name, kg.color
          ORDER BY article_count DESC
        `;

        groupStats = await mysqlClient.query(groupStatsSql);
      }

      // Top artigos mais visualizados
      const topArticlesSql = `
        SELECT 
          kb.articleid,
          kb.subject,
          kg.name as group_name,
          kb.views,
          kb.datecreated
        FROM tblknowledge_base kb
        LEFT JOIN tblknowledge_base_groups kg ON kb.articlegroup = kg.kb_group_id
        WHERE kb.active = 1 ${dateFilter}
        ORDER BY kb.views DESC
        LIMIT 10
      `;

      const topArticles = await mysqlClient.query(topArticlesSql);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                overall_stats: stats,
                group_breakdown: groupStats,
                top_articles: topArticles,
                insights: {
                  engagement_rate: stats
                    ? (stats.total_views / stats.total_articles).toFixed(2)
                    : '0',
                  staff_ratio: stats
                    ? ((stats.staff_articles / stats.total_articles) * 100).toFixed(1) + '%'
                    : '0%',
                  popular_ratio: stats
                    ? ((stats.popular_articles / stats.total_articles) * 100).toFixed(1) + '%'
                    : '0%'
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
