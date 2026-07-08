import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';

const { apiKey, region } = config.azureSpeech;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function synthesize(text: string, voice: string = 'en-US-GuyNeural'): Promise<Buffer | null> {
  try {
    const ssml = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' name='${voice}'>${escapeXml(text)}</voice></speak>`;

    const { data } = await axios.post(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      ssml,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
          'User-Agent': 'tw-localllm-orchestrator',
        },
        responseType: 'arraybuffer',
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure Speech synthesize failed', { error: (err as Error).message });
    return null;
  }
}

async function transcribe(audioBuffer: Buffer, language: string = 'en-US'): Promise<string | null> {
  try {
    const { data } = await axios.post(
      `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
      audioBuffer,
      {
        params: { language },
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        },
      }
    );
    return data.DisplayText || null;
  } catch (err: unknown) {
    logger.error('Azure Speech transcribe failed', { error: (err as Error).message });
    return null;
  }
}

async function listVoices(): Promise<Array<Record<string, unknown>> | null> {
  try {
    const { data } = await axios.get(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure Speech listVoices failed', { error: (err as Error).message });
    return null;
  }
}

async function listCnvProjects(): Promise<Array<Record<string, unknown>> | null> {
  try {
    const { data } = await axios.get(
      `https://${region}.api.cognitive.microsoft.com/customvoice/projects?api-version=2024-02-01-preview`,
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
    );
    return data.value || [];
  } catch (err: unknown) {
    logger.error('Azure Speech listCnvProjects failed', { error: (err as Error).message });
    return null;
  }
}

// Custom voice synthesis uses a *different* subdomain (voice., not tts.) and
// passes the deployment as a query param, not a header — confirmed via Microsoft's
// docs, but not yet exercised live since no custom voice has been trained/deployed.
async function synthesizeCustomVoice(text: string, deploymentId: string, voiceName: string): Promise<Buffer | null> {
  try {
    const ssml = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' name='${voiceName}'>${escapeXml(text)}</voice></speak>`;

    const { data } = await axios.post(
      `https://${region}.voice.speech.microsoft.com/cognitiveservices/v1?deploymentId=${encodeURIComponent(deploymentId)}`,
      ssml,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
          'User-Agent': 'tw-localllm-orchestrator',
        },
        responseType: 'arraybuffer',
      }
    );
    return data;
  } catch (err: unknown) {
    logger.error('Azure Speech synthesizeCustomVoice failed', { deploymentId, error: (err as Error).message });
    return null;
  }
}

function isAvailable(): boolean {
  return Boolean(apiKey && region);
}

export {
  synthesize,
  transcribe,
  listVoices,
  listCnvProjects,
  synthesizeCustomVoice,
  isAvailable,
};
