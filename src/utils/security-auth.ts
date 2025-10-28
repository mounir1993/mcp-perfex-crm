import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

// API Key Management
export class APIKeyManager {
  private static apiKeys: Map<string, { name: string; permissions: string[]; createdAt: Date }> = new Map();
  
  static generateAPIKey(name: string, permissions: string[] = ['read']): string {
    const key = 'pk_' + crypto.randomBytes(32).toString('hex');
    this.apiKeys.set(key, {
      name,
      permissions,
      createdAt: new Date()
    });
    return key;
  }
  
  static validateAPIKey(key: string): { valid: boolean; permissions: string[] } {
    const keyData = this.apiKeys.get(key);
    if (!keyData) {
      return { valid: false, permissions: [] };
    }
    return { valid: true, permissions: keyData.permissions };
  }
  
  static revokeAPIKey(key: string): boolean {
    return this.apiKeys.delete(key);
  }
  
  static listAPIKeys(): Array<{ key: string; name: string; permissions: string[]; createdAt: Date }> {
    return Array.from(this.apiKeys.entries()).map(([key, data]) => ({
      key: key.substring(0, 12) + '...',
      name: data.name,
      permissions: data.permissions,
      createdAt: data.createdAt
    }));
  }
}

// JWT Authentication
export class JWTAuth {
  private static secret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
  
  static generateToken(payload: object, expiresIn: string = '24h'): string {
    return jwt.sign(payload, this.secret, { expiresIn });
  }
  
  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
  
  static refreshToken(token: string): string {
    const decoded = this.verifyToken(token);
    const { iat, exp, ...payload } = decoded;
    return this.generateToken(payload);
  }
}

// Rate Limiting Configurations
export const createRateLimiter = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Rate Limiters
export const globalRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later.'
);

export const authRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 auth requests per windowMs
  'Too many authentication attempts, please try again later.'
);

export const apiRateLimit = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  30, // limit each IP to 30 API requests per minute
  'API rate limit exceeded, please slow down your requests.'
);

// Authentication Middleware
export const authenticateAPIKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required. Please provide X-API-Key header or Authorization Bearer token.'
    });
  }
  
  const { valid, permissions } = APIKeyManager.validateAPIKey(apiKey);
  
  if (!valid) {
    logger.warn(`Invalid API key attempt from IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Invalid API key.'
    });
  }
  
  // Add permissions to request object
  (req as any).apiPermissions = permissions;
  logger.info(`API access granted for key with permissions: ${permissions.join(', ')}`);
  next();
};

// Permission-based Authorization
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = (req as any).apiPermissions || [];
    
    if (!permissions.includes(permission) && !permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${permission}`,
        yourPermissions: permissions
      });
    }
    
    next();
  };
};

// IP Whitelist Middleware
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      logger.warn(`Blocked request from unauthorized IP: ${clientIP}`);
      return res.status(403).json({
        success: false,
        error: 'Access denied from this IP address.'
      });
    }
    
    next();
  };
};

// Request Validation Middleware
export const validateContentType = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.is('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
    }
  }
  next();
};

// Security Headers Middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
};

// Input Sanitization
export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    // Remove potential XSS and SQL injection patterns
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = Array.isArray(input) ? [] : {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
};

// Request Sanitization Middleware
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
};

// Audit Logging
export const auditLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      logger.warn('API Request Failed', logData);
    } else {
      logger.info('API Request', logData);
    }
  });
  
  next();
};

// Initialize Default API Keys (for development)
export const initializeDefaultAPIKeys = () => {
  if (process.env.NODE_ENV === 'development') {
    const devKey = APIKeyManager.generateAPIKey('Development Key', ['read', 'write', 'admin']);
    console.log(`🔑 Development API Key: ${devKey}`);
    console.log('⚠️  This key has admin permissions and should only be used in development!');
  }
  
  // Create production keys from environment variables
  if (process.env.ADMIN_API_KEY) {
    APIKeyManager['apiKeys'].set(process.env.ADMIN_API_KEY, {
      name: 'Production Admin Key',
      permissions: ['read', 'write', 'admin'],
      createdAt: new Date()
    });
  }
  
  if (process.env.READ_API_KEY) {
    APIKeyManager['apiKeys'].set(process.env.READ_API_KEY, {
      name: 'Production Read Key',
      permissions: ['read'],
      createdAt: new Date()
    });
  }
};

// Password hashing utilities
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// CORS Configuration
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

export default {
  APIKeyManager,
  JWTAuth,
  authenticateAPIKey,
  requirePermission,
  ipWhitelist,
  globalRateLimit,
  authRateLimit,
  apiRateLimit,
  validateContentType,
  securityHeaders,
  sanitizeRequest,
  auditLogger,
  initializeDefaultAPIKeys,
  hashPassword,
  verifyPassword,
  corsConfig
};