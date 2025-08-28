# MCP Perfex CRM - Installation Guide

## Quick Start

### Option 1: NPM Global Installation (Recommended)

```bash
# Install globally
npm install -g mcp-perfex-crm

# Configure environment
cp .env.example .env
# Edit .env with your database settings

# Test installation
mcp-perfex-crm
```

### Option 2: Local Development Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/mcp-perfex-crm
cd mcp-perfex-crm

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database settings

# Build the project
npm run build

# Test locally
npm start
```

## Claude Desktop Configuration

### For NPM Installation

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "mcp-perfex-crm": {
      "command": "mcp-perfex-crm",
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "perfex_readonly",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "perfex_crm",
        "LOG_LEVEL": "error",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### For Local Installation

```json
{
  "mcpServers": {
    "mcp-perfex-crm": {
      "command": "node",
      "args": ["/path/to/mcp-perfex-crm/dist/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "perfex_readonly",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "perfex_crm",
        "LOG_LEVEL": "error",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Database Setup

### 1. Create Read-Only User (Recommended)

```sql
-- Create read-only user for security
CREATE USER 'perfex_readonly'@'%' IDENTIFIED BY 'your_strong_password';

-- Grant SELECT permissions on Perfex CRM database
GRANT SELECT ON perfex_crm.* TO 'perfex_readonly'@'%';

-- Grant INSERT/UPDATE permissions for specific operations (optional)
GRANT INSERT, UPDATE ON perfex_crm.tbltickets TO 'perfex_readonly'@'%';
GRANT INSERT, UPDATE ON perfex_crm.tblprojects TO 'perfex_readonly'@'%';
GRANT INSERT, UPDATE ON perfex_crm.tbltasks TO 'perfex_readonly'@'%';

-- Apply changes
FLUSH PRIVILEGES;
```

### 2. Test Connection

```bash
# Test database connection
mysql -h localhost -u perfex_readonly -p perfex_crm
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MYSQL_HOST` | MySQL host | localhost | Yes |
| `MYSQL_PORT` | MySQL port | 3306 | Yes |
| `MYSQL_USER` | MySQL username | - | Yes |
| `MYSQL_PASSWORD` | MySQL password | - | Yes |
| `MYSQL_DATABASE` | Database name | perfex_crm | Yes |
| `CLIENT_ID` | Client identifier | default | No |
| `LOG_LEVEL` | Log level (error/warn/info/debug) | error | No |
| `NODE_ENV` | Environment | production | No |
| `ENABLE_AUDIT_LOG` | Enable audit logging | false | No |

## Troubleshooting

### Common Issues

1. **Connection refused**
   - Check MySQL is running
   - Verify host and port settings
   - Check firewall rules

2. **Access denied**
   - Verify username and password
   - Check user permissions
   - Ensure user can connect from your host

3. **Database not found**
   - Verify database name
   - Check if Perfex CRM is properly installed

4. **Too many connections**
   - Check MySQL max_connections setting
   - Reduce CONNECTION_LIMIT in environment

### Performance Optimization

For production use:

```env
# Optimized for production
LOG_LEVEL=error
NODE_ENV=production
ENABLE_AUDIT_LOG=false
MAX_QUERY_ROWS=1000
QUERY_TIMEOUT_MS=30000
```

## Security Best Practices

1. **Use read-only database user** when possible
2. **Set strong passwords** for database access
3. **Enable SSL/TLS** for database connections
4. **Limit network access** to database server
5. **Keep logs minimal** in production

## Support

- 📖 [Documentation](./README.md)
- 🐛 [Issue Tracker](https://github.com/YOUR_USERNAME/mcp-perfex-crm/issues)
- 💬 [Discussions](https://github.com/YOUR_USERNAME/mcp-perfex-crm/discussions)

## Next Steps

1. ✅ Install and configure MCP server
2. ✅ Test database connection
3. ✅ Configure Claude Desktop
4. 🚀 Start using MCP tools with Claude!

---

**Need help?** Check our [troubleshooting guide](./README.md#troubleshooting) or [open an issue](https://github.com/YOUR_USERNAME/mcp-perfex-crm/issues).