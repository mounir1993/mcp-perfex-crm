#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

import { MySQLClient } from './mysql-client.js';
import { getClientConfig } from './config/clients.js';
// Use optimized logger to avoid exhausting Claude context
import { logger } from './utils/logger.js';
import { BaseTool } from './types/tools.js';

// Import ALL confirmed working modules
import { customersTools } from './tools/core/customers.js';
import { estimatesTools } from './tools/core/estimates.js';
import { projectsTools } from './tools/core/projects.js';
import { tasksTools } from './tools/core/tasks.js';
import { paymentsTools } from './tools/core/payments.js';
import { expensesTools } from './tools/core/expenses.js';
import { contractsTools } from './tools/core/contracts.js';
import { subscriptionsTools } from './tools/core/subscriptions.js';
import { creditNotesTools } from './tools/core/credit_notes.js';
import { financialReportingTools } from './tools/core/financial_reporting.js';
import { timesheetsTools } from './tools/core/timesheets-simplified.js';
import { timesheetsFullTools } from './tools/core/timesheets-full.js';
import { taskAssignmentsAdvancedTools } from './tools/core/task-assignments-advanced.js';
import { resourceManagementTools } from './tools/core/resource_management.js';

// NEWLY ACTIVATED CRITICAL MODULES
import { staffTools } from './tools/core/staff.js';
import { leadsTools } from './tools/core/leads.js';
import { proposalsTools } from './tools/core/proposals.js';
import { invoicesTools } from './tools/core/invoices.js';
import { ticketsTools } from './tools/core/tickets.js';

// KNOWLEDGE MANAGEMENT MODULES
import { knowledgeTools } from './tools/core/knowledge.js';
import { wikiTools } from './tools/core/wiki.js';

// CONTENT MANAGEMENT MODULES
import { projectTemplatesTools } from './tools/core/project_templates.js';
import { filesTools } from './tools/core/files.js';

dotenv.config();

// Combine ALL working tools - COMPLETE SYSTEM
const allTools: BaseTool[] = [
  // CORE CRM MODULES
  ...customersTools,
  ...estimatesTools,
  ...projectsTools,
  ...tasksTools,
  ...paymentsTools,
  ...expensesTools,
  ...contractsTools,
  ...subscriptionsTools,
  ...creditNotesTools,
  ...financialReportingTools,
  ...timesheetsTools,
  ...timesheetsFullTools,
  ...taskAssignmentsAdvancedTools,
  ...resourceManagementTools,

  // CRITICAL BUSINESS MODULES - NOW ACTIVE
  ...staffTools, // Team management
  ...leadsTools, // Lead management
  ...proposalsTools, // Proposal system
  ...invoicesTools, // Invoicing system
  ...ticketsTools, // Support ticketing

  // KNOWLEDGE MANAGEMENT MODULES - NEW
  ...knowledgeTools, // Knowledge base system
  ...wikiTools, // Wiki system

  // CONTENT MANAGEMENT MODULES - NEW
  ...projectTemplatesTools, // Project templates system
  ...filesTools // File management system
];

async function main() {
  const clientId = process.env.CLIENT_ID || 'default';
  const clientConfig = getClientConfig(clientId);

  // Configuração do cliente MySQL
  const mysqlClient = new MySQLClient(
    {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: clientConfig.database
    },
    clientId
  );

  // Initialize MCP server
  const server = new Server({
    name: 'mcp-perfex-crm',
    version: '1.0.0-stable'
  });

  // IMPORTANTE: Definir capabilities diretamente
  (server as any)._capabilities = {
    tools: {}
  };

  // Test MySQL connection first
  const isConnected = await mysqlClient.testConnection();
  if (!isConnected) {
    throw new Error('Failed to connect to MySQL database');
  }

  // Conectar transport ANTES de registrar handlers
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // NOW register the handlers
  // Register tool list (modular)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  // Handler for tool calls (modular)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Find the tool handler
    const tool = allTools.find((t) => t.name === name);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool '${name}' not found`
          }
        ]
      };
    }

    try {
      return await tool.handler(args as Record<string, unknown>, mysqlClient);
    } catch (error) {
      logger.error(`Error in tool ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error in tool ${name}: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  });
  // Minimal logs to avoid exhausting Claude context
  if (process.env.LOG_LEVEL !== 'error' && process.env.LOG_LEVEL !== 'none') {
    logger.info('MCP Server started');
  }

  // Success log only in debug mode
  logger.debug('MCP Perfex CRM Server running', {
    clientId,
    database: clientConfig.database,
    totalTools: allTools.length,
    toolsByModule: {
      customers: customersTools.length,
      estimates: estimatesTools.length,
      projects: projectsTools.length,
      tasks: tasksTools.length,
      payments: paymentsTools.length,
      expenses: expensesTools.length,
      contracts: contractsTools.length,
      subscriptions: subscriptionsTools.length,
      credit_notes: creditNotesTools.length,
      financial_reporting: financialReportingTools.length,
      timesheets: timesheetsTools.length,
      timesheets_full: timesheetsFullTools.length,
      task_assignments_advanced: taskAssignmentsAdvancedTools.length,
      resource_management: resourceManagementTools.length,

      // NEWLY ACTIVATED CRITICAL MODULES
      staff: staffTools.length,
      leads: leadsTools.length,
      proposals: proposalsTools.length,
      invoices: invoicesTools.length,
      tickets: ticketsTools.length,

      // KNOWLEDGE MANAGEMENT MODULES
      knowledge: knowledgeTools.length,
      wiki: wikiTools.length,

      // CONTENT MANAGEMENT MODULES
      project_templates: projectTemplatesTools.length,
      files: filesTools.length
    }
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
