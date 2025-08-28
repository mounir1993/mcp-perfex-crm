# 🔒 SECURITY POLICY - MCP Server

## 🚨 Reporting Security Issues
- **Email**: emanuel@descomplicar.pt
- **Encryption**: Use GPG key if available
- **Response Time**: 24-48 hours

## 🔐 Security Guidelines

### ❌ NEVER COMMIT:
- `.env` files with credentials
- API keys or tokens
- Database credentials
- Private keys or certificates
- User data or PII

### ✅ ALWAYS:
- Use environment variables for secrets
- Encrypt sensitive configuration
- Review code before commits
- Test security measures locally

### 🛡️ Protection Measures:
- Pre-commit hooks validate security
- Automated scanning for secrets
- Regular dependency updates
- Code review requirements

## 📋 Compliance
This MCP follows security standards:
- GDPR compliance for data handling
- Industry best practices for API security
- Regular security audits and updates

Last updated: $(date '+%Y-%m-%d')
