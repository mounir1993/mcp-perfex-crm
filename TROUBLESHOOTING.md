# MCP Perfex CRM - Troubleshooting Guide

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Author**: Emanuel Almeida (Descomplicar®)

---

## 📋 Table of Contents

1. [Common Issues](#-common-issues)
2. [Installation Problems](#-installation-problems)
3. [Configuration Issues](#-configuration-issues)
4. [Database Connection Problems](#-database-connection-problems)
5. [Performance Issues](#-performance-issues)
6. [Claude Desktop Integration](#-claude-desktop-integration)
7. [N8N Integration Guide](#-n8n-integration-guide)
8. [Error Codes Reference](#-error-codes-reference)
9. [Debug Mode](#-debug-mode)
10. [Support & Contact](#-support--contact)

---

## 🚨 Common Issues

### Issue 1: "Command not found: mcp-perfex-crm"

**Symptoms**:
```bash
mcp-perfex-crm
bash: mcp-perfex-crm: command not found
```

**Solutions**:

#### Solution A: NPM Global Installation
```bash
# Check if NPM global path is in PATH
npm config get prefix
echo $PATH

# Install globally if not installed
npm install -g mcp-perfex-crm

# Verify installation
which mcp-perfex-crm
npm list -g mcp-perfex-crm
```

#### Solution B: Fix PATH Variables
```bash
# Add NPM global path to PATH
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# For macOS/zsh users
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

#### Solution C: Use npx (Alternative)
```bash
# Run without global installation
npx mcp-perfex-crm

# Or install locally and run
npm install mcp-perfex-crm
npx mcp-perfex-crm
```

---

### Issue 2: "Cannot connect to MySQL database"

**Symptoms**:
```
Error: connect ECONNREFUSED 127.0.0.1:3306
Host 'xxx.xxx.xxx.xxx' is blocked because of many connection errors
Access denied for user 'username'@'host'
```

**Solutions**:

#### Solution A: Check MySQL Service
```bash
# Check if MySQL is running
systemctl status mysql
# or
systemctl status mariadb

# Start MySQL if stopped
sudo systemctl start mysql
sudo systemctl enable mysql
```

#### Solution B: Verify Connection Details
```bash
# Test connection manually
mysql -h localhost -u your_user -p your_database

# Check environment variables
echo $MYSQL_HOST
echo $MYSQL_USER
echo $MYSQL_DATABASE
```

#### Solution C: Fix Host Blocking
```sql
-- Connect as root and flush hosts
FLUSH HOSTS;

-- Check user permissions
SELECT user, host FROM mysql.user WHERE user = 'your_user';

-- Grant permissions if needed
GRANT SELECT ON perfex_crm.* TO 'your_user'@'%';
FLUSH PRIVILEGES;
```

---

### Issue 3: "TypeScript compilation errors"

**Symptoms**:
```
src/index.ts(10,25): error TS2307: Cannot find module '@modelcontextprotocol/sdk'
npm ERR! Failed at the mcp-perfex-crm@1.0.0 build script
```

**Solutions**:

#### Solution A: Update Dependencies
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Update MCP SDK to latest version
npm install @modelcontextprotocol/sdk@latest

# Rebuild project
npm run build
```

#### Solution B: Fix TypeScript Configuration
```bash
# Check TypeScript version
npx tsc --version

# Update TypeScript if needed
npm install -D typescript@latest

# Check tsconfig.json
cat tsconfig.json
```

---

## 🔧 Installation Problems

### Problem 1: Node.js Version Incompatibility

**Symptoms**:
```
error This package requires Node.js version >=18.0.0
node: unsupported version
```

**Solution**:
```bash
# Install correct Node.js version using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install and use Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify version
node --version
npm --version
```

### Problem 2: Permission Denied on Global Install

**Symptoms**:
```
npm ERR! Error: EACCES: permission denied
npm ERR! Please try running this command again as root/Administrator
```

**Solution**:
```bash
# Configure npm to use different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Now install globally without sudo
npm install -g mcp-perfex-crm
```

### Problem 3: Build Failures on Windows

**Symptoms**:
```
error MSB8020: The build tools for v142 cannot be found
gyp ERR! stack Error: spawn cmd ENOENT
```

**Solution**:
```bash
# Install Windows Build Tools
npm install -g windows-build-tools

# Or install Visual Studio Build Tools manually
# Download from: https://visualstudio.microsoft.com/downloads/

# Alternative: Use Windows Subsystem for Linux (WSL)
wsl --install
# Then install inside WSL environment
```

---

## ⚙️ Configuration Issues

### Issue 1: Environment Variables Not Loaded

**Symptoms**:
```
Configuration error: MYSQL_HOST is required
Environment variable MYSQL_PASSWORD not found
```

**Solutions**:

#### Solution A: Check .env File Location
```bash
# Verify .env file exists and has correct format
ls -la .env
cat .env

# Correct .env format:
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=perfex_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=perfex_crm
```

#### Solution B: Set Environment Variables Manually
```bash
# Set variables for current session
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=perfex_user
export MYSQL_PASSWORD=your_password
export MYSQL_DATABASE=perfex_crm

# Make permanent (add to ~/.bashrc)
echo 'export MYSQL_HOST=localhost' >> ~/.bashrc
source ~/.bashrc
```

#### Solution C: Use dotenv-cli
```bash
# Install dotenv-cli
npm install -g dotenv-cli

# Run with dotenv
dotenv -- mcp-perfex-crm
```

### Issue 2: Multi-tenant Configuration Problems

**Symptoms**:
```
Client config not found for ID: production, using default
Database connection failed for client: production
```

**Solution**:
```typescript
// Edit src/config/clients.ts
export const CLIENT_CONFIGS = {
  default: {
    database: 'perfex_crm',
    prefix: 'tbl'
  },
  production: {
    database: 'perfex_crm_prod',
    prefix: 'tbl'
  },
  staging: {
    database: 'perfex_crm_staging',
    prefix: 'tbl'
  }
};

// Set CLIENT_ID environment variable
export CLIENT_ID=production
```

---

## 🗄️ Database Connection Problems

### Problem 1: SSL/TLS Connection Issues

**Symptoms**:
```
Error: ER_NOT_SUPPORTED_AUTH_MODE: Client does not support authentication protocol
SSL connection error: certificate verify failed
```

**Solutions**:

#### Solution A: Disable SSL (Development Only)
```javascript
// Add to mysql connection config
const config = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  ssl: false // Disable SSL for development
};
```

#### Solution B: Configure Proper SSL
```javascript
const config = {
  // ... other config
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca-cert.pem'),
    key: fs.readFileSync('/path/to/client-key.pem'),
    cert: fs.readFileSync('/path/to/client-cert.pem')
  }
};
```

#### Solution C: Update MySQL Authentication
```sql
-- For MySQL 8.0+ authentication issues
ALTER USER 'your_user'@'%' IDENTIFIED WITH mysql_native_password BY 'your_password';
FLUSH PRIVILEGES;
```

### Problem 2: Connection Pool Exhaustion

**Symptoms**:
```
Error: Too many connections
PoolConnection timeout
Error: Connection timeout
```

**Solution**:
```javascript
// Optimize connection pool settings
const poolConfig = {
  connectionLimit: 10,        // Reduce if hitting limits
  acquireTimeout: 60000,      // 60 seconds
  timeout: 60000,             // 60 seconds
  reconnect: true,
  multipleStatements: false,
  idleTimeout: 300000,        // 5 minutes
  maxReconnectAttempts: 3
};
```

### Problem 3: Database Schema Mismatch

**Symptoms**:
```
Table 'perfex_crm.tblclients' doesn't exist
Column 'userid' not found in table
Unknown table prefix
```

**Solution**:
```bash
# Verify Perfex CRM installation
mysql -u root -p -e "USE perfex_crm; SHOW TABLES;"

# Check table structure
mysql -u root -p -e "DESCRIBE perfex_crm.tblclients;"

# Verify Perfex CRM version compatibility
# MCP Perfex CRM supports Perfex CRM v2.9.0+
```

---

## 🚀 Performance Issues

### Issue 1: Slow Query Performance

**Symptoms**:
```
Query execution time: 5000ms
Database queries taking too long
Timeout errors on large datasets
```

**Solutions**:

#### Solution A: Add Database Indexes
```sql
-- Add indexes for common queries
CREATE INDEX idx_clients_active ON tblclients(active);
CREATE INDEX idx_invoices_status_client ON tblinvoices(status, clientid);
CREATE INDEX idx_projects_status_date ON tblprojects(status, start_date);
CREATE INDEX idx_tasks_project_status ON tbltasks(rel_id, status);
CREATE INDEX idx_leads_status_assigned ON tblleads(status, assigned);

-- Analyze tables after adding indexes
ANALYZE TABLE tblclients, tblinvoices, tblprojects, tbltasks, tblleads;
```

#### Solution B: Optimize Queries
```typescript
// Use LIMIT to prevent large result sets
const customers = await mysqlClient.query(`
  SELECT userid, company, active 
  FROM tblclients 
  WHERE active = 1 
  ORDER BY datecreated DESC 
  LIMIT ?
`, [Math.min(limit, 1000)]); // Cap at 1000 results

// Use specific column selection instead of SELECT *
const invoice = await mysqlClient.query(`
  SELECT id, number, clientid, total, status 
  FROM tblinvoices 
  WHERE id = ?
`, [invoiceId]);
```

#### Solution C: Implement Query Caching
```typescript
// Simple in-memory cache
const queryCache = new Map();

async function cachedQuery(sql: string, params: any[]): Promise<any> {
  const cacheKey = `${sql}-${JSON.stringify(params)}`;
  
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey);
  }
  
  const result = await mysqlClient.query(sql, params);
  
  // Cache for 5 minutes
  queryCache.set(cacheKey, result);
  setTimeout(() => queryCache.delete(cacheKey), 5 * 60 * 1000);
  
  return result;
}
```

### Issue 2: Memory Usage Problems

**Symptoms**:
```
Process memory usage: 2GB+
Out of memory errors
Node.js heap allocation failed
```

**Solutions**:

#### Solution A: Increase Node.js Memory Limit
```bash
# Increase heap size to 4GB
node --max-old-space-size=4096 dist/index.js

# Or set environment variable
export NODE_OPTIONS="--max-old-space-size=4096"
```

#### Solution B: Optimize Data Processing
```typescript
// Process data in chunks instead of loading all at once
async function processLargeDataset(query: string): Promise<void> {
  const chunkSize = 1000;
  let offset = 0;
  
  while (true) {
    const chunk = await mysqlClient.query(
      `${query} LIMIT ? OFFSET ?`,
      [chunkSize, offset]
    );
    
    if (chunk.length === 0) break;
    
    // Process chunk
    await processChunk(chunk);
    
    offset += chunkSize;
    
    // Force garbage collection periodically
    if (offset % 10000 === 0 && global.gc) {
      global.gc();
    }
  }
}
```

---

## 🖥️ Claude Desktop Integration

### Issue 1: MCP Server Not Appearing in Claude

**Symptoms**:
- Server not listed in Claude Desktop
- Tools not available in conversation
- Connection timeout errors

**Solutions**:

#### Solution A: Verify Configuration File Location

**macOS**:
```bash
# Check configuration file
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# If file doesn't exist, create it
mkdir -p ~/Library/Application\ Support/Claude/
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows**:
```cmd
# Check configuration file
type %APPDATA%\Claude\claude_desktop_config.json

# Create if missing
mkdir %APPDATA%\Claude
echo {} > %APPDATA%\Claude\claude_desktop_config.json
```

**Linux**:
```bash
# Check configuration file
cat ~/.config/Claude/claude_desktop_config.json

# Create if missing
mkdir -p ~/.config/Claude/
echo '{}' > ~/.config/Claude/claude_desktop_config.json
```

#### Solution B: Fix Configuration Format
```json
{
  "mcpServers": {
    "mcp-perfex-crm": {
      "command": "mcp-perfex-crm",
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "perfex_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "perfex_crm",
        "LOG_LEVEL": "error"
      }
    }
  }
}
```

#### Solution C: Test MCP Server Manually
```bash
# Test server directly
mcp-perfex-crm

# Check if binary is executable
which mcp-perfex-crm
ls -la $(which mcp-perfex-crm)

# Test with environment variables
MYSQL_HOST=localhost MYSQL_USER=test mcp-perfex-crm
```

### Issue 2: Tools Not Working in Claude

**Symptoms**:
- Server connected but tools fail
- Error messages in Claude conversation
- Partial functionality

**Solutions**:

#### Solution A: Check Tool Permissions
```sql
-- Verify database permissions
SHOW GRANTS FOR 'your_user'@'%';

-- Grant necessary permissions
GRANT SELECT ON perfex_crm.* TO 'your_user'@'%';
GRANT INSERT, UPDATE ON perfex_crm.tbltickets TO 'your_user'@'%';
GRANT INSERT, UPDATE ON perfex_crm.tblprojects TO 'your_user'@'%';
FLUSH PRIVILEGES;
```

#### Solution B: Enable Debug Logging
```json
{
  "mcpServers": {
    "mcp-perfex-crm": {
      "command": "mcp-perfex-crm",
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "perfex_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "perfex_crm",
        "LOG_LEVEL": "debug",
        "NODE_ENV": "development"
      }
    }
  }
}
```

---

## 🔄 N8N Integration Guide

### 🚀 NEW: Official N8N MCP Server (Recommended)

**Status**: ✅ **Installed and Configured**  
**Version**: @leonardsellem/n8n-mcp-server@0.1.8  
**Claude Code Integration**: ✅ **Active**

#### Quick Setup for N8N + Perfex CRM Integration

The recommended approach is now using the official N8N MCP Server that's already integrated with Claude Code:

```bash
# ✅ Already installed:
# @leonardsellem/n8n-mcp-server@0.1.8

# ✅ Already configured in Claude Code:
# Server name: n8n-automation
```

#### Step 1: Configure N8N API Access
```bash
# 1. Start your N8N instance
npm install -g n8n  # if not installed
n8n start           # Access: http://localhost:5678

# 2. Generate API Key in N8N:
# Settings > API > API Keys > Create new API key

# 3. Update Claude Code configuration
cd /home/ealmeida
claude mcp remove n8n-automation
claude mcp add-json n8n-automation '{
  "command": "node",
  "args": ["/home/ealmeida/.nvm/versions/node/v22.18.0/lib/node_modules/@leonardsellem/n8n-mcp-server/build/index.js"],
  "env": {
    "N8N_API_URL": "http://localhost:5678/api/v1",
    "N8N_API_KEY": "your_actual_api_key_here",
    "DEBUG": "true"
  }
}'
```

#### Step 2: Available Integration Tools

With both MCP servers active, you can now:

```typescript
// 1. Use N8N automation tools
const workflows = await use_mcp_tool({
  server_name: "n8n-automation",
  tool_name: "workflow_list"
});

// 2. Use Perfex CRM tools  
const customers = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "get_customers", 
  arguments: { limit: 10 }
});

// 3. Create integrated workflows
const integration = await use_mcp_tool({
  server_name: "n8n-automation",
  tool_name: "execution_run",
  arguments: {
    workflowId: "perfex-sync-workflow",
    data: {
      customers: customers.data,
      action: "sync_to_external_system"
    }
  }
});
```

#### Step 3: Example Integrated Workflow

Create an N8N workflow that connects with Perfex CRM:

```json
{
  "name": "Perfex CRM Customer Sync",
  "nodes": [
    {
      "name": "Get New Customers",
      "type": "@n8n/n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3001/execute/get_customers",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "limit": 100,
          "active": true,
          "created_since": "{{ $now.subtract(1, 'day').format('YYYY-MM-DD') }}"
        }
      }
    },
    {
      "name": "Process Each Customer",
      "type": "@n8n/n8n-nodes-base.splitInBatches",
      "parameters": {
        "batchSize": 10
      }
    },
    {
      "name": "Send to External System",
      "type": "@n8n/n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://external-system.com/api/customers",
        "body": "={{ $json }}"
      }
    }
  ]
}
```

### 📚 Complete Setup Documentation

For detailed setup instructions, see:
- **📖 [N8N Setup Guide](/home/ealmeida/docs/n8n-mcp-setup-guide.md)**
- **🔧 [Configuration Reference](https://github.com/leonardsellem/n8n-mcp-server)**

### 🔄 Legacy: Custom N8N Wrapper (Deprecated)

⚠️ **Note**: The following approach is deprecated. Use the official N8N MCP Server above.

### Complete N8N Setup for MCP Perfex CRM (Legacy)

N8N can integrate with MCP Perfex CRM through several methods. Here's a comprehensive guide to ensure proper functionality:

#### Method 1: HTTP Request Node (Recommended)

Since MCP servers are designed for direct tool execution, we'll create a wrapper service for N8N integration.

#### Step 1: Create N8N Wrapper Service

```typescript
// n8n-wrapper.ts - Create this file in your project
import express from 'express';
import { MySQLClient } from './mysql-client.js';
import { allTools } from './index.js'; // Import all tools
import { getClientConfig } from './config/clients.js';

const app = express();
app.use(express.json());

// Initialize MySQL client
const clientId = process.env.CLIENT_ID || 'default';
const clientConfig = getClientConfig(clientId);

const mysqlClient = new MySQLClient({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: clientConfig.database
}, clientId);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const isHealthy = await mysqlClient.testConnection();
    res.json({ 
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      tools_available: allTools.length
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// List available tools
app.get('/tools', (req, res) => {
  const toolList = allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
  
  res.json({
    count: toolList.length,
    tools: toolList
  });
});

// Execute tool endpoint
app.post('/execute/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const args = req.body;

    // Find the tool
    const tool = allTools.find(t => t.name === toolName);
    if (!tool) {
      return res.status(404).json({
        error: `Tool '${toolName}' not found`,
        available_tools: allTools.map(t => t.name)
      });
    }

    // Execute the tool
    const result = await tool.handler(args, mysqlClient);
    
    res.json({
      success: true,
      tool: toolName,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
});

// Batch execution endpoint for N8N workflows
app.post('/batch', async (req, res) => {
  try {
    const { operations } = req.body;
    
    if (!Array.isArray(operations)) {
      return res.status(400).json({
        error: 'Operations must be an array'
      });
    }

    const results = [];
    
    for (const operation of operations) {
      const { tool: toolName, args } = operation;
      
      const tool = allTools.find(t => t.name === toolName);
      if (!tool) {
        results.push({
          tool: toolName,
          success: false,
          error: `Tool '${toolName}' not found`
        });
        continue;
      }

      try {
        const result = await tool.handler(args, mysqlClient);
        results.push({
          tool: toolName,
          success: true,
          result: result
        });
      } catch (error) {
        results.push({
          tool: toolName,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    res.json({
      success: true,
      batch_results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Start server
const PORT = process.env.N8N_WRAPPER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`N8N Wrapper running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Tools list: http://localhost:${PORT}/tools`);
});

export { app };
```

#### Step 2: Add N8N Scripts to package.json

```json
{
  "scripts": {
    "n8n-wrapper": "node dist/n8n-wrapper.js",
    "n8n-dev": "ts-node src/n8n-wrapper.ts"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.17"
  }
}
```

#### Step 3: Start N8N Wrapper Service

```bash
# Build the project first
npm run build

# Start the N8N wrapper
npm run n8n-wrapper

# Or for development
npm run n8n-dev
```

#### Step 4: Configure N8N Workflows

##### Example 1: Get Customer Data

```json
{
  "name": "Get Perfex Customer",
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:3001/execute/get_customer",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "client_id": "{{ $json.customer_id }}"
        }
      }
    }
  ]
}
```

##### Example 2: Create Invoice

```json
{
  "name": "Create Perfex Invoice",
  "nodes": [
    {
      "name": "Create Invoice",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:3001/execute/create_invoice",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "client_id": "{{ $json.client_id }}",
          "date": "{{ $now }}",
          "items": [
            {
              "description": "{{ $json.service_description }}",
              "qty": "{{ $json.quantity }}",
              "rate": "{{ $json.rate }}"
            }
          ]
        }
      }
    }
  ]
}
```

##### Example 3: Batch Operations

```json
{
  "name": "Batch Perfex Operations",
  "nodes": [
    {
      "name": "Batch Request",
      "type": "n8n-nodes-base.httpRequest", 
      "parameters": {
        "url": "http://localhost:3001/batch",
        "method": "POST",
        "body": {
          "operations": [
            {
              "tool": "get_customers",
              "args": { "active": true, "limit": 10 }
            },
            {
              "tool": "get_invoices", 
              "args": { "status": "unpaid", "limit": 5 }
            },
            {
              "tool": "get_lead_statistics",
              "args": { "period": "month" }
            }
          ]
        }
      }
    }
  ]
}
```

#### Step 5: N8N Custom Node (Advanced)

For advanced users, create a custom N8N node:

```typescript
// nodes/PerfexCrm/PerfexCrm.node.ts
import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';

export class PerfexCrm implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Perfex CRM',
    name: 'perfexCrm',
    group: ['transform'],
    version: 1,
    description: 'Interact with Perfex CRM via MCP server',
    defaults: {
      name: 'Perfex CRM',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'perfexCrmApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          {
            name: 'Get Customer',
            value: 'getCustomer',
          },
          {
            name: 'Create Invoice',
            value: 'createInvoice',
          },
          // Add more operations
        ],
        default: 'getCustomer',
      },
      // Add more properties based on operation
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        const credentials = await this.getCredentials('perfexCrmApi', i);
        
        const baseUrl = credentials.baseUrl as string;
        const response = await this.helpers.request({
          method: 'POST',
          url: `${baseUrl}/execute/${operation}`,
          body: this.getNodeParameter('parameters', i, {}),
          json: true,
        });

        returnData.push({
          json: response,
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: error.message },
          });
        } else {
          throw error;
        }
      }
    }

    return [returnData];
  }
}
```

#### Method 2: Direct Database Connection in N8N

Configure N8N to connect directly to your Perfex CRM database:

```json
{
  "name": "Direct MySQL Connection",
  "nodes": [
    {
      "name": "MySQL Query",
      "type": "n8n-nodes-base.mysql",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM tblclients WHERE active = 1 LIMIT 10"
      },
      "credentials": {
        "mysql": {
          "host": "localhost",
          "port": 3306,
          "database": "perfex_crm",
          "user": "perfex_readonly",
          "password": "your_password"
        }
      }
    }
  ]
}
```

#### Troubleshooting N8N Integration

##### Issue 1: Connection Refused
```bash
# Check if wrapper service is running
curl http://localhost:3001/health

