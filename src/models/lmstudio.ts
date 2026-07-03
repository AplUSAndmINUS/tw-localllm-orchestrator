import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { LMStudioResponse, ServiceHealth, ChatMessage } from '../types';

function getBaseUrl(): string {
  try {
    const url = new URL(config.endpoints.lmstudio);
    return `${url.protocol}//${url.host}`;
  } catch {
    return config.endpoints.lmstudio;
  }
}

const baseUrl: string = getBaseUrl();

async function chat(messages: ChatMessage[], options: Record<string, unknown> = {}): Promise<LMStudioResponse | null> {
  try {
    const { data } = await axios.post(`${baseUrl}/v1/chat/completions`, {
      messages,
      ...options,
    });
    return data;
  } catch (err: unknown) {
    logger.error('LM Studio chat failed', { error: (err as Error).message });
    return null;
  }
}

async function getLoadedModel(): Promise<string | null> {
  try {
    const { data } = await axios.get(`${baseUrl}/v1/models`);
    const models = data.data || [];
    return models.length > 0 ? models[0].id : null;
  } catch (err: unknown) {
    logger.error('LM Studio getLoadedModel failed', { error: (err as Error).message });
    return null;
  }
}

async function isAvailable(): Promise<boolean> {
  const model = await getLoadedModel();
  return model !== null;
}

async function isModelLoaded(modelName: string): Promise<boolean> {
  const loaded = await getLoadedModel();
  if (!loaded) return false;
  return loaded.includes(modelName);
}

async function getHealth(): Promise<ServiceHealth> {
  const model = await getLoadedModel();
  return {
    healthy: model !== null,
    model,
    available: model !== null,
  };
}

export {
  chat,
  getLoadedModel,
  isAvailable,
  isModelLoaded,
  getHealth,
};
