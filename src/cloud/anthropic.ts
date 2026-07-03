import Anthropic from '@anthropic-ai/sdk';
import config from '../config';
import logger from '../tools/logger';
import { AnthropicResponse, ChatMessage } from '../types';

const { apiKey } = config.anthropic;

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!client && apiKey) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

async function chat(model: string, messages: ChatMessage[], options: Record<string, unknown> = {}): Promise<AnthropicResponse | null> {
  try {
    const sdk = getClient();
    if (!sdk) {
      logger.error('Anthropic client not initialized — API key missing');
      return null;
    }

    let system: string | undefined;
    const filtered: Array<{ role: string; content: string | unknown[] }> = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content as string;
      } else {
        filtered.push({ role: msg.role, content: msg.content });
      }
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      messages: filtered as Anthropic.MessageCreateParams['messages'],
      max_tokens: (options.max_tokens as number) || 1024,
      stream: false as const,
    };
    if (system) {
      params.system = system;
    }

    const response = await sdk.messages.create(params);

    return {
      content: (response.content as Array<{ text: string }>).map((block) => block.text).join(''),
      model: response.model,
      usage: response.usage,
    };
  } catch (err: unknown) {
    logger.error('Anthropic chat failed', { model, error: (err as Error).message });
    return null;
  }
}

function isAvailable(): boolean {
  return Boolean(apiKey);
}

export {
  chat,
  isAvailable,
};