# Start wrapper service
npm run n8n-wrapper

# Check logs
tail -f logs/mcp-perfex-crm.log
```

##### Issue 2: CORS Issues
```typescript
// Add CORS to n8n-wrapper.ts
import cors from 'cors';

app.use(cors({
  origin: ['http://localhost:5678', 'https://app.n8n.cloud'],
  credentials: true
}));
```

##### Issue 3: Authentication Errors
```typescript
// Add API key authentication
app.use('/execute', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.N8N_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
});
```

---

## 🐛 Error Codes Reference

### Database Errors

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| `ER_ACCESS_DENIED_ERROR` | Access denied | Wrong credentials | Check username/password |
| `ER_BAD_DB_ERROR` | Database doesn't exist | Wrong database name | Verify database name |
| `ER_CON_COUNT_ERROR` | Too many connections | Connection limit reached | Reduce connection pool size |
| `ER_HOST_IS_BLOCKED` | Host blocked | Too many connection errors | Run `FLUSH HOSTS;` in MySQL |
| `ECONNREFUSED` | Connection refused | MySQL not running | Start MySQL service |
| `ETIMEDOUT` | Connection timeout | Network/firewall issue | Check network connectivity |

### Application Errors

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| `MODULE_NOT_FOUND` | Cannot find module | Missing dependency | Run `npm install` |
| `ENOENT` | File not found | Missing configuration | Check file paths |
| `EACCES` | Permission denied | File permissions | Fix file permissions |
| `EADDRINUSE` | Port already in use | Port conflict | Change port or kill process |

### MCP Protocol Errors

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| `INVALID_REQUEST` | Invalid MCP request | Malformed request | Check request format |
| `METHOD_NOT_FOUND` | Method not found | Tool doesn't exist | Check tool name |
| `INVALID_PARAMS` | Invalid parameters | Wrong parameters | Check parameter schema |
| `INTERNAL_ERROR` | Internal server error | Application error | Check logs |

---

## 🔍 Debug Mode

### Enabling Debug Mode

#### Method 1: Environment Variables
```bash
export NODE_ENV=development
export LOG_LEVEL=debug
export ENABLE_AUDIT_LOG=true

