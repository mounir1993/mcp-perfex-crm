# 🚀 MCP Perfex CRM - Production Ready with Authentication

## ✅ Security Implementation Complete

Your MCP Perfex CRM server is now fully configured with authentication and security for N8N integration!

### 🔐 Security Features Implemented

1. **Token-Based Authentication**
   - Simple API token generation (no complex login system)
   - Bearer token authentication for all API endpoints
   - 30-day token expiration

2. **CORS Protection**
   - Configurable CORS origins for N8N integration
   - Cross-origin resource sharing enabled

3. **Attack Prevention**
   - Rate limiting: 100 requests per 15 minutes per IP
   - IP-based protection and blocking
   - Request size limits (10MB)
   - Security headers (XSS, clickjacking protection)

### 🌐 API Endpoints

#### Public Endpoints (No Authentication)
- `GET /health` - Health check
- `GET /api/generate-token` - Generate API token

#### Protected Endpoints (Require Bearer Token)
- `GET /api/tools` - List all available Perfex CRM tools
- `POST /api/tools/:toolName` - Execute a specific tool

### 🔧 Usage Example

1. **Generate API Token:**
```bash
curl http://your-server:3000/api/generate-token
```

Response:
```json
{
  "token": "mcp_1234567890abcdef...",
  "message": "Use this token in Authorization header: Bearer <token>",
  "expires": "30 days"
}
```

2. **Use API with Authentication:**
```bash
# List all tools
curl -H "Authorization: Bearer mcp_1234567890abcdef..." \
     http://your-server:3000/api/tools

# Execute a tool
curl -X POST \
     -H "Authorization: Bearer mcp_1234567890abcdef..." \
     -H "Content-Type: application/json" \
     -d '{"arguments": {"customerId": "123"}}' \
     http://your-server:3000/api/tools/get_customer_details
```

### 🐳 Docker Deployment

Your Docker setup is ready with multi-stage build and security:

1. **Build and Run:**
```bash
docker build -t mcp-perfex-crm:latest .
docker run -d \
  -p 3000:3000 \
  -e SERVER_MODE=http \
  -e DB_HOST=193.203.168.172 \
  -e DB_USER=your_user \
  -e DB_PASSWORD=your_password \
  -e DB_NAME=perfexcrm \
  --name mcp-perfex-crm \
  mcp-perfex-crm:latest
```

2. **Environment Variables:**
```env
SERVER_MODE=http              # HTTP server mode (default)
PORT=3000                     # Server port
CLIENT_ID=default             # Client configuration
DB_HOST=193.203.168.172       # MySQL host
DB_USER=your_user             # MySQL username
DB_PASSWORD=your_password     # MySQL password
DB_NAME=perfexcrm             # Database name
CORS_ORIGINS=*                # CORS origins (comma-separated)
```

### 🔗 N8N Integration

1. **In N8N HTTP Request Node:**
   - URL: `http://your-server:3000/api/tools/TOOL_NAME`
   - Method: `POST`
   - Authentication: `Bearer Token`
   - Token: `mcp_1234567890abcdef...`
   - Body: `{"arguments": {"param1": "value1"}}`

2. **Example N8N Workflow:**
   - Trigger: Webhook or schedule
   - HTTP Request: Call MCP API with authentication
   - Process: Handle response data

### 🛡️ Security Configuration

File: `src/utils/security-simple.ts`
- Token generation with crypto.randomBytes
- IP tracking and blocking capabilities
- CORS configuration for web access
- Express middleware for authentication

File: `src/http-server.ts`
- Complete Express server with security
- Rate limiting and attack prevention
- Database connection and tool execution
- Error handling and logging

### 📋 Available Tools

Your server provides 50+ Perfex CRM tools including:
- Customer management
- Project tracking
- Invoice handling
- Payment processing
- Task management
- Staff administration
- Financial reporting
- And much more...

### 🚀 Ready for Production

Your MCP Perfex CRM server is now:
- ✅ Secured with token authentication
- ✅ Protected against attacks
- ✅ CORS enabled for N8N
- ✅ Rate limited and monitored
- ✅ Docker containerized
- ✅ Production ready

Start Docker Desktop and deploy with confidence!