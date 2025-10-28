# 🔗 N8N Integration Guide for MCP Perfex CRM (Secured)

Your MCP Perfex CRM HTTP API is now deployed at:
**http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io**

## � Authentication & Security

### **API Key Authentication (Recommended)**

All API endpoints now require authentication via API Key:

```bash
# Get your API key from admin
curl -X POST http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/auth/api-keys \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "N8N Integration", "permissions": ["read", "write"]}'
```

### **Environment Variables for Security**
```bash
# Required for production
ADMIN_API_KEY=your-secure-admin-key-here
READ_API_KEY=your-read-only-key-here
JWT_SECRET=your-jwt-secret-here
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-secure-password
ALLOWED_ORIGINS=https://yourdomain.com,https://n8n.yourdomain.com
ALLOWED_IPS=192.168.1.100,10.0.0.50  # Optional IP whitelist
```

## 🚀 Available API Endpoints

### **Public Endpoints (No Auth Required)**
```
GET /health  # Server health check
```

### **Authentication Endpoints**
```
POST /api/auth/login           # Login with username/password
POST /api/auth/api-keys        # Generate new API key (admin only)
GET  /api/auth/api-keys        # List API keys (admin only)
```

### **Protected Endpoints (API Key Required)**
```
GET  /api/tools                # List all tools (read permission)
POST /api/tools/{toolName}     # Execute tool (read/write based on operation)
GET  /api/customers            # List customers (read permission)
POST /api/customers            # Create customer (write permission)
GET  /api/invoices             # List invoices (read permission)
POST /api/invoices             # Create invoice (write permission)
```

## 🎯 N8N Workflow Examples (With Authentication)

### **1. Get Customers List (Authenticated)**

**HTTP Request Node Configuration:**
```json
{
  "method": "GET",
  "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/customers",
  "options": {
    "headers": {
      "Content-Type": "application/json",
      "X-API-Key": "{{ $credentials.perfexCRM.apiKey }}"
    }
  }
}
```

### **2. Create New Customer (Authenticated)**

**HTTP Request Node Configuration:**
```json
{
  "method": "POST",
  "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/customers",
  "options": {
    "headers": {
      "Content-Type": "application/json",
      "X-API-Key": "{{ $credentials.perfexCRM.apiKey }}"
    },
    "body": {
      "company": "{{ $json.company_name }}",
      "email": "{{ $json.email }}",
      "phone": "{{ $json.phone }}",
      "address": "{{ $json.address }}"
    }
  }
}
```

### **3. Create Invoice (Authenticated)**

**HTTP Request Node Configuration:**
```json
{
  "method": "POST",
  "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/invoices",
  "options": {
    "headers": {
      "Content-Type": "application/json",
      "X-API-Key": "{{ $credentials.perfexCRM.apiKey }}"
    },
    "body": {
      "clientid": "{{ $json.customer_id }}",
      "date": "{{ $now.format('YYYY-MM-DD') }}",
      "duedate": "{{ $now.plus({days: 30}).format('YYYY-MM-DD') }}",
      "currency": 1,
      "items": [
        {
          "description": "{{ $json.service_description }}",
          "rate": "{{ $json.amount }}",
          "qty": 1
        }
      ]
    }
  }
}
```

## 🔑 N8N Credentials Setup

### **1. Create Custom Credential Type in N8N**

Create a new credential type for Perfex CRM:

```javascript
// credentials/PerfexCrmApi.credentials.ts
export class PerfexCrmApi implements ICredentialType {
  name = 'perfexCrmApi';
  displayName = 'Perfex CRM API';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Your Perfex CRM API Key'
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io',
      description: 'Base URL of your Perfex CRM API'
    }
  ];
}
```

### **2. Use in HTTP Request Nodes**

Once credential is created, use it in your HTTP Request nodes:

```json
{
  "authentication": "genericCredentialType",
  "genericAuthType": "perfexCrmApi",
  "headers": {
    "X-API-Key": "={{ $credentials.perfexCrmApi.apiKey }}"
  }
}
```

### **4. Create Project**

**HTTP Request Node Configuration:**
```json
{
  "method": "POST",
  "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/projects",
  "options": {
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "name": "{{ $json.project_name }}",
      "clientid": "{{ $json.customer_id }}",
      "start_date": "{{ $now.format('YYYY-MM-DD') }}",
      "deadline": "{{ $json.deadline }}",
      "description": "{{ $json.description }}"
    }
  }
}
```

