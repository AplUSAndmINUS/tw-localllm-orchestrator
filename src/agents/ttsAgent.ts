import * as xtts from '../models/xtts';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, Agent } from '../types';

const AGENT_NAME = 'TTSAgent';
const MODEL = 'xtts-v2';
const RUNTIME = 'xtts';
const INTENT = 'text_to_speech';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { text, language, voiceRef, options = {} } = params;
  const startMs = Date.now();

  try {
    if (!text) {
      throw new Error('No text provided for speech synthesis');
    }

    const audioBuffer: Buffer | null = await xtts.synthesize(text, {
      language: language || (options as Record<string, unknown>).language as string || 'en',
      voiceRef: voiceRef || (options as Record<string, unknown>).voiceRef as string || '',
    });
    const latencyMs = Date.now() - startMs;

    if (!audioBuffer) {
      throw new Error('XTTS returned null response');
    }

    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return {
      agent: AGENT_NAME,
      model: MODEL,
      intent: INTENT,
      runtime: RUNTIME,
      content: base64Audio,
      tokens: { input: text.length, output: audioBuffer.byteLength },
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('TTSAgent execute error', { error: error.message });
    throw err;
  }
}

const metadata: AgentMetadata = {
  name: AGENT_NAME,
  intent: INTENT,
  runtime: RUNTIME,
  model: MODEL,
  capabilities: ['text_to_speech', 'voice_synthesis', 'audio_generation'],
};

export { execute, metadata };
export default { execute, metadata } as Agent;
