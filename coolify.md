# Coolify Configuration for MCP Perfex CRM

## Build Configuration
- **Framework**: Docker
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Port**: 3000
- **Health Check**: /health

## Environment Variables
Set these in Coolify Environment tab:

```
NODE_ENV=production
MYSQL_HOST=193.203.168.172
MYSQL_PORT=3306
MYSQL_USER=u512946718_intenduser
MYSQL_PASSWORD=@AzakMelm2027
MYSQL_DATABASE=u512946718_intendb
PORT=3000
LOG_LEVEL=info
```

## Deployment Process
1. Connect GitHub repository: https://github.com/mounir1993/mcp-perfex-crm
2. Select branch: main
3. Set environment variables
4. Deploy

## Health Check
The application includes built-in health monitoring.