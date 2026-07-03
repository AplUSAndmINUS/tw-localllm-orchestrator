import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { AzureResponse, ChatMessage } from '../types';

const { endpoint: azureEndpoint, apiKey, apiVersion } = config.azure;

async function chat(model: string, messages: ChatMessage[], options: Record<string, unknown> = {}): Promise<AzureResponse | null> {
  try {
    const { data } = await axios.post(
      `${azureEndpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`,
      { messages, ...options },
      { headers: { 'api-key': apiKey } }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure chat failed', { model, error: (err as Error).message });
    return null;
  }
}

async function transcribe(audioBuffer: Buffer, model: string = 'whisper-1'): Promise<Record<string, unknown> | null> {
  try {
    const FormData = (await import('form-data')).default || require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('model', model);

    const { data } = await axios.post(
      `${azureEndpoint}/openai/deployments/${model}/audio/transcriptions?api-version=${apiVersion}`,
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

async function tts(text: string, model: string = 'gpt-4o-mini-tts', voice: string = 'alloy'): Promise<Buffer | null> {
  try {
    const { data } = await axios.post(
      `${azureEndpoint}/openai/deployments/${model}/audio/speech?api-version=${apiVersion}`,
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
  transcribe,
  tts,
  isAvailable,
};
