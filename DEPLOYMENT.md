# 🐳 MCP Perfex CRM - Docker Deployment Guide

## 📋 Prerequisites

- Docker and Docker Compose installed
- Coolify instance running
- GitHub repository access
- MySQL database credentials

## 🚀 Deployment Options

### Option 1: Coolify Deployment (Recommended)

#### 1. Setup in Coolify

1. **Create New Project** in Coolify
2. **Add Git Repository**: `https://github.com/mounir1993/mcp-perfex-crm`
3. **Select Branch**: `main`
4. **Build Type**: Docker
5. **Port**: `3000`

#### 2. Environment Variables

Set these environment variables in Coolify:

```bash
NODE_ENV=production
MYSQL_HOST=193.203.168.172
MYSQL_PORT=3306
MYSQL_USER=u512946718_intenduser
MYSQL_PASSWORD=@AzakMelm2027
MYSQL_DATABASE=u512946718_intendb
PORT=3000
LOG_LEVEL=info
```

#### 3. Deploy

- Click **Deploy** in Coolify
- Monitor build logs
- Access via generated URL

### Option 2: Manual Docker Deployment

#### 1. Clone Repository

```bash
git clone https://github.com/mounir1993/mcp-perfex-crm.git
cd mcp-perfex-crm
```

#### 2. Create Environment File

```bash
cp .env.example .env
# Edit .env with your database credentials
```

#### 3. Build and Run

```bash
# Build the Docker image
docker build -t mcp-perfex-crm .

# Run with environment variables
docker run -d \
  --name mcp-perfex-crm \
  -p 3000:3000 \
  --env-file .env \
  mcp-perfex-crm
```

#### 4. Using Docker Compose

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

## 🔧 Configuration

### Database Connection

Ensure your MySQL database allows connections from the Docker container IP. You may need to:

1. **Whitelist Docker IP range** in your hosting provider
2. **Update firewall rules** to allow port 3306
3. **Verify credentials** are correct

### Health Checks

The container includes health checks that verify:
- Node.js process is running
- Application starts successfully

### Logs

View application logs:

```bash
# Docker
docker logs mcp-perfex-crm

# Docker Compose
docker-compose logs mcp-perfex-crm

# Coolify
Check logs in Coolify dashboard
```

## 🛠️ Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify MYSQL_HOST is accessible
   - Check firewall rules
   - Confirm credentials

2. **Port Already in Use**
   - Change PORT environment variable
   - Update port mapping in docker-compose.yml

3. **Build Failures**
   - Ensure all dependencies are in package.json
   - Check TypeScript compilation errors

### Testing Connectivity

Test database connection:

```bash
docker exec -it mcp-perfex-crm node -e "
const mysql = require('mysql2');
const conn = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
});
conn.connect(err => {
  if (err) console.error('Connection failed:', err);
  else console.log('Connected successfully!');
  process.exit(0);
});
"
```

## 📊 Monitoring

### Health Check Endpoint

The application includes built-in health checks. Monitor via:

- Coolify dashboard
- Docker health status: `docker ps`
- Manual check: `curl http://localhost:3000/health`

### Performance

Monitor resource usage:

```bash
# Docker stats
docker stats mcp-perfex-crm

# Memory and CPU usage
docker exec mcp-perfex-crm ps aux
```

## 🔐 Security

### Production Considerations

1. **Environment Variables**: Never commit `.env` files
2. **Database Security**: Use strong passwords
3. **Network Security**: Restrict database access
4. **Container Security**: Run as non-root user (already configured)

### Updates

Update the application:

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

## 📝 Notes

- **Port**: Application runs on port 3000
- **Database**: Uses existing MySQL database
- **Logs**: Application logs to stdout/stderr
- **Health**: Includes Docker health checks
- **Security**: Runs as non-root user

## 🆘 Support

For issues:
1. Check application logs
2. Verify database connectivity
3. Review environment variables
4. Check Docker container status

The application is now ready for production deployment with proper Docker containerization!