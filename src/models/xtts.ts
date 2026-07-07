import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { ServiceHealth } from '../types';

const endpoint: string = config.endpoints.xtts;

interface XttsSynthesizeOptions {
  language?: string;
  voiceRef?: string;
}

interface StudioSpeaker {
  speaker_embedding: number[];
  gpt_cond_latent: number[][];
}

let studioSpeakersCache: Record<string, StudioSpeaker> | null = null;

async function getStudioSpeakers(): Promise<Record<string, StudioSpeaker>> {
  if (studioSpeakersCache) return studioSpeakersCache;
  const { data } = await axios.get(`${endpoint}/studio_speakers`);
  studioSpeakersCache = data;
  return data;
}

async function synthesize(text: string, options: XttsSynthesizeOptions = {}): Promise<Buffer | null> {
  try {
    const speakers = await getStudioSpeakers();
    const names = Object.keys(speakers);
    if (names.length === 0) {
      throw new Error('XTTS server has no studio speakers available');
    }
    const speaker = (options.voiceRef && speakers[options.voiceRef]) || speakers[names[0]];

    const { data } = await axios.post(`${endpoint}/tts`, {
      text,
      language: options.language || 'en',
      speaker_embedding: speaker.speaker_embedding,
      gpt_cond_latent: speaker.gpt_cond_latent,
    });

    return Buffer.from(data, 'base64');
  } catch (err: unknown) {
    logger.error('XTTS synthesize failed', { error: (err as Error).message });
    return null;
  }
}

async function getHealth(): Promise<ServiceHealth> {
  try {
    await axios.get(`${endpoint}/languages`);
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
