import * as azureSpeech from '../cloud/azureSpeech';
import { getAgentProfile } from '../config/agentRegistry';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, Agent } from '../types';

const AGENT_NAME = 'AzureSpeechSTT';
const PROFILE = getAgentProfile(AGENT_NAME);
const MODEL = PROFILE.model;
const RUNTIME = PROFILE.runtime;
const INTENT = 'azure_stt';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const startMs = Date.now();

  try {
    if (!azureSpeech.isAvailable()) {
      throw new Error('Azure Speech is not configured — AZURE_SPEECH_API_KEY/AZURE_SPEECH_REGION missing');
    }

    const audioInput = params.audioBuffer || params.audio;
    if (!audioInput) {
      throw new Error('No audio provided for speech-to-text');
    }
    const audioBuffer = typeof audioInput === 'string' ? Buffer.from(audioInput, 'base64') : audioInput;
    const language = (params.options as Record<string, unknown>)?.language as string || 'en-US';

    const text = await azureSpeech.transcribe(audioBuffer, language);
    const latencyMs = Date.now() - startMs;

    if (text === null) {
      throw new Error('Azure Speech transcribe returned null');
    }

    return {
      agent: AGENT_NAME,
      model: MODEL,
      intent: INTENT,
      runtime: RUNTIME,
      content: text,
      tokens: { input: 0, output: 0 },
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('AzureSpeechSTT execute error', { error: error.message });
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
