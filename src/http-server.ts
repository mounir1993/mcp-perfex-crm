#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

import { MySQLClient } from './mysql-client.js';
import { getClientConfig } from './config/clients.js';
import { logger } from './utils/logger.js';
import { BaseTool } from './types/tools.js';

// Import ALL tool modules
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
import { staffTools } from './tools/core/staff.js';
import { leadsTools } from './tools/core/leads.js';
import { proposalsTools } from './tools/core/proposals.js';
import { invoicesTools } from './tools/core/invoices.js';
import { ticketsTools } from './tools/core/tickets.js';
import { knowledgeTools } from './tools/core/knowledge.js';
import { wikiTools } from './tools/core/wiki.js';
import { projectTemplatesTools } from './tools/core/project_templates.js';
import { filesTools } from './tools/core/files.js';

dotenv.config();

// Combine ALL working tools
const allTools: BaseTool[] = [
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
  ...staffTools,
  ...leadsTools,
  ...proposalsTools,
  ...invoicesTools,
  ...ticketsTools,
  ...knowledgeTools,
  ...wikiTools,
  ...projectTemplatesTools,
  ...filesTools,
];

class MCPHttpServer {
  private app: express.Application;
  private server: Server;
  private mysqlClient: MySQLClient;
  private tools: Map<string, BaseTool>;

  constructor() {
    this.app = express();
    this.server = new Server(
      {
        name: 'mcp-perfex-crm-http',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Setup middleware
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Initialize tools map
    this.tools = new Map();
    allTools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });

    this.setupRoutes();
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      const clientConfig = getClientConfig();
      const mysqlConfig = {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: clientConfig.database
      };
      
      this.mysqlClient = new MySQLClient(mysqlConfig);
      
      // Test the connection
      const isConnected = await this.mysqlClient.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to MySQL database');
      }
      
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        tools: this.tools.size
      });
    });

    // List available tools
    this.app.get('/api/tools', (req, res) => {
      const toolsList = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      
      res.json({
        success: true,
        data: toolsList,
        count: toolsList.length
      });
    });

    // Execute tool endpoint
    this.app.post('/api/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const { arguments: args } = req.body;

        const tool = this.tools.get(toolName);
        if (!tool) {
          return res.status(404).json({
            success: false,
            error: `Tool '${toolName}' not found`,
            availableTools: Array.from(this.tools.keys())
          });
        }

        logger.info(`🔧 Executing tool: ${toolName}`, { args });

        const result = await tool.handler(args || {}, this.mysqlClient);

        res.json({
          success: true,
          tool: toolName,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error(`❌ Tool execution failed: ${req.params.toolName}`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          tool: req.params.toolName
        });
      }
    });

    // Convenience endpoints for common operations
    
    // Customers endpoints
    this.app.get('/api/customers', async (req, res) => {
      await this.executeToolEndpoint('list_customers', req.query, res);
    });

    this.app.post('/api/customers', async (req, res) => {
      await this.executeToolEndpoint('create_customer', req.body, res);
    });

    this.app.get('/api/customers/:id', async (req, res) => {
      await this.executeToolEndpoint('get_customer', { customerId: req.params.id }, res);
    });

    // Invoices endpoints
    this.app.get('/api/invoices', async (req, res) => {
      await this.executeToolEndpoint('list_invoices', req.query, res);
    });

    this.app.post('/api/invoices', async (req, res) => {
      await this.executeToolEndpoint('create_invoice', req.body, res);
    });

    this.app.get('/api/invoices/:id', async (req, res) => {
      await this.executeToolEndpoint('get_invoice', { invoiceId: req.params.id }, res);
    });

    // Projects endpoints
    this.app.get('/api/projects', async (req, res) => {
      await this.executeToolEndpoint('list_projects', req.query, res);
    });

    this.app.post('/api/projects', async (req, res) => {
      await this.executeToolEndpoint('create_project', req.body, res);
    });

    // Tasks endpoints
    this.app.get('/api/tasks', async (req, res) => {
      await this.executeToolEndpoint('list_tasks', req.query, res);
    });

    this.app.post('/api/tasks', async (req, res) => {
      await this.executeToolEndpoint('create_task', req.body, res);
    });

    // Leads endpoints
    this.app.get('/api/leads', async (req, res) => {
      await this.executeToolEndpoint('list_leads', req.query, res);
    });

    this.app.post('/api/leads', async (req, res) => {
      await this.executeToolEndpoint('create_lead', req.body, res);
    });

    // Error handling middleware
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('❌ Unhandled error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /api/tools',
          'POST /api/tools/:toolName',
          'GET /api/customers',
          'POST /api/customers',
          'GET /api/invoices',
          'POST /api/invoices',
          'GET /api/projects',
          'POST /api/projects',
          'GET /api/tasks',
          'POST /api/tasks',
          'GET /api/leads',
          'POST /api/leads'
        ]
      });
    });
  }

  private async executeToolEndpoint(toolName: string, args: any, res: express.Response) {
    try {
      const tool = this.tools.get(toolName);
      if (!tool) {
        return res.status(404).json({
          success: false,
          error: `Tool '${toolName}' not found`
        });
      }

      const result = await tool.handler(args, this.mysqlClient);
      
      res.json({
        success: true,
        tool: toolName,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`❌ Tool execution failed: ${toolName}`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tool: toolName
      });
    }
  }

  public start(port: number = 3000) {
    this.app.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 MCP Perfex CRM HTTP Server running on port ${port}`);
      logger.info(`📊 Health check: http://localhost:${port}/health`);
      logger.info(`🛠️  API docs: http://localhost:${port}/api/tools`);
      logger.info(`🔧 Available tools: ${this.tools.size}`);
    });
  }
}

// Start the HTTP server
const port = parseInt(process.env.PORT || '3000', 10);
const httpServer = new MCPHttpServer();
httpServer.start(port);

export { MCPHttpServer };