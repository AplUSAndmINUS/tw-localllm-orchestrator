import config from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel: number = LEVELS[config.logging.level as LogLevel] ?? LEVELS.info;

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  if (config.logging.structured) {
    return JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta });
  }
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  if (LEVELS[level] < currentLevel) return;
  const formatted = formatMessage(level, message, meta);
  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export default {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
