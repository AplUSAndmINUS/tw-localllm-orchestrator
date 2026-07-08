import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { AzureResponse, ChatMessage } from '../types';

const { gatewayUrl, apiKey } = config.wynet;

function authHeader(): string {
  return 'Bearer ' + apiKey;
}

async function chat(
  model: string,
  messages: ChatMessage[],
  options: Record<string, unknown> = {}
): Promise<AzureResponse | null> {
  try {
    const { data } = await axios.post(
      gatewayUrl + '/chat/completions',
      { model, messages, ...options },
      {
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/json',
        },
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('WYNet gateway chat failed', { model, error: (err as Error).message });
    return null;
  }
}

async function transcribe(
  audioBuffer: Buffer,
  model: string
): Promise<Record<string, unknown> | null> {
  try {
    const FormData = (await import('form-data')).default || require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('model', model);

    const { data } = await axios.post(
      gatewayUrl + '/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: authHeader(),
          ...form.getHeaders(),
        },
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('WYNet gateway transcribe failed', { model, error: (err as Error).message });
    return null;
  }
}

async function tts(
  text: string,
  model: string,
  voice: string = 'alloy'
): Promise<Buffer | null> {
  try {
    const { data } = await axios.post(
      gatewayUrl + '/audio/speech',
      { input: text, model, voice },
      {
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('WYNet gateway TTS failed', { model, error: (err as Error).message });
    return null;
  }
}

function isAvailable(): boolean {
  return Boolean(gatewayUrl && apiKey);
}

export { chat, transcribe, tts, isAvailable };
