import { logger } from './logger.js';
import * as util from 'util';

export enum DebugLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface DebugContext {
  tool?: string;
  user?: string;
  client?: string;
  requestId?: string;
  [key: string]: any;
}

class DebugLogger {
  private context: DebugContext = {};
  private readonly enabled: boolean;
  private readonly verboseMode: boolean;

  constructor() {
    this.enabled = process.env.DEBUG_MODE === 'true';
    this.verboseMode = process.env.VERBOSE_DEBUG === 'true';
  }

  /**
   * Set context for all subsequent logs
   */
  setContext(context: DebugContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Log with context
   */
  private log(level: DebugLevel, message: string, data?: any): void {
    if (!this.enabled && level !== DebugLevel.ERROR) {
      return;
    }

    const logData = {
      ...this.context,
      message,
      data: this.verboseMode ? data : this.sanitizeData(data),
      timestamp: new Date().toISOString()
    };

    switch (level) {
      case DebugLevel.TRACE:
        if (this.verboseMode) logger.debug('[TRACE]', logData);
        break;
      case DebugLevel.DEBUG:
        logger.debug(message, logData);
        break;
      case DebugLevel.INFO:
        logger.info(message, logData);
        break;
      case DebugLevel.WARN:
        logger.warn(message, logData);
        break;
      case DebugLevel.ERROR:
        logger.error(message, logData);
        break;
    }
  }

  /**
   * Sanitize sensitive data
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized = JSON.parse(JSON.stringify(data));

    const sanitizeObject = (obj: any) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        } else if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
          obj[key] = '***REDACTED***';
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * Trace level - very detailed
   */
  trace(message: string, data?: any): void {
    this.log(DebugLevel.TRACE, message, data);
  }

  /**
   * Debug level - detailed information
   */
  debug(message: string, data?: any): void {
    this.log(DebugLevel.DEBUG, message, data);
  }

  /**
   * Info level - general information
   */
  info(message: string, data?: any): void {
    this.log(DebugLevel.INFO, message, data);
  }

  /**
   * Warning level - potential issues
   */
  warn(message: string, data?: any): void {
    this.log(DebugLevel.WARN, message, data);
  }

  /**
   * Error level - errors and exceptions
   */
  error(message: string, error?: Error | any, data?: any): void {
    const errorData = {
      ...data,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name
            }
          : error
    };
    this.log(DebugLevel.ERROR, message, errorData);
  }

  /**
   * Log function entry
   */
  enter(functionName: string, args?: any): void {
    this.trace(`➡️ Entering ${functionName}`, { args });
  }

  /**
   * Log function exit
   */
  exit(functionName: string, result?: any): void {
    this.trace(`⬅️ Exiting ${functionName}`, { result });
  }

  /**
   * Log SQL query
   */
  sql(query: string, params?: any[], result?: any): void {
    this.debug('🔍 SQL Query', {
      query: query.substring(0, 1000),
      params: this.verboseMode ? params : params?.length,
      resultCount: Array.isArray(result) ? result.length : undefined
    });
  }

  /**
   * Log API request
   */
  request(method: string, endpoint: string, data?: any): void {
    this.debug(`📡 ${method} ${endpoint}`, { data });
  }

  /**
   * Log API response
   */
  response(statusCode: number, data?: any, duration?: number): void {
    this.debug(`📨 Response ${statusCode}`, {
      duration: duration ? `${duration}ms` : undefined,
      data: this.verboseMode ? data : { size: JSON.stringify(data).length }
    });
  }

  /**
   * Pretty print object
   */
  dump(label: string, obj: any): void {
    if (!this.enabled) return;

    console.log(`\n========== ${label} ==========`);
    console.log(
      util.inspect(obj, {
        showHidden: false,
        depth: null,
        colors: true,
        maxArrayLength: null
      })
    );
    console.log(`========== /${label} ==========\n`);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: DebugContext): DebugLogger {
    const child = new DebugLogger();
    child.context = { ...this.context, ...context };
    return child;
  }

  /**
   * Measure and log execution time
   */
  async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.trace(`⏱️ Starting ${label}`);

    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.debug(`✅ Completed ${label}`, { duration: `${duration}ms` });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`❌ Failed ${label}`, error, { duration: `${duration}ms` });
      throw error;
    }
  }
}

// Singleton instance
export const debugLog = new DebugLogger();

// Convenience functions
export const trace = (msg: string, data?: any) => debugLog.trace(msg, data);
export const debug = (msg: string, data?: any) => debugLog.debug(msg, data);
export const info = (msg: string, data?: any) => debugLog.info(msg, data);
export const warn = (msg: string, data?: any) => debugLog.warn(msg, data);
export const error = (msg: string, err?: any, data?: any) => debugLog.error(msg, err, data);
