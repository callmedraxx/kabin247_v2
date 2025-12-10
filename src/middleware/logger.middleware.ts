import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const { method, originalUrl, ip, body, params, query } = req;

  // Prepare request data for logging (sanitize sensitive data if needed)
  const requestData: any = {};
  if (Object.keys(params).length > 0) {
    requestData.params = params;
  }
  if (Object.keys(query).length > 0) {
    requestData.query = query;
  }
  if (body && Object.keys(body).length > 0) {
    // Exclude sensitive fields or limit body size for large payloads
    const bodyCopy = { ...body };
    // Limit large arrays/objects in logs
    if (JSON.stringify(bodyCopy).length > 1000) {
      requestData.body = '[Body too large to log]';
    } else {
      requestData.body = bodyCopy;
    }
  }

  // Log incoming request
  Logger.info('📥 Incoming Request', {
    method,
    url: originalUrl,
    ip: ip || req.socket.remoteAddress,
    ...requestData,
  });

  // Capture response body by intercepting json() and send() methods
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let responseBody: any = null;

  res.json = function (body: any): Response {
    responseBody = body;
    return originalJson(body);
  };

  res.send = function (body: any): Response {
    // Try to parse if it's a JSON string
    if (typeof body === 'string') {
      try {
        responseBody = JSON.parse(body);
      } catch {
        responseBody = body;
      }
    } else {
      responseBody = body;
    }
    return originalSend(body);
  };

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any): Response {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    // Parse response body if it's a buffer/string
    let parsedResponseBody = responseBody;
    if (!parsedResponseBody && chunk) {
      try {
        if (Buffer.isBuffer(chunk)) {
          parsedResponseBody = chunk.toString('utf8');
          try {
            parsedResponseBody = JSON.parse(parsedResponseBody);
          } catch {
            // Not JSON, keep as string
          }
        } else if (typeof chunk === 'string') {
          try {
            parsedResponseBody = JSON.parse(chunk);
          } catch {
            parsedResponseBody = chunk;
          }
        }
      } catch (e) {
        parsedResponseBody = chunk;
      }
    }

    // Prepare response data for logging
    const responseData: any = {
      method,
      url: originalUrl,
      statusCode,
      duration: `${duration}ms`,
      ip: ip || req.socket.remoteAddress,
    };

    // Add response body (especially important for errors)
    if (parsedResponseBody) {
      // Limit response body size for large payloads
      const responseStr = JSON.stringify(parsedResponseBody);
      if (responseStr.length > 2000) {
        responseData.responseBody = '[Response too large to log]';
      } else {
        responseData.responseBody = parsedResponseBody;
      }
    }

    // Log based on status code
    if (statusCode >= 500) {
      Logger.error(`❌ ${statusCode} Server Error`, undefined, responseData);
    } else if (statusCode >= 400) {
      Logger.error(`⚠️  ${statusCode} Client Error`, undefined, responseData);
    } else if (statusCode >= 300) {
      Logger.info(`↪️  ${statusCode} Redirect`, responseData);
    } else if (statusCode >= 200) {
      Logger.info(`✅ ${statusCode} Success`, responseData);
    } else {
      Logger.info(`📤 ${statusCode} Response`, responseData);
    }

    // Call original end method
    originalEnd.call(this, chunk, encoding);
    return this;
  };

  next();
}

export function errorLogger(error: Error, req: Request, res: Response, next: NextFunction): void {
  const { method, originalUrl, ip, body, params, query } = req;

  Logger.error('💥 Unhandled Error in Request', error, {
    method,
    url: originalUrl,
    ip: ip || req.socket.remoteAddress,
    params: Object.keys(params).length > 0 ? params : undefined,
    query: Object.keys(query).length > 0 ? query : undefined,
    body: body && Object.keys(body).length > 0 ? body : undefined,
  });

  next(error);
}

