import * as wynet from '../cloud/wynet';
import * as ollama from '../models/ollama';
import logger from '../tools/logger';
import httpError from '../tools/httpError';
import config from '../config';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, CloudRoute, CloudRouteMap, AzureResponse, TokenUsage } from '../types';

const AGENT_NAME = 'CloudAgent';
const RUNTIME = 'cloud';
const INTENT = 'cloud';

const CLOUD_ROUTES: CloudRouteMap = {
  heavy_reasoning:    { provider: 'wynet', model: 'claude-opus-4-8' },
  fallback_reasoning: { provider: 'wynet', model: 'gpt-4.1' },
  vision:             { provider: 'wynet', model: 'gpt-4o' },
  design:             { provider: 'wynet', model: 'claude-3-sonnet-20250514' },
  cowork:             { provider: 'wynet', model: 'claude-opus-4-8' },
  major_code:         { provider: 'wynet', model: 'claude-opus-4-8' },
  creative:           { provider: 'wynet', model: 'claude-3-haiku-20250307' },
  mid_reasoning:      { provider: 'wynet', model: 'Phi-4-reasoning' },
  stt:                { provider: 'wynet', model: 'gpt-4o-transcribe-diarize' },
  tts:                { provider: 'wynet', model: 'gpt-4o-mini-tts' },
};

function getRoute(cloudIntent: string): CloudRoute {
  const route = CLOUD_ROUTES[cloudIntent];
  if (!route) {
    throw httpError(400, `Unknown cloud intent: ${cloudIntent}. Valid intents: ${Object.keys(CLOUD_ROUTES).join(', ')}`, 'bad_request');
  }
  return route;
}

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { messages = [], prompt, cloudIntent = 'mid_reasoning', options = {} } = params;
  const startMs = Date.now();

  try {
    if (!wynet.isAvailable()) {
      throw httpError(503, 'WYNet gateway is not configured — WYNET_AI_GATEWAY_TOKEN missing', 'not_configured');
    }

    const route = getRoute(cloudIntent);
    const { model } = route;

    if (cloudIntent === 'stt') {
      const audioBuffer = params.audioBuffer || params.audio;
      if (!audioBuffer) {
        throw httpError(400, 'No audio buffer provided for STT', 'bad_request');
      }
      const buf = typeof audioBuffer === 'string' ? Buffer.from(audioBuffer, 'base64') : audioBuffer as Buffer;
      const result = await wynet.transcribe(buf, model);
      const latencyMs = Date.now() - startMs;

      if (!result) {
        logger.warn('WYNet gateway STT failed — no local fallback available for audio transcription', { model });
        throw httpError(502, `WYNet gateway STT failed for model '${model}' — check gateway configuration and connectivity`, 'upstream_error');
      }

      const sttText = (result as Record<string, unknown>).text;

      return {
        agent: AGENT_NAME,
        model,
        intent: INTENT,
        runtime: 'cloud_wynet',
        content: typeof sttText === 'string' ? sttText : JSON.stringify(result),
        tokens: { input: 0, output: 0 },
        latency_ms: latencyMs,
        cached: false,
      };
    }

    if (cloudIntent === 'tts') {
      const text = params.text || prompt || '';
      const voice = params.voice || (options as Record<string, unknown>).voice as string || 'alloy';
      const audioBuffer = await wynet.tts(text, model, voice);
      const latencyMs = Date.now() - startMs;

      if (!audioBuffer) {
        logger.warn('WYNet gateway TTS failed — no local fallback available for audio synthesis', { model });
        throw httpError(502, `WYNet gateway TTS failed for model '${model}' — check gateway configuration and connectivity`, 'upstream_error');
      }

      return {
        agent: AGENT_NAME,
        model,
        intent: INTENT,
        runtime: 'cloud_wynet',
        content: Buffer.from(audioBuffer).toString('base64'),
        tokens: { input: text.length, output: (audioBuffer as Buffer).byteLength },
        latency_ms: latencyMs,
        cached: false,
      };
    }

    const chatMessages: ChatMessage[] = messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt || '' }];

    const response: AzureResponse | null = await wynet.chat(model, chatMessages, options);
    const latencyMs = Date.now() - startMs;

    if (!response) {
      logger.warn('WYNet gateway unreachable — falling back to local Ollama inference', { cloudIntent, model });

      const fallbackModel = config.ollama.entryModel;
      const localResponse = await ollama.chat(fallbackModel, chatMessages, options);

      if (!localResponse) {
        throw httpError(502, 'WYNet gateway and local Ollama fallback both failed', 'upstream_error');
      }

      return {
        agent: AGENT_NAME,
        model: fallbackModel,
        intent: INTENT,
        runtime: 'local_ollama_fallback',
        content: localResponse.message?.content || '',
        tokens: {
          input: localResponse.prompt_eval_count || 0,
          output: localResponse.eval_count || 0,
        },
        latency_ms: Date.now() - startMs,
        cached: false,
      };
    }

    const azResponse = response as AzureResponse;
    const content = azResponse.choices?.[0]?.message?.content || '';
    const tokens: TokenUsage = {
      input: azResponse.usage?.prompt_tokens || 0,
      output: azResponse.usage?.completion_tokens || 0,
    };

    return {
      agent: AGENT_NAME,
      model,
      intent: INTENT,
      runtime: 'cloud_wynet',
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
