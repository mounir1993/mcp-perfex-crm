import { logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';

interface PerformanceMetrics {
  tool: string;
  duration: number;
  timestamp: Date;
  clientId?: string;
  userId?: string;
  success: boolean;
  error?: string;
  inputSize?: number;
  outputSize?: number;
  queryCount?: number;
}

interface QueryMetrics {
  sql: string;
  duration: number;
  rowCount?: number;
  params?: any[];
  error?: string;
}

class PerformanceLogger {
  private metrics: PerformanceMetrics[] = [];
  private queryMetrics: QueryMetrics[] = [];
  private readonly metricsFile: string;
  private readonly slowQueryThreshold: number;
  private readonly flushInterval: number;
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    this.metricsFile = process.env.METRICS_FILE || 'logs/performance-metrics.json';
    this.slowQueryThreshold = parseInt(process.env.SLOW_QUERY_MS || '1000');
    this.flushInterval = parseInt(process.env.METRICS_FLUSH_INTERVAL || '60000'); // 1 min

    // Criar diretório de logs se não existir
    const logDir = path.dirname(this.metricsFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Iniciar flush automático
    this.startAutoFlush();
  }

  /**
   * Log de execução de ferramenta
   */
  logToolExecution(
    tool: string,
    startTime: number,
    success: boolean,
    error?: string,
    inputSize?: number,
    outputSize?: number
  ): void {
    const duration = Date.now() - startTime;
    const metric: PerformanceMetrics = {
      tool,
      duration,
      timestamp: new Date(),
      clientId: process.env.CLIENT_ID,
      success,
      error,
      inputSize,
      outputSize,
      queryCount: this.queryMetrics.length
    };

    this.metrics.push(metric);

    // Log para console/arquivo se habilitado
    if (process.env.LOG_PERFORMANCE === 'true') {
      logger.info('Tool Execution', {
        tool: metric.tool,
        duration: `${metric.duration}ms`,
        success: metric.success,
        error: metric.error,
        queryCount: metric.queryCount
      });
    }

    // Alerta para execuções lentas
    if (duration > 5000) {
      logger.warn('Slow Tool Execution', {
        tool: metric.tool,
        duration: `${metric.duration}ms`,
        threshold: '5000ms'
      });
    }
  }

  /**
   * Log de query SQL com métricas
   */
  logQuery(sql: string, params: any[], startTime: number, error?: Error, rowCount?: number): void {
    const duration = Date.now() - startTime;
    const query: QueryMetrics = {
      sql: sql.substring(0, 500),
      duration,
      rowCount,
      params: process.env.LOG_QUERY_PARAMS === 'true' ? params : undefined,
      error: error?.message
    };

    this.queryMetrics.push(query);

    // Log de queries lentas
    if (duration > this.slowQueryThreshold) {
      logger.warn('Slow Query Detected', {
        sql: query.sql,
        duration: `${duration}ms`,
        threshold: `${this.slowQueryThreshold}ms`,
        rowCount
      });
    }

    // Log de debug completo se habilitado
    if (process.env.DEBUG_SQL === 'true') {
      logger.debug('SQL Query', {
        sql: query.sql,
        duration: `${duration}ms`,
        params: params,
        rowCount,
        error: error?.message
      });
    }
  }

  /**
   * Obter estatísticas resumidas
   */
  getStats(): {
    totalTools: number;
    successRate: number;
    avgDuration: number;
    slowQueries: number;
    totalQueries: number;
    avgQueryTime: number;
  } {
    const totalTools = this.metrics.length;
    const successCount = this.metrics.filter((m) => m.success).length;
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const slowQueries = this.queryMetrics.filter(
      (q) => q.duration > this.slowQueryThreshold
    ).length;
    const totalQueryTime = this.queryMetrics.reduce((sum, q) => sum + q.duration, 0);

    return {
      totalTools,
      successRate: totalTools > 0 ? (successCount / totalTools) * 100 : 0,
      avgDuration: totalTools > 0 ? totalDuration / totalTools : 0,
      slowQueries,
      totalQueries: this.queryMetrics.length,
      avgQueryTime: this.queryMetrics.length > 0 ? totalQueryTime / this.queryMetrics.length : 0
    };
  }

  /**
   * Flush de métricas para arquivo
   */
  async flush(): Promise<void> {
    if (this.metrics.length === 0 && this.queryMetrics.length === 0) {
      return;
    }

    const stats = this.getStats();
    const data = {
      timestamp: new Date().toISOString(),
      stats,
      metrics: this.metrics,
      slowQueries: this.queryMetrics.filter((q) => q.duration > this.slowQueryThreshold)
    };

    try {
      // Append to file
      fs.appendFileSync(this.metricsFile, JSON.stringify(data) + '\n');

      logger.info('Performance Metrics Flushed', {
        toolCount: this.metrics.length,
        queryCount: this.queryMetrics.length,
        stats
      });

      // Limpar métricas após flush
      this.metrics = [];
      this.queryMetrics = [];
    } catch (error) {
      logger.error('Failed to flush metrics', { error });
    }
  }

  /**
   * Iniciar flush automático
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushInterval);
  }

  /**
   * Parar logger e fazer flush final
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

// Singleton instance
export const performanceLogger = new PerformanceLogger();

// Helper function para medir tempo de execução
export function measureExecution<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startTime = Date.now();

  return fn()
    .then((result) => {
      performanceLogger.logToolExecution(name, startTime, true);
      return result;
    })
    .catch((error) => {
      performanceLogger.logToolExecution(name, startTime, false, error.message);
      throw error;
    });
}

// Decorator para logging automático
export function LogPerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const startTime = Date.now();
    const toolName = `${target.constructor.name}.${propertyName}`;

    try {
      const result = await method.apply(this, args);
      performanceLogger.logToolExecution(toolName, startTime, true);
      return result;
    } catch (error) {
      performanceLogger.logToolExecution(toolName, startTime, false, error.message);
      throw error;
    }
  };
}
