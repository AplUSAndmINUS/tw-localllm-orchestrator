import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { ServiceHealth } from '../types';

const endpoint: string = config.endpoints.xtts;

interface XttsSynthesizeOptions {
  language?: string;
  voiceRef?: string;
}

async function synthesize(text: string, options: XttsSynthesizeOptions = {}): Promise<Buffer | null> {
  try {
    const { data } = await axios.post(
      `${endpoint}/tts`,
      {
        text,
        language: options.language || 'en',
        speaker_wav: options.voiceRef || '',
      },
      { responseType: 'arraybuffer' }
    );
    return data;
  } catch (err: unknown) {
    logger.error('XTTS synthesize failed', { error: (err as Error).message });
    return null;
  }
}

async function getHealth(): Promise<ServiceHealth> {
  try {
    await axios.get(`${endpoint}/health`);
    return { healthy: true };
  } catch (err: unknown) {
    logger.error('XTTS health check failed', { error: (err as Error).message });
    return { healthy: false };
  }
}

export {
  synthesize,
  getHealth,
};