# Run with debug enabled
mcp-perfex-crm
```

#### Method 2: Debug Configuration
```json
{
  "mcpServers": {
    "mcp-perfex-crm": {
      "command": "mcp-perfex-crm",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug",
        "ENABLE_AUDIT_LOG": "true"
      }
    }
  }
}
```

### Debug Output Examples

#### Connection Debug
```json
{
  "level": "debug",
  "message": "Database connection established",
  "clientId": "default",
  "host": "localhost",
  "database": "perfex_crm",
  "timestamp": "2025-08-15T10:30:00.000Z"
}
```

#### Query Debug
```json
{
  "level": "debug", 
  "message": "SQL query executed",
  "sql": "SELECT * FROM tblclients WHERE active = ?",
  "params": [1],
  "duration": 45,
  "rows": 25,
  "timestamp": "2025-08-15T10:30:01.000Z"
}
```

#### Tool Execution Debug
```json
{
  "level": "debug",
  "message": "Tool executed",
  "tool": "get_customers",
  "args": {"limit": 10, "active": true},
  "duration": 123,
  "success": true,
  "timestamp": "2025-08-15T10:30:02.000Z"
}
```

### Performance Monitoring

```typescript
// Enable performance monitoring
const performanceMonitor = {
  startTime: Date.now(),
  queries: 0,
  slowQueries: 0,
  errors: 0
};

