# 📊 Sistema de Logging e Monitoramento

## Visão Geral

O MCP Desk CRM SQL agora possui um sistema completo de logging, debugging e monitoramento de performance para ajudar a identificar problemas e otimizar o desempenho.

## 🔧 Componentes

### 1. **Logger Básico** (`src/utils/logger.ts`)
- Logs estruturados com Winston
- Níveis: error, warn, info, debug
- Output para console e arquivo
- Colorização no console

### 2. **Performance Logger** (`src/utils/performance-logger.ts`)
- Métricas de execução de ferramentas
- Tracking de queries lentas
- Estatísticas agregadas
- Flush automático para arquivo

### 3. **Debug Logger** (`src/utils/debug-logger.ts`)
- Debugging detalhado
- Sanitização de dados sensíveis
- Context tracking
- Pretty printing

### 4. **Log Viewer** (`tools/log-viewer.js`)
- Visualização de logs em tempo real
- Análise de métricas
- Identificação de queries lentas
- Padrões de uso

## 📝 Configuração

### Básica (.env)
```env
# Nível de log
LOG_LEVEL=info

# Arquivo de log
LOG_FILE=logs/mcp-desk-crm-sql.log

# Audit log de queries SQL
ENABLE_AUDIT_LOG=true
```

### Avançada (.env.logging)
```env
# Performance
LOG_PERFORMANCE=true
METRICS_FILE=logs/performance-metrics.json
SLOW_QUERY_MS=1000

# Debug
DEBUG_MODE=true
VERBOSE_DEBUG=false
DEBUG_SQL=true
```

## 🎯 Uso

### 1. Ativar Logging Completo

```bash
# Copie as configurações de logging
cat .env.logging >> .env

# Execute com logging ativo
node demo.js
```

### 2. Monitorar em Tempo Real

```bash
# Acompanhar logs
node tools/log-viewer.js tail

# Ver métricas
node tools/log-viewer.js metrics

# Queries lentas
node tools/log-viewer.js slow-queries

# Análise de performance
node tools/log-viewer.js performance
```

### 3. Debug Específico

```javascript
// No código
import { debugLog } from './utils/debug-logger.js';

// Definir contexto
debugLog.setContext({ 
  tool: 'get_customers',
  user: 'user123'
});

// Logs com contexto
debugLog.enter('getCustomers', { limit: 10 });
debugLog.sql(query, params);
debugLog.exit('getCustomers', result);

// Medir performance
const result = await debugLog.measure('Database Query', async () => {
  return await mysqlClient.query(sql);
});
```

## 📊 Métricas Coletadas

### Por Ferramenta
- Nome da ferramenta
- Tempo de execução
- Taxa de sucesso
- Erros encontrados
- Tamanho entrada/saída
- Número de queries

### Por Query SQL
- SQL executado
- Parâmetros (opcional)
- Tempo de execução
- Número de linhas retornadas
- Erros

### Estatísticas Agregadas
- Total de execuções
- Taxa de sucesso global
- Tempo médio de resposta
- Queries lentas identificadas
- Padrões de uso por hora

## 🚨 Alertas e Monitoramento

### Queries Lentas
Automaticamente logadas quando excedem o threshold:
```
SLOW_QUERY_MS=1000 # 1 segundo
```

### Execuções Lentas
Ferramentas que demoram mais de 5 segundos geram warning.

### Taxa de Erro
Monitorada continuamente nas métricas.

## 📈 Dashboards

### Terminal Dashboard
```bash
# Dashboard interativo (em desenvolvimento)
node tools/dashboard.js
```

### Exemplo de Output

```
📊 MCP Desk CRM SQL - Performance Dashboard
==========================================

⚡ Performance (últimas 24h)
  • Execuções: 1,234
  • Taxa sucesso: 98.5%
  • Tempo médio: 145ms
  • Queries lentas: 12

🔧 Top Ferramentas
  1. get_customers: 234 calls, 99.1% success, 89ms avg
  2. get_projects: 189 calls, 97.8% success, 156ms avg
  3. financial_kpi_dashboard: 45 calls, 100% success, 823ms avg

🐌 Queries Mais Lentas
  1. 2,345ms - SELECT * FROM tblprojects WHERE ...
  2. 1,890ms - SELECT SUM(total) FROM tblinvoices ...
  3. 1,234ms - SELECT COUNT(*) FROM tbltasks ...

📅 Padrão de Uso
  08h: ████████ 89 calls
  09h: ████████████████ 156 calls
  10h: ████████████ 123 calls
```

## 🔍 Troubleshooting com Logs

### Identificar Problema de Performance

```bash
# Ver todas as queries lentas
node tools/log-viewer.js slow-queries --threshold 500

# Filtrar logs por ferramenta
grep "get_customers" logs/mcp-desk-crm-sql.log | jq .
```

### Debug de Erro Específico

```bash
# Ativar debug verbose
VERBOSE_DEBUG=true DEBUG_SQL=true node interactive-test.js

# Ver stack trace completo
grep -A10 "error" logs/mcp-desk-crm-sql.log
```

### Análise de Padrões

```bash
# Horários de pico
node tools/log-viewer.js performance

# Taxa de erro por ferramenta
jq -r '.tool + ": " + (.success|tostring)' logs/performance-metrics.json | sort | uniq -c
```

## 🛡️ Segurança dos Logs

- Dados sensíveis são automaticamente mascarados
- Passwords nunca são logados
- Parâmetros SQL opcionais (LOG_QUERY_PARAMS)
- Logs podem ser enviados para sistemas externos

## 🚀 Próximos Passos

1. **Integração com Grafana/Prometheus**
2. **Alertas via Slack/Discord**
3. **Dashboard web interativo**
4. **Trace distribuído**
5. **APM (Application Performance Monitoring)**

---

Com este sistema de logging, você tem visibilidade completa sobre o desempenho e comportamento do MCP Desk CRM SQL!