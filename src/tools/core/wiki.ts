import { MySQLClient } from '../../mysql-client.js';
import { ResultSetHeader, DatabaseRow } from '../../types/mysql.js';

export interface WikiTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any, mysqlClient: MySQLClient) => Promise<any>;
}

// Interfaces para os resultados das queries
interface WikiPageRow extends DatabaseRow {
  id: number;
  title: string;
  slug: string;
  content: string;
  parent_id: number;
  parent_title: string;
  category_id: number;
  category_name: string;
  created_by: number;
  creator_name: string;
  updated_by: number;
  updater_name: string;
  created_at: Date;
  updated_at: Date;
  version: number;
  status: string;
  views: number;
  is_featured: number;
  tags: string;
  permissions: string;
}

interface WikiCategoryRow extends DatabaseRow {
  id: number;
  name: string;
  description: string;
  slug: string;
  color: string;
  icon: string;
  parent_id: number;
  order_position: number;
  page_count: number;
  total_views: number;
  last_updated: Date;
  is_private: number;
}

interface WikiVersionRow extends DatabaseRow {
  id: number;
  page_id: number;
  title: string;
  content: string;
  version_number: number;
  change_summary: string;
  created_by: number;
  creator_name: string;
  created_at: Date;
  content_size: number;
}

interface WikiLinkRow extends DatabaseRow {
  from_page_id: number;
  from_page_title: string;
  to_page_id: number;
  to_page_title: string;
  link_text: string;
  link_type: string;
}

interface WikiStatsRow extends DatabaseRow {
  total_pages: number;
  total_categories: number;
  total_views: number;
  active_pages: number;
  draft_pages: number;
  featured_pages: number;
  total_contributors: number;
  avg_views_per_page: number;
  recent_edits: number;
}

