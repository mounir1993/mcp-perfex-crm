import * as winston from 'winston';

// Configuração otimizada para MCP - mínimo de logs
const logLevel = process.env.LOG_LEVEL || 'error'; // DEFAULT: error only
const isProduction = process.env.NODE_ENV === 'production';
const isMCPMode = process.env.MCP_MODE !== 'false';

// Criar um logger noop (no operation) para produção MCP
class NoOpLogger {
  info() {}
  debug() {}
  warn() {}
  error(...args: any[]) {
    // Apenas erros críticos em produção
    if (args[0] && typeof args[0] === 'string' && args[0].includes('CRITICAL')) {
      console.error(JSON.stringify({ error: args[0], timestamp: new Date().toISOString() }));
    }
  }
  log() {}
}

// Se estiver em modo MCP production, usar logger silencioso
const shouldUseSilentLogger = isMCPMode && isProduction && process.env.DISABLE_ALL_LOGS === 'true';

export const logger = shouldUseSilentLogger
  ? (new NoOpLogger() as any)
  : winston.createLogger({
      level: logLevel,
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          silent: logLevel === 'none', // Permite desligar completamente
          stderrLevels: ['error'],
          format: winston.format.json()
        })
      ],
      exitOnError: false
    });

// Função otimizada de log de queries
export function logQuery(sql: string, params?: any[], duration?: number, _clientId?: string): void {
  // DESABILITADO em produção para economizar contexto
  if (process.env.ENABLE_AUDIT_LOG === 'true' && !isProduction) {
    logger.debug('SQL Query', {
      sql: sql.substring(0, 50), // Reduzir tamanho
      duration
    });
  }
}

// Helpers para controle fino
export const loggers = {
  performance: process.env.DISABLE_PERFORMANCE_LOGS === 'true' ? new NoOpLogger() : logger,
  debug: process.env.DISABLE_DEBUG_LOGS === 'true' ? new NoOpLogger() : logger,
  connection: process.env.DISABLE_CONNECTION_LOGS === 'true' ? new NoOpLogger() : logger,
  error: logger // Sempre manter logs de erro
};
