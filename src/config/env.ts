export const env = {
  // JWT Secrets
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
  
  // Token TTLs (in seconds)
  ACCESS_TOKEN_TTL: parseInt(process.env.ACCESS_TOKEN_TTL || '900', 10), // 15 minutes
  REFRESH_TOKEN_TTL: parseInt(process.env.REFRESH_TOKEN_TTL || '2592000', 10), // 30 days
  
  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://app.kabin247.com',
  
  // Cookie settings
  // For development (localhost), don't set domain to allow cookies to work
  // For production, use .kabin247.com to work across subdomains
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || (process.env.NODE_ENV === 'production' ? '.kabin247.com' : undefined),
  // In development, Secure must be false for HTTP (localhost)
  // In production, Secure should be true for HTTPS
  COOKIE_SECURE: process.env.COOKIE_SECURE !== undefined 
    ? process.env.COOKIE_SECURE !== 'false' 
    : process.env.NODE_ENV === 'production',
  // For development, use 'none' to allow cross-origin POST requests (refresh endpoint)
  // Browsers allow SameSite=None with Secure=false on localhost
  // For production, use 'none' with Secure=true for cross-origin support
  COOKIE_SAME_SITE: (process.env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none') || 'none',
  
  // OTP Settings
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || '6', 10),
  
  // Invite Settings
  INVITE_EXPIRY_DAYS: parseInt(process.env.INVITE_EXPIRY_DAYS || '14', 10),
};

