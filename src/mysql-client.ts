import * as mysql from 'mysql2/promise';
import { MySQLConfig } from './types/database.js';
import { logger, logQuery } from './utils/logger.js';
import { maskSensitiveData } from './utils/security.js';
import { performanceLogger } from './utils/performance-logger.js';
import { debugLog } from './utils/debug-logger.js';
// MySQL2 types available when needed
// import type { RowDataPacket, ResultSetHeader, FieldPacket } from 'mysql2';

export class MySQLClient {
  private pool: mysql.Pool;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;
  private readonly queryTimeout = parseInt(process.env.QUERY_TIMEOUT_MS || '30000');

  constructor(
    private config: MySQLConfig,
    private clientId: string = 'default'
  ) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // Importante: Retornar números como números, não strings
      decimalNumbers: true,
      typeCast: function (field, next) {
        // Tratar DECIMAL e FLOAT como números
        if (field.type === 'DECIMAL' || field.type === 'FLOAT' || field.type === 'DOUBLE') {
          const value = field.string();
          return value === null ? null : parseFloat(value);
        }
        return next();
      }
    });

    // Log mínimo em produção para não esgotar contexto do Claude
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`MySQL client initialized: ${config.database}`);
    }
  }

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    let retries = 0;
    const startTime = Date.now();

    debugLog.sql(sql, params);

    while (retries < this.maxRetries) {
      const queryStart = Date.now();

      try {
        const [rows] = await this.pool.execute(sql, params);
        const duration = Date.now() - startTime;
        // const queryDuration = Date.now() - queryStart; // Unused variable

        logQuery(sql, params, duration, this.clientId);
        performanceLogger.logQuery(
          sql,
          params,
          queryStart,
          undefined,
          Array.isArray(rows) ? rows.length : 0
        );
        debugLog.sql(sql, params, rows);

        // Mascarar dados sensíveis antes de retornar
        const maskedRows = maskSensitiveData(rows);

        return maskedRows as T[];
      } catch (error) {
        retries++;

        const queryDuration = Date.now() - queryStart;
        performanceLogger.logQuery(sql, params, queryStart, error as Error);

        logger.error(`Query failed (attempt ${retries}/${this.maxRetries})`, {
          sql: sql.substring(0, 100),
          error: error instanceof Error ? error.message : String(error),
          clientId: this.clientId,
          duration: `${queryDuration}ms`
        });

        debugLog.error('Query execution failed', error, {
          attempt: retries,
          sql: sql.substring(0, 200),
          clientId: this.clientId
        });

        if (retries >= this.maxRetries) {
          throw new Error(
            `Query failed after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, this.retryDelay * retries));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async executeInsert(sql: string, params: any[] = []): Promise<number> {
    let retries = 0;
    const startTime = Date.now();

    debugLog.sql(sql, params);

    while (retries < this.maxRetries) {
      const queryStart = Date.now();

      try {
        const [result] = await this.pool.execute(sql, params);
        const duration = Date.now() - startTime;

        logQuery(sql, params, duration, this.clientId);
        performanceLogger.logQuery(sql, params, queryStart, undefined, 1);
        debugLog.sql(sql, params, result);

        // Para INSERT queries, result é um ResultSetHeader com insertId
        return (result as any).insertId;
      } catch (error) {
        retries++;

        const queryDuration = Date.now() - queryStart;
        performanceLogger.logQuery(sql, params, queryStart, error as Error);

        logger.error(`Insert failed (attempt ${retries}/${this.maxRetries})`, {
          sql: sql.substring(0, 100),
          error: error instanceof Error ? error.message : String(error),
          clientId: this.clientId,
          duration: `${queryDuration}ms`
        });

        if (retries >= this.maxRetries) {
          throw new Error(
            `Insert failed after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, this.retryDelay * retries));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async transaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      logger.debug('Transaction started');

      const result = await callback(connection);

      await connection.commit();
      logger.debug('Transaction committed');

      return result;
    } catch (error) {
      await connection.rollback();

      logger.error('Transaction rolled back', {
        error: error instanceof Error ? error.message : String(error),
        clientId: this.clientId
      });

      throw error;
    } finally {
      connection.release();
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as test');
      if (process.env.NODE_ENV !== 'production') {
        logger.info('Database connection test successful');
      }
      return true;
    } catch (error) {
      logger.error('Database connection test failed', {
        error: error instanceof Error ? error.message : String(error),
        clientId: this.clientId
      });
      return false;
    }
  }

  async getTableInfo(tableName: string): Promise<any[]> {
    const sql = 'DESCRIBE ??';
    return this.query(sql, [tableName]);
  }

  async getRecordCount(
    tableName: string,
    whereClause: string = '',
    params: any[] = []
  ): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ?? ${whereClause}`;
    const result = await this.queryOne<{ count: number }>(sql, [tableName, ...params]);
    return result?.count || 0;
  }

  // Método específico para queries de relatórios com limitação de resultados
  async queryWithLimit<T>(
    sql: string,
    params: any[] = [],
    limit: number = 100,
    offset: number = 0
  ): Promise<{ data: T[]; total: number; hasMore: boolean }> {
    // Query para contar total de registos
    const countSql = sql.replace(/SELECT.*?FROM/i, 'SELECT COUNT(*) as total FROM');
    const countResult = await this.queryOne<{ total: number }>(countSql, params);
    const total = countResult?.total || 0;

    // Query principal com limite
    const limitedSql = `${sql} LIMIT ${limit} OFFSET ${offset}`;
    const data = await this.query<T>(limitedSql, params);

    return {
      data,
      total,
      hasMore: offset + limit < total
    };
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.debug('MySQL connection pool closed');
    } catch (error) {
      logger.error('Error closing MySQL connection pool', {
        error: error instanceof Error ? error.message : String(error),
        clientId: this.clientId
      });
    }
  }
}
