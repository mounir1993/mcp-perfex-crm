#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import * as dotenv from 'dotenv';

import { MySQLClient } from './mysql-client.js';
import { getClientConfig } from './config/clients.js';
import { logger } from './utils/logger.js';
import { BaseTool } from './types/tools.js';
import { SecurityManager, authenticateToken, getCorsOptions } from './utils/security-simple.js';

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

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Security Manager
const securityManager = new SecurityManager();
securityManager.initialize();

// Global security middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
app.use(cors(getCorsOptions()));

// Rate limiting for API protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Initialize MySQL client
let mysqlClient: MySQLClient | null = null;

async function initializeDatabase() {
  try {
    const clientConfig = getClientConfig(process.env.CLIENT_ID || 'default');
    mysqlClient = new MySQLClient(clientConfig.mysql);
    await mysqlClient.connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

// Collect all tools
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
  ...filesTools
];

// Public endpoints (no authentication required)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/generate-token', (req, res) => {
  try {
    const token = securityManager.generateAPIToken();
    logger.info('API token generated', { ip: req.ip });
    res.json({ 
      token,
      message: 'Use this token in Authorization header: Bearer <token>',
      expires: '30 days'
    });
  } catch (error) {
    logger.error('Token generation failed:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Protected API endpoints (require authentication)
app.use('/api/tools', authenticateToken);

app.get('/api/tools', (req, res) => {
  try {
    const toolList = allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
    res.json(toolList);
  } catch (error) {
    logger.error('Failed to list tools:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

app.post('/api/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const { arguments: toolArgs } = req.body;

    // Find the tool
    const tool = allTools.find(t => t.name === toolName);
    if (!tool) {
      return res.status(404).json({ error: `Tool '${toolName}' not found` });
    }

    // Ensure database connection
    if (!mysqlClient) {
      await initializeDatabase();
    }

    // Execute the tool
    const result = await tool.handler(toolArgs, { mysqlClient });
    
    logger.info('Tool executed successfully', { tool: toolName, ip: req.ip });
    res.json(result);
  } catch (error) {
    logger.error('Tool execution failed:', { tool: req.params.toolName, error, ip: req.ip });
    res.status(500).json({ 
      error: 'Tool execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();
    
    app.listen(PORT, () => {
      logger.info(`🚀 MCP Perfex CRM HTTP Server running on port ${PORT}`);
      logger.info(`📚 API Documentation:`);
      logger.info(`   GET  /health - Health check`);
      logger.info(`   GET  /api/generate-token - Generate API token`);
      logger.info(`   GET  /api/tools - List all available tools (requires auth)`);
      logger.info(`   POST /api/tools/:toolName - Execute a tool (requires auth)`);
      logger.info(`🔐 Authentication: Bearer token required for /api/tools/*`);
      logger.info(`🛡️  Security: CORS enabled, rate limiting active, IP protection enabled`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  if (mysqlClient) {
    await mysqlClient.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down server...');
  if (mysqlClient) {
    await mysqlClient.disconnect();
  }
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});