import * as winston from 'winston';

// Otimizado para MCP - reduzir logs para não esgotar contexto
const logLevel = process.env.LOG_LEVEL || 'error';
const logFile = process.env.LOG_FILE || 'logs/mcp-perfex-crm.log';

const format = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [];

// Para MCP, enviar logs para stderr sem cores
if (process.env.MCP_MODE !== 'false') {
  transports.push(
    new winston.transports.Console({
      stderrLevels: ['error', 'warn', 'info', 'debug'],
      format: winston.format.json() // Sem cores, JSON puro
    })
  );
} else {
  // Para desenvolvimento local, manter cores
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    })
  );
}

// Adicionar log para arquivo se especificado
if (logFile) {
  transports.push(
    new winston.transports.File({
      filename: logFile,
      format
    })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  format,
  transports,
  exitOnError: false
});

// Log queries SQL para auditoria (se habilitado) - OTIMIZADO
export function logQuery(sql: string, params?: any[], duration?: number, _clientId?: string): void {
  // DESABILITADO por padrão para economizar contexto do Claude
  if (process.env.ENABLE_AUDIT_LOG === 'true' && process.env.NODE_ENV !== 'production') {
    logger.debug('SQL', {
      sql: sql.substring(0, 50), // Reduzido de 200 para 50
      duration
    });
  }
}
