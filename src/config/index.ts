import path from 'path';
import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function resolveEndpoint(envKey: string, tailscaleHost: string, port: string): string {
  const override = process.env[envKey];
  if (override && !override.includes('${')) return override;
  return `http://${tailscaleHost}:${port}`;
}

const tailscaleHost: string = (process.env.APLUS_TAILSCALE_HOST || 'localhost').replace(/^https?:\/\//, '');

const config: AppConfig = {
  server: {
    port: parseInt(process.env.APLUS_ORCHESTRATOR_PORT || '3200', 10),
    host: process.env.APLUS_ORCHESTRATOR_HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },

  tailscaleHost,

  endpoints: {
    ollama: resolveEndpoint('APLUS_OLLAMA_ENDPOINT', tailscaleHost, process.env.APLUS_OLLAMA_PORT || '11434'),
    lmstudio: resolveEndpoint('APLUS_LMSTUDIO_ENDPOINT', tailscaleHost, process.env.APLUS_LMSTUDIO_PORT || '12349'),
    xtts: resolveEndpoint('APLUS_XTTS_ENDPOINT', tailscaleHost, process.env.APLUS_XTTS_PORT || '5002'),
    onnx: resolveEndpoint('APLUS_ONNX_ENDPOINT', tailscaleHost, process.env.APLUS_ONNX_PORT || '8001'),
    chromadb: resolveEndpoint('APLUS_CHROMADB_ENDPOINT', tailscaleHost, process.env.APLUS_CHROMADB_PORT || '8000'),
  },

  ollama: {
    entryModel: process.env.APLUS_OLLAMA_ENTRY_MODEL || 'phi4-mini:latest',
    pullTimeout: parseInt(process.env.APLUS_OLLAMA_PULL_TIMEOUT || '300000', 10),
  },

  lmstudio: {
    healthCheckInterval: parseInt(process.env.APLUS_LMSTUDIO_HEALTH_CHECK_INTERVAL || '30000', 10),
    allowFallback: process.env.APLUS_LMSTUDIO_ALLOW_FALLBACK !== 'false',
  },

  azure: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
    apiKey: process.env.AZURE_OPENAI_API_KEY || '',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },

  rateLimit: {
    maxRequests: parseInt(process.env.APLUS_RATE_LIMIT_REQUESTS || '60', 10),
    windowMs: parseInt(process.env.APLUS_RATE_LIMIT_WINDOW_MS || '60000', 10),
  },

  cors: {
    origins: (process.env.APLUS_CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim()),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    structured: process.env.APLUS_STRUCTURED_LOGGING === 'true',
  },
};

export default config;
