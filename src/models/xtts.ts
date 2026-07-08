import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import config from '../config';
import logger from '../tools/logger';
import { ServiceHealth } from '../types';

const endpoint: string = config.endpoints.xtts;
const voicesPath: string = config.xtts.voicesPath;

interface XttsSynthesizeOptions {
  language?: string;
  voiceRef?: string;
}

interface SpeakerProfile {
  speaker_embedding: number[];
  gpt_cond_latent: number[][];
}

const VOICE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

let studioSpeakersCache: Record<string, SpeakerProfile> | null = null;
const clonedSpeakerCache = new Map<string, SpeakerProfile>();

async function getStudioSpeakers(): Promise<Record<string, SpeakerProfile>> {
  if (studioSpeakersCache) return studioSpeakersCache;
  const { data } = await axios.get(`${endpoint}/studio_speakers`);
  studioSpeakersCache = data;
  return data;
}

async function cloneSpeaker(wavPath: string): Promise<SpeakerProfile> {
  const form = new FormData();
  form.append('wav_file', fs.createReadStream(wavPath), path.basename(wavPath));
  const { data } = await axios.post(`${endpoint}/clone_speaker`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return data;
}

function localVoicePaths(name: string): { wav: string; cache: string } {
  return {
    wav: path.join(voicesPath, `${name}.wav`),
    cache: path.join(voicesPath, `${name}.json`),
  };
}

// Reference clips live in docker/config/voices/<name>.wav (gitignored).
// The first synthesize() for a given name clones it via /clone_speaker and
// caches the resulting embedding as <name>.json so future calls skip the clone step.
async function resolveLocalVoice(name: string): Promise<SpeakerProfile | null> {
  if (!VOICE_NAME_PATTERN.test(name)) return null;

  const cached = clonedSpeakerCache.get(name);
  if (cached) return cached;

  const { wav, cache } = localVoicePaths(name);

  if (fs.existsSync(cache)) {
    const profile: SpeakerProfile = JSON.parse(fs.readFileSync(cache, 'utf-8'));
    clonedSpeakerCache.set(name, profile);
    return profile;
  }

  if (fs.existsSync(wav)) {
    logger.info('Cloning XTTS voice from reference sample', { name, wav });
    const profile = await cloneSpeaker(wav);
    fs.writeFileSync(cache, JSON.stringify(profile));
    clonedSpeakerCache.set(name, profile);
    return profile;
  }

  return null;
}

async function resolveSpeaker(voiceRef?: string): Promise<SpeakerProfile> {
  if (voiceRef) {
    const local = await resolveLocalVoice(voiceRef);
    if (local) return local;

    const studio = await getStudioSpeakers();
    if (studio[voiceRef]) return studio[voiceRef];

    logger.warn('Requested XTTS voice not found locally or in studio speakers, falling back to default', { voiceRef });
  }

  const studio = await getStudioSpeakers();
  const names = Object.keys(studio);
  if (names.length === 0) {
    throw new Error('XTTS server has no studio speakers available and no local voice matched');
  }
  return studio[names[0]];
}

async function synthesize(text: string, options: XttsSynthesizeOptions = {}): Promise<Buffer | null> {
  try {
    const speaker = await resolveSpeaker(options.voiceRef);

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