export const wikiTools: WikiTool[] = [
  {
    name: 'get_wiki_pages',
    description: 'Listar páginas wiki com filtros avançados',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 50)' },
        offset: { type: 'number', description: 'Offset para paginação (padrão: 0)' },
        category_id: { type: 'number', description: 'ID da categoria' },
        parent_id: { type: 'number', description: 'ID da página pai' },
        status: {
          type: 'string',
          enum: ['published', 'draft', 'private'],
          description: 'Status da página'
        },
        search: { type: 'string', description: 'Buscar por título ou conteúdo' },
        featured_only: { type: 'boolean', description: 'Apenas páginas em destaque' },
        recent: { type: 'boolean', description: 'Ordenar por mais recentes' },
        popular: { type: 'boolean', description: 'Ordenar por mais visualizadas' },
        created_by: { type: 'number', description: 'Filtrar por criador' }
      }
    },
    handler: async (args, mysqlClient) => {
      const limit = args?.limit || 50;
      const offset = args?.offset || 0;

      let sql = `
        SELECT 
          w.id,
          w.title,
          w.slug,
          LEFT(w.content, 200) as content_preview,
          w.parent_id,
          wp.title as parent_title,
          w.category_id,
          wc.name as category_name,
          w.created_by,
          CONCAT(s1.firstname, ' ', s1.lastname) as creator_name,
          w.updated_by,
          CONCAT(s2.firstname, ' ', s2.lastname) as updater_name,
          w.created_at,
          w.updated_at,
          w.version,
          w.status,
          w.views,
          w.is_featured,
          '' as tags,
          '' as permissions
        FROM tblwiki_pages w
        LEFT JOIN tblwiki_pages wp ON w.parent_id = wp.id
        LEFT JOIN tblwiki_categories wc ON w.category_id = wc.id
        LEFT JOIN tblstaff s1 ON w.created_by = s1.staffid
        LEFT JOIN tblstaff s2 ON w.updated_by = s2.staffid
        WHERE 1=1
      `;

      const params: any[] = [];

      if (args?.category_id) {
        sql += ' AND w.category_id = ?';
        params.push(args.category_id);
      }

      if (args?.parent_id !== undefined) {
        if (args.parent_id === 0) {
          sql += ' AND (w.parent_id IS NULL OR w.parent_id = 0)';
        } else {
          sql += ' AND w.parent_id = ?';
          params.push(args.parent_id);
        }
      }

      if (args?.status) {
        sql += ' AND w.status = ?';
        params.push(args.status);
      }

      if (args?.search) {
        sql += ' AND (w.title LIKE ? OR w.content LIKE ?)';
        const searchTerm = `%${args.search}%`;
        params.push(searchTerm, searchTerm);
      }

      if (args?.featured_only) {
        sql += ' AND w.is_featured = 1';
      }

      if (args?.created_by) {
        sql += ' AND w.created_by = ?';
        params.push(args.created_by);
      }

      if (args?.popular) {
        sql += ' ORDER BY w.views DESC, w.updated_at DESC';
      } else if (args?.recent) {
        sql += ' ORDER BY w.updated_at DESC';
      } else {
        sql += ' ORDER BY w.title ASC';
      }

      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const pages = await mysqlClient.query<WikiPageRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                pages,
                pagination: {
                  limit,
                  offset,
                  count: pages.length
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
    name: 'get_wiki_page',
    description: 'Obter página wiki específica com conteúdo completo',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'number', description: 'ID da página' },
        slug: { type: 'string', description: 'Slug da página (alternativa ao ID)' },
        increment_views: { type: 'boolean', description: 'Incrementar contador de visualizações' },
        include_history: { type: 'boolean', description: 'Incluir histórico de versões' },
        include_children: { type: 'boolean', description: 'Incluir páginas filhas' }
      }
    },
    handler: async (args, mysqlClient) => {
      if (!args?.page_id && !args?.slug) {
        throw new Error('page_id ou slug é obrigatório');
      }

      let whereClause = '';
      let whereParam;

      if (args.page_id) {
        whereClause = 'w.id = ?';
        whereParam = args.page_id;
      } else {
        whereClause = 'w.slug = ?';
        whereParam = args.slug;
      }

      const sql = `
        SELECT 
          w.*,
          wp.title as parent_title,
          wc.name as category_name,
          wc.color as category_color,
          CONCAT(s1.firstname, ' ', s1.lastname) as creator_name,
          CONCAT(s2.firstname, ' ', s2.lastname) as updater_name,
          '' as tags,
          '' as permissions
        FROM tblwiki_pages w
        LEFT JOIN tblwiki_pages wp ON w.parent_id = wp.id
        LEFT JOIN tblwiki_categories wc ON w.category_id = wc.id
        LEFT JOIN tblstaff s1 ON w.created_by = s1.staffid
        LEFT JOIN tblstaff s2 ON w.updated_by = s2.staffid
        WHERE ${whereClause}
      `;

      const page = await mysqlClient.queryOne<WikiPageRow>(sql, [whereParam]);

      if (!page) {
        return {
          content: [
            {
              type: 'text',
              text: 'Página wiki não encontrada'
            }
          ]
        };
      }

      // Incrementar visualizações se solicitado
      if (args?.increment_views && page.id) {
        await mysqlClient.query('UPDATE tblwiki_pages SET views = views + 1 WHERE id = ?', [
          page.id
        ]);
        page.views = (page.views || 0) + 1;
      }

      let history = null;
      if (args?.include_history) {
        const historySql = `
          SELECT 
            wv.id,
            wv.version_number,
            wv.change_summary,
            wv.created_at,
            CONCAT(s.firstname, ' ', s.lastname) as creator_name,
            LENGTH(wv.content) as content_size
          FROM tblwiki_versions wv
          LEFT JOIN tblstaff s ON wv.created_by = s.staffid
          WHERE wv.page_id = ?
          ORDER BY wv.version_number DESC
          LIMIT 10
        `;
        history = await mysqlClient.query<WikiVersionRow>(historySql, [page.id]);
      }

      let children = null;
      if (args?.include_children) {
        const childrenSql = `
          SELECT 
            id, title, slug, status, views, updated_at
          FROM tblwiki_pages
          WHERE parent_id = ? AND status != 'deleted'
          ORDER BY title ASC
        `;
        children = await mysqlClient.query(childrenSql, [page.id]);
      }

      // Buscar links relacionados (páginas que linkam para esta)
      const backLinksSql = `
        SELECT 
          wl.from_page_id,
          wp.title as from_page_title,
          wp.slug as from_page_slug
        FROM tblwiki_links wl
        JOIN tblwiki_pages wp ON wl.from_page_id = wp.id
        WHERE wl.to_page_id = ? AND wp.status = 'published'
        LIMIT 10
      `;
      const backLinks = await mysqlClient.query<WikiLinkRow>(backLinksSql, [page.id]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                page: {
                  ...page,
                  version_history: history,
                  children_pages: children,
                  back_links: backLinks
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
    name: 'create_wiki_page',
    description: 'Criar nova página wiki',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título da página' },
        content: { type: 'string', description: 'Conteúdo da página (Markdown/HTML)' },
        slug: { type: 'string', description: 'Slug da página (auto-gerado se não fornecido)' },
        category_id: { type: 'number', description: 'ID da categoria' },
        parent_id: { type: 'number', description: 'ID da página pai' },
        status: {
          type: 'string',
          enum: ['published', 'draft', 'private'],
          description: 'Status da página'
        },
        created_by: { type: 'number', description: 'ID do criador' },
        tags: { type: 'string', description: 'Tags separadas por vírgula' },
        is_featured: { type: 'boolean', description: 'Marcar como destaque' },
        change_summary: { type: 'string', description: 'Resumo das alterações' }
      },
      required: ['title', 'content', 'created_by']
    },
    handler: async (args, mysqlClient) => {
      const {
        title,
        content,
        slug,
        category_id = null,
        parent_id = null,
        status = 'draft',
        created_by,
        tags = '',
        is_featured = false,
        change_summary = 'Criação inicial da página'
      } = args;

      // Gerar slug se não fornecido
      const finalSlug =
        slug ||
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 100);

      // Verificar se slug já existe
      const existingPage = await mysqlClient.queryOne(
        'SELECT id FROM tblwiki_pages WHERE slug = ?',
        [finalSlug]
      );

      if (existingPage) {
        throw new Error('Já existe uma página com este slug');
      }

      // Armazenar tags no content se fornecidas (workaround)
      const contentWithTags = tags ? `${content}\n\n<!-- [WIKI_TAGS: ${tags}] -->` : content;

      // Inserir página
      const pageId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblwiki_pages (
          title, slug, content, category_id, parent_id, status,
          created_by, updated_by, created_at, updated_at,
          version, views, is_featured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 1, 0, ?)
      `,
        [
          title,
          finalSlug,
          contentWithTags,
          category_id,
          parent_id,
          status,
          created_by,
          created_by,
          is_featured ? 1 : 0
        ]
      );

      // Criar primeira versão no histórico
      await mysqlClient.executeInsert(
        `
        INSERT INTO tblwiki_versions (
          page_id, title, content, version_number, change_summary,
          created_by, created_at
        ) VALUES (?, ?, ?, 1, ?, ?, NOW())
      `,
        [pageId, title, contentWithTags, change_summary, created_by]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Página wiki criada com sucesso',
                page_id: pageId,
                title: title,
                slug: finalSlug,
                status: status,
                category_id: category_id,
                parent_id: parent_id,
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
    name: 'update_wiki_page',
    description: 'Atualizar página wiki existente',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'number', description: 'ID da página' },
        title: { type: 'string', description: 'Novo título' },
        content: { type: 'string', description: 'Novo conteúdo' },
        slug: { type: 'string', description: 'Novo slug' },
        category_id: { type: 'number', description: 'Nova categoria' },
        parent_id: { type: 'number', description: 'Nova página pai' },
        status: {
          type: 'string',
          enum: ['published', 'draft', 'private'],
          description: 'Novo status'
        },
        updated_by: { type: 'number', description: 'ID do editor' },
        tags: { type: 'string', description: 'Novas tags' },
        is_featured: { type: 'boolean', description: 'Marcar como destaque' },
        change_summary: { type: 'string', description: 'Resumo das alterações' }
      },
      required: ['page_id', 'updated_by']
    },
    handler: async (args, mysqlClient) => {
      const {
        page_id,
        updated_by,
        change_summary = 'Atualização da página',
        tags,
        ...updateFields
      } = args;

      // Verificar se página existe
      const page = await mysqlClient.queryOne<
        { id: number; version: number; content: string; title: string } & DatabaseRow
      >('SELECT id, version, content, title FROM tblwiki_pages WHERE id = ?', [page_id]);

      if (!page) {
        throw new Error('Página wiki não encontrada');
      }

      const updateParts = [];
      const updateParams = [];
      const newVersion = page.version + 1;

      // Campos normais
      const allowedFields = ['title', 'slug', 'category_id', 'parent_id', 'status', 'is_featured'];
      for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
          if (field === 'is_featured') {
            updateParts.push(`${field} = ?`);
            updateParams.push(updateFields[field] ? 1 : 0);
          } else {
            updateParts.push(`${field} = ?`);
            updateParams.push(updateFields[field]);
          }
        }
      }

      // Atualizar content com tags se fornecido
      let newContent = updateFields.content;
      if (newContent !== undefined || tags !== undefined) {
        if (newContent === undefined) {
          newContent = page.content;
        }

        // Remover tags existentes do content
        newContent = newContent.replace(/\n\n<!-- \[WIKI_TAGS:.*?\] -->/g, '');

        // Adicionar novas tags se fornecidas
        if (tags) {
          newContent += `\n\n<!-- [WIKI_TAGS: ${tags}] -->`;
        }

        updateParts.push('content = ?');
        updateParams.push(newContent);
      }

      if (updateParts.length === 0) {
        throw new Error('Nenhum campo para atualizar fornecido');
      }

      // Sempre atualizar versão, editor e data
      updateParts.push('version = ?', 'updated_by = ?', 'updated_at = NOW()');
      updateParams.push(newVersion, updated_by, page_id);

      await mysqlClient.query(
        `UPDATE tblwiki_pages SET ${updateParts.join(', ')} WHERE id = ?`,
        updateParams
      );

      // Criar nova versão no histórico se houve alteração de conteúdo ou título
      if (updateFields.content !== undefined || updateFields.title !== undefined) {
        const finalTitle = updateFields.title || page.title;
        const finalContent = newContent || page.content;

        await mysqlClient.executeInsert(
          `
          INSERT INTO tblwiki_versions (
            page_id, title, content, version_number, change_summary,
            created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, NOW())
        `,
          [page_id, finalTitle, finalContent, newVersion, change_summary, updated_by]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Página wiki atualizada com sucesso',
                page_id: page_id,
                new_version: newVersion,
                change_summary: change_summary,
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
    name: 'delete_wiki_page',
    description: 'Eliminar página wiki',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'number', description: 'ID da página' },
        soft_delete: {
          type: 'boolean',
          description: 'Soft delete (status deleted) em vez de eliminar (padrão: true)'
        },
        updated_by: { type: 'number', description: 'ID do editor' }
      },
      required: ['page_id']
    },
    handler: async (args, mysqlClient) => {
      const { page_id, soft_delete = true, updated_by = 0 } = args;

      // Verificar se página existe
      const page = await mysqlClient.queryOne<
        { id: number; title: string; parent_id: number } & DatabaseRow
      >('SELECT id, title, parent_id FROM tblwiki_pages WHERE id = ?', [page_id]);

      if (!page) {
        throw new Error('Página wiki não encontrada');
      }

      // Verificar se tem páginas filhas
      const children = await mysqlClient.queryOne<{ count: number } & DatabaseRow>(
        'SELECT COUNT(*) as count FROM tblwiki_pages WHERE parent_id = ? AND status != "deleted"',
        [page_id]
      );

      if (children?.count > 0) {
        throw new Error(
          'Não é possível eliminar página que tem páginas filhas. Mova ou elimine as páginas filhas primeiro.'
        );
      }

      if (soft_delete) {
        // Soft delete - marcar como deleted
        await mysqlClient.query(
          'UPDATE tblwiki_pages SET status = "deleted", updated_by = ?, updated_at = NOW() WHERE id = ?',
          [updated_by, page_id]
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Página marcada como eliminada',
                  page_id: page_id,
                  action: 'soft_deleted',
                  title: page.title
                },
                null,
                2
              )
            }
          ]
        };
      } else {
        // Hard delete - eliminar completamente
        // Eliminar versões
        await mysqlClient.query('DELETE FROM tblwiki_versions WHERE page_id = ?', [page_id]);

        // Eliminar links
        await mysqlClient.query(
          'DELETE FROM tblwiki_links WHERE from_page_id = ? OR to_page_id = ?',
          [page_id, page_id]
        );

        // Eliminar página
        const result = await mysqlClient.query<ResultSetHeader>(
          'DELETE FROM tblwiki_pages WHERE id = ?',
          [page_id]
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Página eliminada permanentemente',
                  page_id: page_id,
                  action: 'hard_deleted',
                  affected_rows: result[0]?.affectedRows || 0,
                  title: page.title
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
    name: 'get_wiki_categories',
    description: 'Listar categorias wiki',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: { type: 'number', description: 'ID da categoria pai (0 para principais)' },
        with_stats: { type: 'boolean', description: 'Incluir estatísticas de páginas' },
        include_private: { type: 'boolean', description: 'Incluir categorias privadas' }
      }
    },
    handler: async (args, mysqlClient) => {
      const includePrivate = args?.include_private || false;
      const withStats = args?.with_stats || false;

      let sql = `
        SELECT 
          wc.id,
          wc.name,
          wc.description,
          wc.slug,
          wc.color,
          wc.icon,
          wc.parent_id,
          wc.order_position,
          wc.is_private
      `;

      if (withStats) {
        sql += `,
          COUNT(wp.id) as page_count,
          SUM(wp.views) as total_views,
          MAX(wp.updated_at) as last_updated
        `;
      }

      sql += `
        FROM tblwiki_categories wc
      `;

      if (withStats) {
        sql += `
          LEFT JOIN tblwiki_pages wp ON wc.id = wp.category_id 
            AND wp.status = 'published'
        `;
      }

      sql += ' WHERE 1=1';

      const params: any[] = [];

      if (args?.parent_id !== undefined) {
        if (args.parent_id === 0) {
          sql += ' AND (wc.parent_id IS NULL OR wc.parent_id = 0)';
        } else {
          sql += ' AND wc.parent_id = ?';
          params.push(args.parent_id);
        }
      }

      if (!includePrivate) {
        sql += ' AND wc.is_private = 0';
      }

      if (withStats) {
        sql += `
          GROUP BY wc.id, wc.name, wc.description, wc.slug, wc.color, 
                   wc.icon, wc.parent_id, wc.order_position, wc.is_private
        `;
      }

      sql += ' ORDER BY wc.order_position ASC, wc.name ASC';

      const categories = await mysqlClient.query<WikiCategoryRow>(sql, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                categories,
                total_categories: categories.length,
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
    name: 'create_wiki_category',
    description: 'Criar nova categoria wiki',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome da categoria' },
        description: { type: 'string', description: 'Descrição da categoria' },
        slug: { type: 'string', description: 'Slug da categoria (auto-gerado se não fornecido)' },
        color: { type: 'string', description: 'Cor da categoria (hex)' },
        icon: { type: 'string', description: 'Ícone da categoria' },
        parent_id: { type: 'number', description: 'ID da categoria pai' },
        order_position: { type: 'number', description: 'Posição de ordenação' },
        is_private: { type: 'boolean', description: 'Categoria privada' }
      },
      required: ['name']
    },
    handler: async (args, mysqlClient) => {
      const {
        name,
        description = '',
        slug,
        color = '#007BFF',
        icon = 'folder',
        parent_id = null,
        order_position = 0,
        is_private = false
      } = args;

      // Gerar slug se não fornecido
      const finalSlug =
        slug ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 50);

      // Verificar se nome já existe
      const existingCategory = await mysqlClient.queryOne(
        'SELECT id FROM tblwiki_categories WHERE name = ? OR slug = ?',
        [name, finalSlug]
      );

      if (existingCategory) {
        throw new Error('Já existe uma categoria com este nome ou slug');
      }

      // Inserir categoria
      const categoryId = await mysqlClient.executeInsert(
        `
        INSERT INTO tblwiki_categories (
          name, description, slug, color, icon, parent_id,
          order_position, is_private
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [name, description, finalSlug, color, icon, parent_id, order_position, is_private ? 1 : 0]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Categoria wiki criada com sucesso',
                category_id: categoryId,
                name: name,
                slug: finalSlug,
                color: color,
                parent_id: parent_id
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
    name: 'search_wiki',
    description: 'Pesquisa avançada no wiki',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de pesquisa' },
        category_id: { type: 'number', description: 'Filtrar por categoria' },
        status: {
          type: 'string',
          enum: ['published', 'draft', 'private'],
          description: 'Filtrar por status'
        },
        limit: { type: 'number', description: 'Número máximo de resultados (padrão: 20)' },
        search_content: { type: 'boolean', description: 'Pesquisar no conteúdo (padrão: true)' },
        created_by: { type: 'number', description: 'Filtrar por criador' }
      },
      required: ['query']
    },
    handler: async (args, mysqlClient) => {
      const {
        query,
        category_id,
        status = 'published',
        limit = 20,
        search_content = true,
        created_by
      } = args;

      let sql = `
        SELECT 
          w.id,
          w.title,
          w.slug,
          LEFT(w.content, 300) as content_preview,
          w.category_id,
          wc.name as category_name,
          w.created_by,
          CONCAT(s.firstname, ' ', s.lastname) as creator_name,
          w.updated_at,
          w.views,
          w.is_featured,
          MATCH(w.title${search_content ? ', w.content' : ''}) 
            AGAINST(? IN BOOLEAN MODE) as relevance_score
        FROM tblwiki_pages w
        LEFT JOIN tblwiki_categories wc ON w.category_id = wc.id
        LEFT JOIN tblstaff s ON w.created_by = s.staffid
        WHERE w.status = ?
          AND MATCH(w.title${search_content ? ', w.content' : ''}) 
              AGAINST(? IN BOOLEAN MODE)
      `;

      const params = [query, status, query];

      if (category_id) {
        sql += ' AND w.category_id = ?';
        params.push(category_id);
      }

      if (created_by) {
        sql += ' AND w.created_by = ?';
        params.push(created_by);
      }

      sql += ' ORDER BY relevance_score DESC, w.views DESC LIMIT ?';
      params.push(limit);

      let results = await mysqlClient.query(sql, params);

      // Se não encontrou resultados com FULLTEXT, fazer busca LIKE
      if (results.length === 0) {
        const fallbackSql = `
          SELECT 
            w.id,
            w.title,
            w.slug,
            LEFT(w.content, 300) as content_preview,
            w.category_id,
            wc.name as category_name,
            w.created_by,
            CONCAT(s.firstname, ' ', s.lastname) as creator_name,
            w.updated_at,
            w.views,
            w.is_featured,
            1 as relevance_score
          FROM tblwiki_pages w
          LEFT JOIN tblwiki_categories wc ON w.category_id = wc.id
          LEFT JOIN tblstaff s ON w.created_by = s.staffid
          WHERE w.status = ?
            AND (w.title LIKE ?${search_content ? ' OR w.content LIKE ?' : ''})
        `;

        const fallbackParams = [status, `%${query}%`];
        if (search_content) {
          fallbackParams.push(`%${query}%`);
        }

        if (category_id) {
          sql += ' AND w.category_id = ?';
          fallbackParams.push(category_id);
        }

        if (created_by) {
          sql += ' AND w.created_by = ?';
          fallbackParams.push(created_by);
        }

        sql += ' ORDER BY w.views DESC LIMIT ?';
        fallbackParams.push(limit);

        results = await mysqlClient.query(fallbackSql, fallbackParams);
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
                searched_content: search_content,
                filters: {
                  category_id: category_id,
                  status: status,
                  created_by: created_by
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
    name: 'wiki_analytics',
    description: 'Analytics do sistema wiki',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year'],
          description: 'Período para análise'
        },
        category_breakdown: { type: 'boolean', description: 'Incluir breakdown por categoria' },
        contributor_stats: {
          type: 'boolean',
          description: 'Incluir estatísticas de contribuidores'
        }
      }
    },
    handler: async (args, mysqlClient) => {
      const period = args?.period || 'month';
      const categoryBreakdown = args?.category_breakdown || false;
      const contributorStats = args?.contributor_stats || false;

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = 'AND w.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND w.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateFilter = 'AND w.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND w.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
      }

      // Estatísticas gerais
      const statsSql = `
        SELECT 
          COUNT(*) as total_pages,
          COUNT(DISTINCT w.category_id) as total_categories,
          SUM(w.views) as total_views,
          COUNT(CASE WHEN w.status = 'published' THEN 1 END) as active_pages,
          COUNT(CASE WHEN w.status = 'draft' THEN 1 END) as draft_pages,
          COUNT(CASE WHEN w.is_featured = 1 THEN 1 END) as featured_pages,
          COUNT(DISTINCT w.created_by) as total_contributors,
          AVG(w.views) as avg_views_per_page,
          COUNT(CASE WHEN w.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as recent_edits
        FROM tblwiki_pages w
        WHERE w.status != 'deleted' ${dateFilter}
      `;

      const stats = await mysqlClient.queryOne<WikiStatsRow>(statsSql);

      let categoryStats = null;
      if (categoryBreakdown) {
        const categoryStatsSql = `
          SELECT 
            wc.id as category_id,
            wc.name as category_name,
            wc.color as category_color,
            COUNT(w.id) as page_count,
            SUM(w.views) as total_views,
            AVG(w.views) as avg_views,
            MAX(w.updated_at) as last_updated
          FROM tblwiki_categories wc
          LEFT JOIN tblwiki_pages w ON wc.id = w.category_id 
            AND w.status = 'published' ${dateFilter}
          GROUP BY wc.id, wc.name, wc.color
          ORDER BY page_count DESC
        `;

        categoryStats = await mysqlClient.query(categoryStatsSql);
      }

      let contributors = null;
      if (contributorStats) {
        const contributorsSql = `
          SELECT 
            w.created_by,
            CONCAT(s.firstname, ' ', s.lastname) as contributor_name,
            COUNT(w.id) as pages_created,
            SUM(w.views) as total_views,
            MAX(w.created_at) as last_contribution,
            COUNT(CASE WHEN w.status = 'published' THEN 1 END) as published_pages
          FROM tblwiki_pages w
          LEFT JOIN tblstaff s ON w.created_by = s.staffid
          WHERE w.status != 'deleted' ${dateFilter}
          GROUP BY w.created_by, s.firstname, s.lastname
          ORDER BY pages_created DESC
          LIMIT 10
        `;

        contributors = await mysqlClient.query(contributorsSql);
      }

      // Top páginas mais visualizadas
      const topPagesSql = `
        SELECT 
          w.id,
          w.title,
          w.slug,
          wc.name as category_name,
          w.views,
          w.updated_at
        FROM tblwiki_pages w
        LEFT JOIN tblwiki_categories wc ON w.category_id = wc.id
        WHERE w.status = 'published' ${dateFilter}
        ORDER BY w.views DESC
        LIMIT 10
      `;

      const topPages = await mysqlClient.query(topPagesSql);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                period,
                overall_stats: stats,
                category_breakdown: categoryStats,
                top_contributors: contributors,
                most_viewed_pages: topPages,
                insights: {
                  engagement_rate: stats ? (stats.total_views / stats.total_pages).toFixed(2) : '0',
                  publish_rate: stats
                    ? ((stats.active_pages / stats.total_pages) * 100).toFixed(1) + '%'
                    : '0%',
                  featured_rate: stats
                    ? ((stats.featured_pages / stats.total_pages) * 100).toFixed(1) + '%'
                    : '0%',
                  avg_contributions_per_user: stats
                    ? (stats.total_pages / stats.total_contributors).toFixed(1)
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
