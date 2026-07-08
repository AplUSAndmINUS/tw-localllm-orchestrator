import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { AzureResponse, AnthropicResponse, ChatMessage } from '../types';

const { endpoint: v1Endpoint, apiKey } = config.azure;

// config.azure.endpoint is the unified `.../openai/v1` base (what Azure AI Foundry
// shows as "endpoint" today). Audio routes (transcribe/tts) and the Claude Messages
// API don't live under that base — they need the plain resource root, and Claude
// additionally needs the `.services.ai.azure.com` host instead of `.openai.azure.com`.
const rootEndpoint = v1Endpoint.replace(/\/openai\/v1\/?$/, '');
const anthropicEndpoint = rootEndpoint.replace('.openai.azure.com', '.services.ai.azure.com');
const AUDIO_API_VERSION = '2024-10-21';

async function chat(model: string, messages: ChatMessage[], options: Record<string, unknown> = {}): Promise<AzureResponse | null> {
  try {
    const { data } = await axios.post(
      `${v1Endpoint}/chat/completions`,
      { model, messages, ...options },
      { headers: { 'api-key': apiKey } }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure chat failed', { model, error: (err as Error).message });
    return null;
  }
}

// Claude models on Azure use the native Anthropic Messages API, not the
// OpenAI-compatible chat/completions route — different host, auth header, and
// request/response shape entirely.
async function chatClaude(model: string, messages: ChatMessage[], options: Record<string, unknown> = {}): Promise<AnthropicResponse | null> {
  try {
    let system: string | undefined;
    const filtered: Array<{ role: string; content: unknown }> = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content as string;
      } else {
        filtered.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages: filtered,
      max_tokens: (options.max_tokens as number) || 1024,
    };
    if (system) body.system = system;

    const { data } = await axios.post(`${anthropicEndpoint}/anthropic/v1/messages`, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });

    return {
      content: (data.content || []).map((block: { text: string }) => block.text).join(''),
      model: data.model,
      usage: {
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
      },
    };
  } catch (err: unknown) {
    logger.error('Azure Claude chat failed', { model, error: (err as Error).message });
    return null;
  }
}

async function transcribe(audioBuffer: Buffer, model: string): Promise<Record<string, unknown> | null> {
  try {
    const FormData = (await import('form-data')).default || require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });

    const { data } = await axios.post(
      `${rootEndpoint}/openai/deployments/${model}/audio/transcriptions?api-version=${AUDIO_API_VERSION}`,
      form,
      {
        headers: {
          'api-key': apiKey,
          ...form.getHeaders(),
        },
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure transcribe failed', { model, error: (err as Error).message });
    return null;
  }
}

async function tts(text: string, model: string, voice: string = 'alloy'): Promise<Buffer | null> {
  try {
    const { data } = await axios.post(
      `${rootEndpoint}/openai/deployments/${model}/audio/speech?api-version=${AUDIO_API_VERSION}`,
      { input: text, voice },
      {
        headers: { 'api-key': apiKey },
        responseType: 'arraybuffer',
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure TTS failed', { model, error: (err as Error).message });
    return null;
  }
}

function isAvailable(): boolean {
  return Boolean(apiKey);
}

export {
  chat,
  chatClaude,
  transcribe,
  tts,
  isAvailable,
};
