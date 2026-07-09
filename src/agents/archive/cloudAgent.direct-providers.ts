import * as azure from '../../cloud/azure';
import * as anthropic from '../../cloud/anthropic';
import logger from '../../tools/logger';
import httpError from '../../tools/httpError';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, CloudRoute, CloudRouteMap, AzureResponse, AnthropicResponse, TokenUsage } from '../../types';

const AGENT_NAME = 'CloudAgent';
const RUNTIME = 'cloud';
const INTENT = 'cloud';

// Anthropic direct API is intentionally not a default route here — it's only
// used when explicitly requested elsewhere, not auto-selected by the orchestrator.
const CLOUD_ROUTES: CloudRouteMap = {
  heavy_reasoning:    { provider: 'azure',     model: 'claude-opus-4-8' },
  fallback_reasoning: { provider: 'azure',     model: 'gpt-4.1' },
  vision:             { provider: 'azure',     model: 'gpt-4o' },
  design:             { provider: 'anthropic', model: 'claude-3-sonnet-20250514' },
  cowork:             { provider: 'azure',     model: 'claude-opus-4-8' },
  major_code:         { provider: 'azure',     model: 'claude-opus-4-8' },
  creative:           { provider: 'anthropic', model: 'claude-3-haiku-20250307' },
  mid_reasoning:      { provider: 'azure',     model: 'Phi-4-reasoning' },
  stt:                { provider: 'azure',     model: 'gpt-4o-transcribe-diarize' },
  tts:                { provider: 'azure',     model: 'gpt-4o-mini-tts' },
};

function getRoute(cloudIntent: string): CloudRoute {
  const route = CLOUD_ROUTES[cloudIntent];
  if (!route) {
    throw httpError(400, `Unknown cloud intent: ${cloudIntent}. Valid intents: ${Object.keys(CLOUD_ROUTES).join(', ')}`, 'bad_request');
  }
  return route;
}

// Claude models deployed on Azure speak the native Anthropic Messages API
// (different host/auth/response shape), not the OpenAI-compatible route every
// other Azure model uses — so routing has to key off the model, not just the provider.
function isClaudeModel(model: string): boolean {
  return model.startsWith('claude');
}

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { messages = [], prompt, cloudIntent = 'mid_reasoning', options = {} } = params;
  const startMs = Date.now();

  try {
    const route = getRoute(cloudIntent);
    const { provider, model } = route;
    const useAnthropicShape = provider === 'anthropic' || isClaudeModel(model);

    if (cloudIntent === 'stt') {
      if (!azure.isAvailable()) {
        throw httpError(503, 'Azure not configured — API key missing', 'not_configured');
      }
      const audioBuffer = params.audioBuffer || params.audio;
      if (!audioBuffer) {
        throw httpError(400, 'No audio buffer provided for STT', 'bad_request');
      }
      const buf = typeof audioBuffer === 'string' ? Buffer.from(audioBuffer, 'base64') : audioBuffer as Buffer;
      const result = await azure.transcribe(buf, model);
      const latencyMs = Date.now() - startMs;

      if (!result) {
        throw httpError(502, 'Azure transcription service failed', 'upstream_error');
      }

      const sttText = (result as Record<string, unknown>).text;

      return {
        agent: AGENT_NAME,
        model,
        intent: INTENT,
        runtime: 'cloud_azure',
        content: typeof sttText === 'string' ? sttText : JSON.stringify(result),
        tokens: { input: 0, output: 0 },
        latency_ms: latencyMs,
        cached: false,
      };
    }

    if (cloudIntent === 'tts') {
      if (!azure.isAvailable()) {
        throw httpError(503, 'Azure not configured — API key missing', 'not_configured');
      }
      const text = params.text || prompt || '';
      const voice = params.voice || (options as Record<string, unknown>).voice as string || 'alloy';
      const audioBuffer = await azure.tts(text, model, voice);
      const latencyMs = Date.now() - startMs;

      if (!audioBuffer) {
        throw httpError(502, 'Azure TTS service failed', 'upstream_error');
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

    let response: AzureResponse | AnthropicResponse | null;
    if (provider === 'anthropic') {
      response = await anthropic.chat(model, chatMessages, options);
    } else if (isClaudeModel(model)) {
      response = await azure.chatClaude(model, chatMessages, options);
    } else {
      response = await azure.chat(model, chatMessages, options);
    }
    const latencyMs = Date.now() - startMs;

    if (!response) {
      throw httpError(502, `${provider} returned null response`, 'upstream_error');
    }

    let content: string;
    let tokens: TokenUsage;

    if (useAnthropicShape) {
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
