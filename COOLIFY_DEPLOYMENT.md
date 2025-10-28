# 🚀 Coolify Deployment Guide - MCP Perfex CRM

## ✅ Step-by-Step Deployment

### 📋 Prerequisites Completed
- ✅ Code pushed to GitHub: `https://github.com/mounir1993/mcp-perfex-crm`
- ✅ Docker configuration ready
- ✅ Database credentials available
- ✅ Invoice system fixes applied

### 🎯 Coolify Deployment Steps

#### 1. **Create New Project in Coolify**

1. Open your Coolify dashboard
2. Click **"New Project"**
3. Give it a name: `mcp-perfex-crm`

#### 2. **Add Git Repository**

1. Click **"New Resource"** → **"Application"**
2. Select **"Git Repository"**
3. Enter repository URL: `https://github.com/mounir1993/mcp-perfex-crm`
4. Select branch: **`main`**
5. Set build type: **`Docker`**

#### 3. **Configure Build Settings**

- **Build Command**: `npm run build` (auto-detected)
- **Start Command**: `npm start` (auto-detected)
- **Port**: `3000`
- **Dockerfile Path**: `./Dockerfile` (auto-detected)

#### 4. **Set Environment Variables**

Go to **Environment** tab and add these variables:

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

#### 5. **Configure Health Check** (Optional)

- **Health Check Path**: `/health`
- **Health Check Port**: `3000`
- **Health Check Interval**: `30s`

#### 6. **Deploy**

1. Click **"Deploy"**
2. Monitor build logs in real-time
3. Wait for deployment to complete
4. Access your application via the generated URL

## 🔧 Technical Details

### **Docker Configuration**
- **Base Image**: Node.js 18 Alpine (lightweight)
- **Port**: 3000
- **User**: Non-root for security
- **Health Checks**: Built-in monitoring

### **Build Process**
1. Install dependencies (`npm ci`)
2. Copy source code
3. Build TypeScript (`npm run build`)
4. Start application (`node dist/index.js`)

### **Security Features**
- Non-root user execution
- Environment variable protection
- Database connection validation
- Input sanitization

## 📊 Post-Deployment Verification

### **1. Check Application Status**
- Verify deployment is "Running" in Coolify
- Check build logs for any errors
- Monitor health check status

### **2. Test Database Connection**
- Access application logs
- Look for successful MySQL connection
- Verify no database errors

### **3. Test API Endpoints**
- Access the generated URL
- Test basic MCP server functionality
- Verify invoice system works correctly

## 🛠️ Troubleshooting

### **Common Issues & Solutions**

#### **Node.js Version Compatibility Issues**
Many modern npm packages require specific Node.js versions. Always check:
- Package `engines` requirements in node_modules
- Use LTS versions of Node.js (18, 20, 22)
- Match Docker base image with local development environment

#### **Similar Issues That Could Occur:**
1. **Python/Other Language Version Mismatches**
2. **npm/yarn Version Incompatibility** 
3. **Alpine vs Ubuntu Base Image Issues**
4. **Architecture Mismatches (x64 vs arm64)**

#### **Docker Build Failures**

**Issue: `tsc: not found`**
```bash
# Error: sh: tsc: not found during npm run build
# Solution: Fixed in commit 0177ffe
# - Upgraded to Node.js 20 to resolve engine compatibility
# - Use npx tsc instead of npm run build for reliable TypeScript access
# - Added TypeScript verification step
```

**Issue: `EBADENGINE Unsupported engine` warnings**
```bash
# Error: Multiple packages require Node.js >=20 but using Node.js 18
# Solution: Upgraded Docker base image from node:18-alpine to node:20-alpine
# Affected packages: cross-env, commander, rimraf, glob, etc.
```

**Issue: `tsconfig.json not found`**
```bash
# Error: failed to calculate checksum: "/tsconfig.json": not found
# Solution: This was fixed in commit 2962f1b
# The issue was tsconfig.json being excluded in .dockerignore
```

**Issue: `NODE_ENV=production skips devDependencies`**
```bash
# Error: Build tools not available during npm ci --only=production
# Solution: Fixed with multi-stage Docker build
# Builder stage installs all deps, production stage only runtime deps
```

#### **Build Failures**
```bash
# Check package.json syntax
# Verify all dependencies are listed
# Review build logs in Coolify
```

#### **Database Connection Issues**
```bash
# Verify MYSQL_HOST is accessible from Coolify
# Check if IP whitelist includes Coolify servers
# Confirm credentials are correct
```

#### **Port Issues**
```bash
# Ensure PORT environment variable is set to 3000
# Check if port is properly exposed in Dockerfile
# Verify Coolify port mapping
```

### **Debugging Steps**

1. **Check Build Logs**
   - Go to Coolify dashboard
   - View deployment logs
   - Look for build errors

2. **Check Runtime Logs**
   - Monitor application logs
   - Look for MySQL connection errors
   - Check for startup issues

3. **Test Database Connectivity**
   - Use Coolify terminal access
   - Test MySQL connection manually
   - Verify environment variables

## 🔄 Updating Your Application

### **Automatic Deployments**
Coolify can auto-deploy on git push:

1. Go to **Git** tab in Coolify
2. Enable **"Auto Deploy"**
3. Set branch: `main`
4. Save configuration

### **Manual Deployments**
1. Push changes to GitHub
2. Go to Coolify dashboard
3. Click **"Deploy"** button
4. Monitor deployment progress

## 📈 Monitoring & Maintenance

### **Health Monitoring**
- Coolify provides built-in health checks
- Monitor CPU and memory usage
- Set up alerts for failures

### **Log Management**
- Access logs via Coolify dashboard
- Monitor database connection health
- Track API usage patterns

### **Performance Optimization**
- Monitor response times
- Check database query performance
- Scale resources if needed

## 🎉 Success Indicators

Your deployment is successful when:

- ✅ Build completes without errors
- ✅ Application shows "Running" status
- ✅ Health checks pass
- ✅ Database connection established
- ✅ API endpoints respond correctly
- ✅ Invoice system works properly

## 📞 Support

If you encounter issues:

1. **Check deployment logs** first
2. **Verify environment variables** are correct
3. **Test database connectivity** 
4. **Review Docker build process**
5. **Check Coolify documentation**

Your MCP Perfex CRM is now ready for production deployment with Coolify! 🚀