### **5. Create Task**

**HTTP Request Node Configuration:**
```json
{
  "method": "POST",
  "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/tasks",
  "options": {
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "name": "{{ $json.task_name }}",
      "description": "{{ $json.task_description }}",
      "rel_id": "{{ $json.project_id }}",
      "rel_type": "project",
      "priority": 2,
      "dateadded": "{{ $now.format('YYYY-MM-DD HH:mm:ss') }}"
    }
  }
}
```

## 📋 Complete N8N Workflow Template

Here's a complete workflow that demonstrates customer management:

```json
{
  "name": "Perfex CRM Integration",
  "nodes": [
    {
      "parameters": {
        "triggerOn": "webhook"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [240, 300],
      "id": "webhook-trigger"
    },
    {
      "parameters": {
        "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/customers",
        "options": {
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "company": "={{ $json.body.company }}",
            "email": "={{ $json.body.email }}",
            "phone": "={{ $json.body.phone }}"
          }
        },
        "method": "POST"
      },
      "name": "Create Customer",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [460, 300],
      "id": "create-customer"
    },
    {
      "parameters": {
        "url": "http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/projects",
        "options": {
          "headers": {
            "Content-Type": "application/json"
          },
          "body": {
            "name": "={{ $json.body.project_name }}",
            "clientid": "={{ $('Create Customer').item.json.data.id }}",
            "start_date": "={{ $now.format('YYYY-MM-DD') }}"
          }
        },
        "method": "POST"
      },
      "name": "Create Project",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [680, 300],
      "id": "create-project"
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Create Customer",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Customer": {
      "main": [
        [
          {
            "node": "Create Project",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 🔧 Common Use Cases

### **1. Customer Onboarding Workflow**
```
Trigger: Form Submission → Create Customer → Create Project → Create Initial Tasks → Send Welcome Email
```

### **2. Invoice Generation Workflow**
```
Trigger: Project Completion → Get Project Details → Calculate Amount → Create Invoice → Send Invoice Email
```

### **3. Lead Management Workflow**
```
Trigger: New Lead → Create Lead in CRM → Assign to Sales Rep → Schedule Follow-up → Create Tasks
```

### **4. Support Ticket Workflow**
```
Trigger: Support Email → Create Ticket → Assign to Agent → Create Task → Send Acknowledgment
```

## 🛡️ Security & Best Practices

### **1. Rate Limiting**
- Implement rate limiting in N8N for production use
- Consider API quotas based on your server capacity

### **2. Error Handling**
```javascript
// Add error handling in N8N expressions
{{ $json.success ? $json.data : null }}
```

### **3. Data Validation**
- Always validate input data before sending to API
- Use N8N's data transformation nodes

### **4. Monitoring**
- Monitor API response times
- Set up alerts for failed requests
- Track API usage patterns

## 📊 Response Formats

All API endpoints return consistent response formats:

**Success Response:**
```json
{
  "success": true,
  "tool": "list_customers",
  "data": { /* actual data */ },
  "timestamp": "2025-10-28T20:45:00Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "tool": "create_customer"
}
```

## 🚀 Advanced Integration

### **Custom N8N Node (Optional)**

For advanced users, you can create a custom N8N node:

```javascript
// nodes/PerfexCrm/PerfexCrm.node.ts
export class PerfexCrm implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Perfex CRM',
    name: 'perfexCrm',
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'List Customers', value: 'listCustomers' },
          { name: 'Create Customer', value: 'createCustomer' },
          { name: 'Create Invoice', value: 'createInvoice' }
        ]
      }
    ]
  };
}
```

Your MCP Perfex CRM is now fully ready for N8N integration! 🎉

## 🆘 Troubleshooting

**Common Issues:**
1. **Connection Timeout**: Check if your server is running
2. **401/403 Errors**: Verify API endpoint URLs
3. **Database Errors**: Check MySQL connection in server logs

**Test Your Integration:**
```bash
# Test health endpoint
curl http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/health

# Test customer creation
curl -X POST http://v0g8sokoo04cowwo4gww88kk.185.158.132.53.sslip.io/api/customers \
  -H "Content-Type: application/json" \
  -d '{"company": "Test Company", "email": "test@example.com"}'
```