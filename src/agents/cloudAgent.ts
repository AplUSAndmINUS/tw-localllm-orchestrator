import * as azure from '../cloud/azure';
import * as anthropic from '../cloud/anthropic';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, CloudRoute, CloudRouteMap, AzureResponse, AnthropicResponse, TokenUsage } from '../types';

const AGENT_NAME = 'CloudAgent';
const RUNTIME = 'cloud';
const INTENT = 'cloud';

const CLOUD_ROUTES: CloudRouteMap = {
  heavy_reasoning:    { provider: 'anthropic', model: 'claude-3-opus-20250219' },
  fallback_reasoning: { provider: 'azure',     model: 'gpt-4.1' },
  vision:             { provider: 'azure',     model: 'gpt-4o' },
  design:             { provider: 'anthropic', model: 'claude-3-sonnet-20250514' },
  cowork:             { provider: 'anthropic', model: 'claude-3-opus-20250219' },
  major_code:         { provider: 'anthropic', model: 'claude-3-opus-20250219' },
  creative:           { provider: 'anthropic', model: 'claude-3-haiku-20250307' },
  mid_reasoning:      { provider: 'anthropic', model: 'claude-3-sonnet-20250514' },
  stt:                { provider: 'azure',     model: 'gpt-4o-transcribe-diarize' },
  tts:                { provider: 'azure',     model: 'gpt-4o-mini-tts' },
};

function getRoute(cloudIntent: string): CloudRoute {
  const route = CLOUD_ROUTES[cloudIntent];
  if (!route) {
    throw new Error(`Unknown cloud intent: ${cloudIntent}. Valid intents: ${Object.keys(CLOUD_ROUTES).join(', ')}`);
  }
  return route;
}

function getClient(provider: string): typeof azure | typeof anthropic {
  if (provider === 'anthropic') return anthropic;
  if (provider === 'azure') return azure;
  throw new Error(`Unknown cloud provider: ${provider}`);
}

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { messages = [], prompt, cloudIntent = 'mid_reasoning', options = {} } = params;
  const startMs = Date.now();

  try {
    const route = getRoute(cloudIntent);
    const { provider, model } = route;
    const client = getClient(provider);

    if (cloudIntent === 'stt') {
      if (!azure.isAvailable()) {
        throw new Error('Azure not configured — API key missing');
      }
      const audioBuffer = params.audioBuffer || params.audio;
      if (!audioBuffer) {
        throw new Error('No audio buffer provided for STT');
      }
      const buf = typeof audioBuffer === 'string' ? Buffer.from(audioBuffer, 'base64') : audioBuffer as Buffer;
      const result = await azure.transcribe(buf, model);
      const latencyMs = Date.now() - startMs;

      if (!result) {
        throw new Error('Azure transcription returned null');
      }

      return {
        agent: AGENT_NAME,
        model,
        intent: INTENT,
        runtime: 'cloud_azure',
        content: (result as Record<string, unknown>).text as string || JSON.stringify(result),
        tokens: { input: 0, output: 0 },
        latency_ms: latencyMs,
        cached: false,
      };
    }

    if (cloudIntent === 'tts') {
      if (!azure.isAvailable()) {
        throw new Error('Azure not configured — API key missing');
      }
      const text = params.text || prompt || '';
      const voice = params.voice || (options as Record<string, unknown>).voice as string || 'alloy';
      const audioBuffer = await azure.tts(text, model, voice);
      const latencyMs = Date.now() - startMs;

      if (!audioBuffer) {
        throw new Error('Azure TTS returned null');
      }

      return {
        agent: AGENT_NAME,
        model,
        intent: INTENT,
        runtime: 'cloud_azure',
        content: Buffer.from(audioBuffer).toString('base64'),
        tokens: { input: text.length, output: (audioBuffer as Buffer).byteLength },
        latency_ms: latencyMs,
        cached: false,
      };
    }

    const chatMessages: ChatMessage[] = messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt || '' }];

    const response = await client.chat(model, chatMessages, options);
    const latencyMs = Date.now() - startMs;

    if (!response) {
      throw new Error(`${provider} returned null response`);
    }

    let content: string;
    let tokens: TokenUsage;

    if (provider === 'anthropic') {
      const anthResponse = response as AnthropicResponse;
      content = anthResponse.content || '';
      tokens = {
        input: anthResponse.usage?.input_tokens || 0,
        output: anthResponse.usage?.output_tokens || 0,
      };
    } else {
      const azResponse = response as AzureResponse;
      content = azResponse.choices?.[0]?.message?.content || '';
      tokens = {
        input: azResponse.usage?.prompt_tokens || 0,
        output: azResponse.usage?.completion_tokens || 0,
      };
    }

    return {
      agent: AGENT_NAME,
      model,
      intent: INTENT,
      runtime: `cloud_${provider}`,
      content,
      tokens,
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('CloudAgent execute error', { cloudIntent, error: error.message });
    throw err;
  }
}

const metadata: AgentMetadata = {
  name: AGENT_NAME,
  intent: INTENT,
  runtime: RUNTIME,
  model: 'dynamic',
  capabilities: [
    'cloud_reasoning', 'cloud_vision', 'cloud_coding', 'cloud_creative',
    'cloud_stt', 'cloud_tts', 'cloud_design', 'cloud_cowork',
  ],
};

export { execute, metadata, CLOUD_ROUTES };
export default { execute, metadata, CLOUD_ROUTES } as Agent & { CLOUD_ROUTES: CloudRouteMap };
