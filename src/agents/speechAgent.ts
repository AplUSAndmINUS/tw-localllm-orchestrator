import * as azure from '../cloud/azure';
import { getAgentProfile } from '../config/agentRegistry';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, Agent } from '../types';

const AGENT_NAME = 'SpeechAgent';
const PROFILE = getAgentProfile(AGENT_NAME);
const MODEL = PROFILE.model;
const RUNTIME = PROFILE.runtime;
const INTENT = 'speech_to_text';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const startMs = Date.now();

  try {
    if (!azure.isAvailable()) {
      throw new Error('Azure transcription is not configured — AZURE_OPENAI_API_KEY missing');
    }

    const audioInput = params.audioBuffer || params.audio;
    if (!audioInput) {
      throw new Error('No audio provided for speech-to-text');
    }
    const audioBuffer = typeof audioInput === 'string' ? Buffer.from(audioInput, 'base64') : audioInput;

    const result = await azure.transcribe(audioBuffer, MODEL);
    const latencyMs = Date.now() - startMs;

    if (!result) {
      throw new Error('Azure transcription returned null');
    }

    const text = (result as Record<string, unknown>).text;

    return {
      agent: AGENT_NAME,
      model: MODEL,
      intent: INTENT,
      runtime: RUNTIME,
      content: typeof text === 'string' ? text : JSON.stringify(result),
      tokens: { input: 0, output: 0 },
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('SpeechAgent execute error', { error: error.message });
    throw err;
  }
}

const metadata: AgentMetadata = {
  name: AGENT_NAME,
  intent: INTENT,
  runtime: RUNTIME,
  model: MODEL,
  capabilities: PROFILE.capabilities,
};

export { execute, metadata };
export default { execute, metadata } as Agent;
