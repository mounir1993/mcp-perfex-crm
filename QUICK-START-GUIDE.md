# 🚀 Guia Rápido - Como Experimentar na Prática

## 1. 🛠️ Instalação Rápida

### Pré-requisitos
- Node.js 18+
- MySQL/MariaDB com banco Perfex CRM
- Claude Desktop ou outro cliente MCP

### Passos

```bash
# 1. Clone o projeto
git clone https://github.com/YOUR_USERNAME/mcp-desk-crm-sql.git
cd mcp-desk-crm-sql

# 2. Instale dependências
npm install

# 3. Configure o banco
cp .env.example .env

# 4. Edite .env com suas credenciais MySQL
nano .env
```

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=perfex_user
MYSQL_PASSWORD=sua_senha
MYSQL_DATABASE=perfex_crm
```

```bash
# 5. Compile o projeto
npm run build

# 6. Teste a conexão
npm run start
```

## 2. 🔧 Configuração no Claude Desktop

### macOS
```bash
# Edite o arquivo de configuração
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Windows
```bash
# Edite em:
# %APPDATA%\Claude\claude_desktop_config.json
```

### Linux
```bash
nano ~/.config/Claude/claude_desktop_config.json
```

### Adicione a configuração:

```json
{
  "mcpServers": {
    "mcp-desk-crm-sql": {
      "command": "node",
      "args": ["/caminho/completo/para/mcp-desk-crm-sql/dist/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "perfex_readonly",
        "MYSQL_PASSWORD": "sua_senha",
        "MYSQL_DATABASE": "perfex_crm"
      }
    }
  }
}
```

## 3. 🎯 Experimentos Práticos

### Teste 1: Listar Clientes

No Claude, digite:
```
Use a ferramenta get_customers do servidor mcp-desk-crm-sql para listar 5 clientes ativos
```

Ou diretamente:
```javascript
// Resultado esperado
{
  "customers": [
    {
      "userid": 1,
      "company": "Empresa ABC",
      "city": "São Paulo",
      "active": 1
    }
    // ... mais clientes
  ],
  "pagination": {
    "limit": 5,
    "offset": 0,
    "count": 5
  }
}
```

### Teste 2: Buscar Cliente Específico

```
Use get_customer com client_id 1 para ver detalhes completos
```

### Teste 3: Analytics Financeiro

```
Use financial_kpi_dashboard para ver KPIs do último mês
```

### Teste 4: Criar uma Tarefa

```
Use create_task para criar uma tarefa "Revisar proposta" com prioridade alta
```

## 4. 💻 Teste Local (Sem Claude)

### Crie um script de teste:

```javascript
// test-local.js
import { MySQLClient } from './dist/mysql-client.js';
import { customersTools } from './dist/tools/core/customers.js';

const client = new MySQLClient({
  host: 'localhost',
  port: 3306,
  user: 'perfex_user',
  password: 'senha',
  database: 'perfex_crm'
});

// Teste get_customers
const getCustomersTool = customersTools.find(t => t.name === 'get_customers');
const result = await getCustomersTool.handler({ limit: 5 }, client);
console.log(JSON.parse(result.content[0].text));

await client.close();
```

Execute:
```bash
node test-local.js
```

## 5. 🧪 Exemplos Práticos por Módulo

### Clientes
```javascript
// Buscar clientes de São Paulo
{
  "tool": "search_customers",
  "arguments": {
    "query": "São Paulo",
    "fields": ["city"]
  }
}

// Analytics de um cliente
{
  "tool": "customer_analytics",
  "arguments": {
    "client_id": 123,
    "period": "year"
  }
}
```

### Projetos
```javascript
// Criar novo projeto
{
  "tool": "create_project",
  "arguments": {
    "name": "Website Redesign",
    "client_id": 123,
    "billing_type": "fixed_rate",
    "project_cost": 5000,
    "start_date": "2025-08-01"
  }
}

// Ver atividades do projeto
{
  "tool": "get_project_activities",
  "arguments": {
    "project_id": 1,
    "limit": 10
  }
}
```

### Financeiro
```javascript
// Relatório de fluxo de caixa
{
  "tool": "cash_flow_statement",
  "arguments": {
    "period": "month"
  }
}

// Análise de despesas
{
  "tool": "expense_analysis",
  "arguments": {
    "group_by": "category",
    "period": "quarter"
  }
}
```

### Tarefas com Timer
```javascript
// Iniciar timer em uma tarefa
{
  "tool": "start_task_timer",
  "arguments": {
    "task_id": 45,
    "staff_id": 1
  }
}

// Parar timer
{
  "tool": "stop_task_timer",
  "arguments": {
    "task_id": 45,
    "staff_id": 1
  }
}
```

## 6. 🔍 Debugging

### Verificar logs
```bash
# Os logs aparecem no console
tail -f ~/.claude/logs/mcp.log  # Se configurado
```

### Testar conexão MySQL
```bash
mysql -h localhost -u perfex_user -p perfex_crm -e "SELECT 1"
```

### Verificar ferramentas disponíveis
No Claude:
```
Liste todas as ferramentas disponíveis no servidor mcp-desk-crm-sql
```

## 7. 📊 Casos de Uso Reais

### Dashboard Executivo
```
1. Use financial_kpi_dashboard para KPIs gerais
2. Use customer_analytics para top 10 clientes
3. Use project_analytics para projetos em andamento
4. Use task_analytics para produtividade da equipe
```

### Relatório Mensal
```
1. Use profit_loss_statement para DRE do mês
2. Use expense_analysis agrupado por categoria
3. Use payment_analytics para recebimentos
4. Use timesheet_summary para horas trabalhadas
```

### Gestão de Projeto
```
1. Use get_project para status atual
2. Use get_project_milestones para marcos
3. Use get_project_time_tracking para tempo gasto
4. Use get_project_expenses para custos
```

## 8. 🚨 Troubleshooting Comum

### Erro: "Ferramenta não encontrada"
- Verifique se o servidor está rodando
- Reinicie o Claude Desktop
- Confirme a configuração em claude_desktop_config.json

### Erro: "Connection refused"
- Verifique credenciais MySQL
- Confirme que MySQL está rodando
- Teste conexão com mysql CLI

### Erro: "No data returned"
- Verifique se há dados no banco
- Confirme os IDs usados existem
- Use filtros menos restritivos

## 9. 🎉 Próximos Passos

1. **Explore todas as ferramentas** - Use TOOLS-INVENTORY.md
2. **Crie workflows** - Combine múltiplas ferramentas
3. **Automatize tarefas** - Scripts para operações repetitivas
4. **Contribua** - Adicione novas ferramentas!

---

**Dica**: Comece com operações de leitura (get_*) antes de criar/atualizar dados!