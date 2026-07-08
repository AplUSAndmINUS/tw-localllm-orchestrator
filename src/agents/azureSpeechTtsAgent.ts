import * as azureSpeech from '../cloud/azureSpeech';
import { getAgentProfile } from '../config/agentRegistry';
import logger from '../tools/logger';
import httpError from '../tools/httpError';
import { AgentResponse, AgentMetadata, AgentExecuteParams, Agent } from '../types';

const AGENT_NAME = 'AzureSpeechTTS';
const PROFILE = getAgentProfile(AGENT_NAME);
const MODEL = PROFILE.model;
const RUNTIME = PROFILE.runtime;
const INTENT = 'azure_tts';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const startMs = Date.now();

  try {
    if (!azureSpeech.isAvailable()) {
      throw httpError(503, 'Azure Speech is not configured — AZURE_SPEECH_API_KEY/AZURE_SPEECH_REGION missing', 'not_configured');
    }

    const text = params.text || params.prompt || '';
    if (!text) {
      throw httpError(400, 'No text provided for speech synthesis', 'bad_request');
    }
    const voice = params.voice || (params.options as Record<string, unknown>)?.voice as string || MODEL;

    const audioBuffer = await azureSpeech.synthesize(text, voice);
    const latencyMs = Date.now() - startMs;

    if (!audioBuffer) {
      throw httpError(502, 'Azure Speech synthesis service failed', 'upstream_error');
    }

    return {
      agent: AGENT_NAME,
      model: voice,
      intent: INTENT,
      runtime: RUNTIME,
      content: audioBuffer.toString('base64'),
      tokens: { input: text.length, output: audioBuffer.byteLength },
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('AzureSpeechTTS execute error', { error: error.message });
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