// Track metrics
export function trackPerformance(duration: number, success: boolean): void {
  performanceMonitor.queries++;
  
  if (duration > 1000) {
    performanceMonitor.slowQueries++;
  }
  
  if (!success) {
    performanceMonitor.errors++;
  }
  
  // Log every 100 queries
  if (performanceMonitor.queries % 100 === 0) {
    logger.info('Performance metrics', performanceMonitor);
  }
}
```

---

## 📞 Support & Contact

### Self-Help Resources

1. **Documentation**: [DOCUMENTATION.md](./DOCUMENTATION.md)
2. **API Reference**: [API.md](./API.md)
3. **GitHub Issues**: [Issues Tracker](https://github.com/YOUR_USERNAME/mcp-perfex-crm/issues)
4. **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/mcp-perfex-crm/discussions)

### Reporting Bugs

When reporting bugs, please include:

#### System Information
```bash
# Gather system info
node --version
npm --version
mysql --version
uname -a
```

#### Application Information
```bash
# Get application info  
mcp-perfex-crm --version
npm list mcp-perfex-crm
```

#### Error Logs
```bash
# Collect error logs
tail -f logs/mcp-perfex-crm.log
journalctl -u mysql.service
```

#### Minimal Reproduction
Provide the smallest possible example that reproduces the issue:

```typescript
// Minimal reproduction example
const result = await use_mcp_tool({
  server_name: "mcp-perfex-crm",
  tool_name: "problematic_tool",
  arguments: {
    // minimal arguments that cause the issue
  }
});
```

### Getting Help

1. **Search existing issues** first
2. **Use the discussion forum** for questions
3. **Create detailed bug reports** with reproduction steps
4. **Include all relevant information** (logs, config, environment)

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on:
- Code contributions
- Documentation improvements
- Bug reports
- Feature requests

---

**🚀 This troubleshooting guide ensures MCP Perfex CRM works reliably in all environments, including seamless N8N integration for workflow automation.**