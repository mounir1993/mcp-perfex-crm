# 📚 GUIA DO UTILIZADOR - MCP DESK CRM SQL

## 🚀 Início Rápido

### Pré-requisitos
- MySQL/MariaDB instalado e configurado
- Node.js 18+ instalado
- Base de dados Perfex CRM

### Instalação
```bash
# 1. Clonar o repositório
git clone [repo-url]
cd mcp-desk-crm-sql

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais MySQL

# 4. Compilar o projeto
npm run build

# 5. Testar conexão
npm run test
```

## 🛠️ FERRAMENTAS DISPONÍVEIS

### 📊 CLIENTES (Customers)
```yaml
get_customers:
  descrição: Listar clientes com filtros
  parâmetros:
    - search: termo de busca
    - active: true/false
    - limit: número de resultados
    
create_customer:
  descrição: Criar novo cliente
  parâmetros obrigatórios:
    - company: nome da empresa
    - email: email principal
    
update_customer:
  descrição: Atualizar dados do cliente
  parâmetros:
    - customer_id: ID do cliente
    - campos a atualizar...
```

### 💼 PROJETOS (Projects)
```yaml
get_projects:
  descrição: Listar projetos
  parâmetros:
    - status: open/completed/cancelled
    - customer_id: filtrar por cliente
    
create_project:
  descrição: Criar novo projeto
  parâmetros obrigatórios:
    - name: nome do projeto
    - clientid: ID do cliente
    - billing_type: fixed_rate/project_hours/task_hours
```

### ✅ TAREFAS (Tasks)
```yaml
get_tasks:
  descrição: Listar tarefas
  parâmetros:
    - project_id: filtrar por projeto
    - status: 1-5 (Not Started até Complete)
    
create_task:
  descrição: Criar nova tarefa
  parâmetros obrigatórios:
    - name: nome da tarefa
    - rel_type: project
    - rel_id: ID do projeto
    
assign_task_to_staff:
  descrição: Atribuir tarefa a funcionário
  parâmetros:
    - task_id: ID da tarefa
    - staff_id: ID do funcionário
```

### 💰 PAGAMENTOS (Payments)
```yaml
record_payment:
  descrição: Registrar pagamento
  parâmetros obrigatórios:
    - invoiceid: ID da fatura
    - amount: valor pago
    - paymentmethod: método de pagamento
    
get_payments:
  descrição: Listar pagamentos
  parâmetros:
    - customer_id: filtrar por cliente
    - date_from/date_to: período
```

### 📄 ORÇAMENTOS (Estimates)
```yaml
create_estimate:
  descrição: Criar orçamento
  parâmetros obrigatórios:
    - clientid: ID do cliente
    - items: array de itens
    
convert_estimate_to_invoice:
  descrição: Converter orçamento em fatura
  parâmetros:
    - estimate_id: ID do orçamento
```

### 📊 RELATÓRIOS FINANCEIROS
```yaml
revenue_report:
  descrição: Relatório de receitas
  parâmetros:
    - period: month/quarter/year/custom
    - date_from/date_to: para período custom
    
expense_report:
  descrição: Relatório de despesas
  parâmetros:
    - category_id: filtrar por categoria
    - period: período de análise
    
cash_flow_report:
  descrição: Fluxo de caixa
  parâmetros:
    - period: período de análise
```

### ⏱️ TIMESHEETS (Simplificado)
```yaml
start_timer:
  descrição: Iniciar cronômetro
  parâmetros:
    - task_id: ID da tarefa
    - staff_id: ID do funcionário
    
stop_timer:
  descrição: Parar cronômetro
  parâmetros:
    - timer_id: ID do timer
    
get_timesheets:
  descrição: Listar registros de tempo
  parâmetros:
    - staff_id: filtrar por funcionário
    - date_from/date_to: período
```

## 💡 EXEMPLOS DE USO

### Exemplo 1: Criar Cliente e Projeto
```json
// 1. Criar cliente
{
  "tool": "create_customer",
  "arguments": {
    "company": "Empresa ABC",
    "email": "contato@empresaabc.com",
    "phonenumber": "+351 123 456 789",
    "address": "Rua Principal, 123"
  }
}

// 2. Criar projeto para o cliente
{
  "tool": "create_project",
  "arguments": {
    "name": "Website Redesign",
    "clientid": 123, // ID retornado do passo anterior
    "billing_type": "fixed_rate",
    "project_cost": 5000,
    "description": "Redesign completo do website"
  }
}
```

### Exemplo 2: Gestão de Tarefas
```json
// 1. Criar tarefa
{
  "tool": "create_task",
  "arguments": {
    "name": "Design Homepage",
    "rel_type": "project",
    "rel_id": 456,
    "priority": 3,
    "startdate": "2025-07-28",
    "duedate": "2025-08-05"
  }
}

// 2. Atribuir a funcionário
{
  "tool": "assign_task_to_staff",
  "arguments": {
    "task_id": 789,
    "staff_id": 10
  }
}
```

### Exemplo 3: Relatórios Financeiros
```json
// Receitas do mês atual
{
  "tool": "revenue_report",
  "arguments": {
    "period": "month"
  }
}

// Fluxo de caixa trimestral
{
  "tool": "cash_flow_report",
  "arguments": {
    "period": "quarter"
  }
}
```

## ⚠️ LIMITAÇÕES CONHECIDAS

### Timesheets
- Versão simplificada sem campos `billable` e `billed`
- Sem integração automática com faturação
- Use para registro básico de tempo

### Tasks
- Campo `tags` não disponível
- Use description para notas adicionais

### Subscriptions
- Campo `tax` não disponível
- Configure impostos externamente

## 🔧 TROUBLESHOOTING

### Erro: "Unknown column"
- O sistema foi adaptado para a estrutura existente da BD
- Alguns campos foram removidos das queries
- Consulte LIMITAÇÕES_CONHECIDAS.md

### Erro: "Connection refused"
- Verifique credenciais MySQL no .env
- Confirme que MySQL está rodando
- Teste conexão: `mysql -u user -p database`

### Erro: "Tool not found"
- Use `list_tools` para ver ferramentas disponíveis
- Verifique o nome exato da ferramenta
- Algumas ferramentas foram removidas (dependencies, etc)

## 📞 SUPORTE

Para questões ou problemas:
1. Consulte LIMITAÇÕES_CONHECIDAS.md
2. Verifique logs em logs/
3. Teste conexão MySQL
4. Confirme versão do Node.js

---

**Versão**: 1.0.0-clean
**Última atualização**: 27 de Julho de 2025