import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { OllamaResponse, OllamaModel, ServiceHealth, ChatMessage } from '../types';

const endpoint: string = config.endpoints.ollama;

async function generate(model: string, prompt: string, options: Record<string, unknown> = {}): Promise<OllamaResponse | null> {
  try {
    const { data } = await axios.post(`${endpoint}/api/generate`, {
      model,
      prompt,
      stream: false,
      ...options,
    });
    return data;
  } catch (err: unknown) {
    logger.error('Ollama generate failed', { model, error: (err as Error).message });
    return null;
  }
}

async function chat(model: string, messages: ChatMessage[], options: Record<string, unknown> = {}): Promise<OllamaResponse | null> {
  try {
    const { data } = await axios.post(`${endpoint}/api/chat`, {
      model,
      messages,
      stream: false,
      ...options,
    });
    return data;
  } catch (err: unknown) {
    logger.error('Ollama chat failed', { model, error: (err as Error).message });
    return null;
  }
}

async function listModels(): Promise<OllamaModel[]> {
  try {
    const { data } = await axios.get(`${endpoint}/api/tags`);
    return data.models || [];
  } catch (err: unknown) {
    logger.error('Ollama listModels failed', { error: (err as Error).message });
    return [];
  }
}

async function pullModel(model: string): Promise<boolean> {
  try {
    logger.info('Pulling Ollama model', { model });
    await axios.post(
      `${endpoint}/api/pull`,
      { name: model, stream: false },
      { timeout: config.ollama.pullTimeout }
    );
    logger.info('Ollama model pulled successfully', { model });
    return true;
  } catch (err: unknown) {
    logger.error('Ollama pullModel failed', { model, error: (err as Error).message });
    return false;
  }
}

async function isModelAvailable(model: string): Promise<boolean> {
  const models = await listModels();
  return models.some((m) => m.name && m.name.includes(model));
}

async function ensureModel(model: string): Promise<boolean> {
  if (await isModelAvailable(model)) {
    return true;
  }
  return pullModel(model);
}

async function getHealth(): Promise<ServiceHealth> {
  try {
    const { data } = await axios.get(`${endpoint}/api/tags`);
    const models = (data.models || []).map((m: OllamaModel) => m.name);
    return { healthy: true, models };
  } catch (err: unknown) {
    logger.error('Ollama health check failed', { error: (err as Error).message });
    return { healthy: false, models: [] };
  }
}

export {
  generate,
  chat,
  listModels,
  pullModel,
  isModelAvailable,
  ensureModel,
  getHealth,
};
