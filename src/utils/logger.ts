export enum LogLevel {
  INFO = 'INFO',
  ERROR = 'ERROR',
  WARN = 'WARN',
  DEBUG = 'DEBUG',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  method?: string;
  url?: string;
  statusCode?: number;
  error?: any;
  duration?: number | string;
  ip?: string;
}

function formatLogEntry(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();
  const parts: string[] = [];
  
  // Format status code prominently
  let statusCodeStr = '';
  if (entry.statusCode !== undefined) {
    if (entry.statusCode >= 500) {
      statusCodeStr = `[${entry.statusCode}] 🔴`;
    } else if (entry.statusCode >= 400) {
      statusCodeStr = `[${entry.statusCode}] 🟠`;
    } else if (entry.statusCode >= 300) {
      statusCodeStr = `[${entry.statusCode}] 🟡`;
    } else if (entry.statusCode >= 200) {
      statusCodeStr = `[${entry.statusCode}] 🟢`;
    } else {
      statusCodeStr = `[${entry.statusCode}]`;
    }
  }

  // Build header line
  const headerParts = [
    `[${timestamp}]`,
    `[${entry.level}]`,
  ];
  
  if (statusCodeStr) {
    headerParts.push(statusCodeStr);
  }

  if (entry.method && entry.url) {
    headerParts.push(`${entry.method} ${entry.url}`);
  }

  if (entry.duration !== undefined) {
    const durationStr = typeof entry.duration === 'string' ? entry.duration : `${entry.duration}ms`;
    headerParts.push(`(${durationStr})`);
  }

  if (entry.ip) {
    headerParts.push(`IP: ${entry.ip}`);
  }

  parts.push(headerParts.join(' '));
  parts.push(`📝 ${entry.message}`);

  // Include additional data fields (excluding already handled standard fields)
  const standardFields = ['timestamp', 'level', 'message', 'method', 'url', 'statusCode', 'duration', 'ip', 'error'];
  const dataFields: any = {};
  
  for (const key in entry) {
    if (!standardFields.includes(key) && (entry as any)[key] !== undefined) {
      dataFields[key] = (entry as any)[key];
    }
  }

  if (Object.keys(dataFields).length > 0) {
    // Format data nicely, but limit rowData size if it's too large
    const formattedData: any = {};
    for (const key in dataFields) {
      if (key === 'rowData' && dataFields[key] && typeof dataFields[key] === 'object') {
        // Limit rowData to first 10 keys to avoid huge logs
        const rowData = dataFields[key];
        const keys = Object.keys(rowData);
        if (keys.length > 10) {
          formattedData[key] = `{${keys.slice(0, 10).join(', ')}, ... (${keys.length} total keys)}`;
        } else {
          formattedData[key] = rowData;
        }
      } else {
        formattedData[key] = dataFields[key];
      }
    }
    parts.push(`\n📦 Data:\n${JSON.stringify(formattedData, null, 2)}`);
  }

  if (entry.error) {
    parts.push(`\n❌ Error Details:`);
    if (entry.error instanceof Error) {
      parts.push(`   Message: ${entry.error.message}`);
      if (entry.error.stack && process.env.NODE_ENV === 'development') {
        parts.push(`   Stack:\n${entry.error.stack.split('\n').map(line => `   ${line}`).join('\n')}`);
      }
    } else {
      parts.push(`   ${JSON.stringify(entry.error, null, 2).split('\n').map(line => `   ${line}`).join('\n')}`);
    }
  }

  return parts.join('\n');
}

export class Logger {
  static log(level: LogLevel, message: string, data?: Partial<LogEntry>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };

    const logMessage = formatLogEntry(entry);
    const separator = '─'.repeat(80);

    switch (level) {
      case LogLevel.ERROR:
        console.error(`\n${separator}\n${logMessage}\n${separator}\n`);
        break;
      case LogLevel.WARN:
        console.warn(`\n${separator}\n${logMessage}\n${separator}\n`);
        break;
      case LogLevel.DEBUG:
        if (process.env.NODE_ENV === 'development') {
          console.debug(`\n${separator}\n${logMessage}\n${separator}\n`);
        }
        break;
      default:
        console.log(`\n${separator}\n${logMessage}\n${separator}\n`);
    }
  }

  static info(message: string, data?: Partial<LogEntry>): void {
    this.log(LogLevel.INFO, message, data);
  }

  static error(message: string, error?: any, data?: Partial<LogEntry>): void {
    this.log(LogLevel.ERROR, message, { ...data, error });
  }

  static warn(message: string, data?: Partial<LogEntry>): void {
    this.log(LogLevel.WARN, message, data);
  }

  static debug(message: string, data?: Partial<LogEntry>): void {
    this.log(LogLevel.DEBUG, message, data);
  }
}

