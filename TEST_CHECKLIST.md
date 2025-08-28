# ✅ CHECKLIST DE TESTES - MCP DESK CRM SQL

## 🎯 Objetivo
Validar que todas as correções aplicadas estão funcionando corretamente.

## 📋 TESTES POR MÓDULO

### 1. CUSTOMERS ✅
- [ ] `get_customers` - Listar clientes
- [ ] `create_customer` - Criar novo cliente
- [ ] `update_customer` - Atualizar cliente
- [ ] `delete_customer` - Deletar cliente
- [ ] `customer_analytics` - Analytics de clientes

### 2. PROJECTS ✅
- [ ] `get_projects` - Listar projetos
- [ ] `create_project` - Criar projeto
- [ ] `update_project` - Atualizar projeto
- [ ] `get_project_tasks` - Tarefas do projeto
- [ ] `project_profitability` - Rentabilidade

### 3. TASKS ✅
- [ ] `get_tasks` - Listar tarefas (sem tags)
- [ ] `create_task` - Criar tarefa (sem tags)
- [ ] `update_task` - Atualizar tarefa
- [ ] `assign_task_to_staff` - Atribuir tarefa
- [ ] `bulk_update_tasks` - Atualização em massa

### 4. PAYMENTS ✅
- [ ] `get_payments` - Listar pagamentos
- [ ] `record_payment` - Registrar pagamento
- [ ] `update_payment` - Atualizar pagamento
- [ ] `delete_payment` - Deletar pagamento
- [ ] `payment_analytics` - Analytics

### 5. ESTIMATES ✅
- [ ] `get_estimates` - Listar orçamentos (sem estimate_id)
- [ ] `create_estimate` - Criar orçamento
- [ ] `convert_estimate_to_invoice` - Conversão
- [ ] `estimate_analytics` - Analytics

### 6. EXPENSES ✅
- [ ] `get_expenses` - Listar despesas
- [ ] `create_expense` - Criar despesa (reference vazio)
- [ ] `update_expense` - Atualizar despesa
- [ ] `expense_analytics` - Analytics

### 7. SUBSCRIPTIONS ✅
- [ ] `get_subscriptions` - Listar (sem tax)
- [ ] `create_subscription` - Criar (sem tax)
- [ ] `cancel_subscription` - Cancelar
- [ ] `subscription_analytics` - Analytics

### 8. CONTRACTS ✅
- [ ] `get_contracts` - Listar contratos
- [ ] `create_contract` - Criar contrato
- [ ] `update_contract` - Atualizar
- [ ] `contract_analytics` - Analytics

### 9. FINANCIAL REPORTS ✅
- [ ] `revenue_report` - Relatório receitas
- [ ] `expense_report` - Relatório despesas
- [ ] `profit_loss_report` - P&L
- [ ] `cash_flow_report` - Fluxo de caixa
- [ ] `tax_report` - Relatório impostos

### 10. TIMESHEETS (Simplificado) ✅
- [ ] `get_timesheets` - Listar (sem billable/billed)
- [ ] `start_timer` - Iniciar timer
- [ ] `stop_timer` - Parar timer
- [ ] `add_timesheet_entry` - Entrada manual
- [ ] `timesheet_summary` - Resumo

## 🔍 TESTES CRÍTICOS

### Decimais e Somas
```sql
-- Verificar se valores decimais somam corretamente
SELECT SUM(amount) FROM tblpayments WHERE DATE(date) = CURDATE();
-- Deve retornar soma numérica, não concatenação
```

### InsertId
```javascript
// Testar se create retorna ID correto
const result = await create_customer({...});
console.log(result.customer_id); // Deve ser número
```

### Campos Removidos
```javascript
// Tasks sem tags
await create_task({
  name: "Test Task",
  rel_type: "project",
  rel_id: 123
  // SEM tags
});

// Subscriptions sem tax
await create_subscription({
  name: "Test Sub",
  clientid: 123
  // SEM tax
});
```

## 📊 RESULTADOS ESPERADOS

### Taxa de Sucesso por Módulo:
| Módulo | Esperado | Observações |
|--------|----------|-------------|
| Customers | 95%+ | Totalmente funcional |
| Projects | 90%+ | Totalmente funcional |
| Tasks | 85%+ | Sem tags |
| Payments | 95%+ | Totalmente funcional |
| Estimates | 85%+ | Sem estimate_id |
| Expenses | 90%+ | Reference vazio |
| Subscriptions | 85%+ | Sem tax |
| Contracts | 90%+ | Totalmente funcional |
| Financial | 100% | Totalmente funcional |
| Timesheets | 70%+ | Versão simplificada |

### Taxa Global: 85-90% ✅

## 🚨 PONTOS DE ATENÇÃO

1. **Timesheets**: Versão simplificada sem billable/billed/project_id
2. **Tasks**: Campo tags removido
3. **Subscriptions**: Campo tax removido
4. **Estimates**: Usar id ao invés de estimate_id
5. **Expenses**: Campo reference usa default vazio

## 🎯 CRITÉRIOS DE SUCESSO

- [x] Sistema compila sem erros
- [x] Conexão MySQL funciona
- [x] Ferramentas listadas corretamente
- [ ] CRUD básico funciona em todos módulos
- [ ] Relatórios retornam dados
- [ ] Sem erros de "Unknown column"
- [ ] Valores decimais somam corretamente

## 📝 COMANDO DE TESTE

```bash
# Após compilar
npm run build

# Testar com Claude
claude code test mcp-desk-crm-sql

# Verificar logs
tail -f logs/mcp-*.log
```

---

**Data**: 27 de Julho de 2025
**Versão**: 1.0.0-clean
**Status**: Pronto para testes