import crypto from 'crypto';
import { logger } from './logger.js';

// Simple token-based authentication
export class SecurityManager {
  private static apiTokens: Set<string> = new Set();
  private static ipAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private static blockedIPs: Set<string> = new Set();

  // Generate a secure API token
  static generateAPIToken(): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.apiTokens.add(token);
    logger.info(`🔑 New API token generated: ${token.substring(0, 8)}...`);
    return token;
  }

  // Initialize with environment tokens
  static initialize() {
    // Add tokens from environment variables
    const envTokens = [
      process.env.API_TOKEN,
      process.env.ADMIN_TOKEN,
      process.env.N8N_TOKEN
    ].filter(Boolean);

    envTokens.forEach(token => {
      if (token) {
        this.apiTokens.add(token);
        logger.info(`🔑 Environment token loaded: ${token.substring(0, 8)}...`);
      }
    });

    // Generate a default token if none exist
    if (this.apiTokens.size === 0) {
      const defaultToken = this.generateAPIToken();
      logger.warn(`⚠️ No tokens found in environment. Generated default token: ${defaultToken}`);
      logger.warn(`⚠️ Set API_TOKEN environment variable for production!`);
    }
  }

  // Validate API token
  static validateToken(token: string): boolean {
    if (!token) return false;
    return this.apiTokens.has(token);
  }

  // Check if IP is blocked due to too many failed attempts
  static isIPBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip);
  }

  // Record failed authentication attempt
  static recordFailedAttempt(ip: string): boolean {
    const now = Date.now();
    const attempt = this.ipAttempts.get(ip) || { count: 0, lastAttempt: 0 };

    // Reset counter if last attempt was more than 15 minutes ago
    if (now - attempt.lastAttempt > 15 * 60 * 1000) {
      attempt.count = 0;
    }

    attempt.count++;
    attempt.lastAttempt = now;
    this.ipAttempts.set(ip, attempt);

    // Block IP after 5 failed attempts
    if (attempt.count >= 5) {
      this.blockedIPs.add(ip);
      logger.warn(`🚫 IP blocked due to repeated failed attempts: ${ip}`);
      
      // Auto-unblock after 1 hour
      setTimeout(() => {
        this.blockedIPs.delete(ip);
        this.ipAttempts.delete(ip);
        logger.info(`✅ IP unblocked: ${ip}`);
      }, 60 * 60 * 1000);

      return true;
    }

    return false;
  }

  // Get all active tokens (for admin purposes)
  static getActiveTokens(): string[] {
    return Array.from(this.apiTokens).map(token => 
      `${token.substring(0, 8)}...${token.substring(token.length - 4)}`
    );
  }

  // Add a new token
  static addToken(token: string): void {
    this.apiTokens.add(token);
    logger.info(`🔑 New token added: ${token.substring(0, 8)}...`);
  }

  // Remove a token
  static removeToken(token: string): boolean {
    const removed = this.apiTokens.delete(token);
    if (removed) {
      logger.info(`🗑️ Token removed: ${token.substring(0, 8)}...`);
    }
    return removed;
  }

  // Get security stats
  static getSecurityStats() {
    return {
      activeTokens: this.apiTokens.size,
      blockedIPs: this.blockedIPs.size,
      ipAttempts: this.ipAttempts.size,
      failedAttempts: Array.from(this.ipAttempts.entries()).map(([ip, data]) => ({
        ip: ip.replace(/\d+$/, 'xxx'), // Mask last part of IP for privacy
        attempts: data.count,
        lastAttempt: new Date(data.lastAttempt).toISOString()
      }))
    };
  }
}

// Authentication middleware
export function authenticateToken(req: any, res: any, next: any) {
  const token = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

  // Check if IP is blocked
  if (SecurityManager.isIPBlocked(clientIP)) {
    logger.warn(`🚫 Blocked IP attempted access: ${clientIP}`);
    return res.status(403).json({
      success: false,
      error: 'IP address is temporarily blocked due to suspicious activity',
      code: 'IP_BLOCKED'
    });
  }

  // Validate token
  if (!SecurityManager.validateToken(token)) {
    // Record failed attempt
    const isBlocked = SecurityManager.recordFailedAttempt(clientIP);
    
    logger.warn(`🔐 Invalid token attempt from IP: ${clientIP}`);
    
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API token',
      code: 'INVALID_TOKEN',
      hint: 'Include X-API-Token header with valid token'
    });
  }

  // Token is valid, proceed
  req.clientIP = clientIP;
  req.authenticated = true;
  next();
}

// CORS configuration
export function getCorsOptions() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:5678', // N8N default
    'https://n8n.com',
    'https://app.n8n.cloud'
  ];

  return {
    origin: function (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
        callback(null, true);
      } else {
        logger.warn(`🚫 CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token'],
    maxAge: 86400 // 24 hours
  };
}