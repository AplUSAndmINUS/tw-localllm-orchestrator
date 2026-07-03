import * as lmstudio from '../models/lmstudio';
import * as ollama from '../models/ollama';
import * as containerManager from '../tools/containerManager';
import config from '../config';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, OllamaResponse, LMStudioResponse } from '../types';

const AGENT_NAME = 'ReasoningAgent';
const MODEL = 'phi-4-reasoning-plus-Q4_K_M.gguf';
const FALLBACK_MODEL: string = config.ollama.entryModel;
const RUNTIME = 'lmstudio';
const INTENT = 'reasoning_heavy';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { messages = [], prompt, options = {} } = params;
  const startMs = Date.now();

  try {
    const chatMessages: ChatMessage[] = messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt || '' }];

    const available = await lmstudio.isAvailable();
    const modelLoaded = available && await lmstudio.isModelLoaded(MODEL);

    let response: OllamaResponse | LMStudioResponse | null;
    let usedRuntime = RUNTIME;
    let usedModel = MODEL;

    if (modelLoaded) {
      response = await lmstudio.chat(chatMessages, { model: MODEL, ...options });
    } else if (config.lmstudio.allowFallback) {
      logger.warn('ReasoningAgent falling back to Ollama', { reason: available ? 'model not loaded' : 'LM Studio unavailable' });
      await containerManager.ensureRunning('ollama');
      containerManager.recordActivity('ollama');
      usedRuntime = 'ollama';
      usedModel = FALLBACK_MODEL;
      response = await ollama.chat(FALLBACK_MODEL, chatMessages, options);
    } else {
      throw new Error(`LM Studio unavailable and fallback disabled (model: ${MODEL})`);
    }

    const latencyMs = Date.now() - startMs;

    if (!response) {
      throw new Error(`${usedRuntime} returned null response`);
    }

    const isOllama = usedRuntime === 'ollama';
    const content = isOllama
      ? ((response as OllamaResponse).message?.content || '')
      : ((response as LMStudioResponse).choices?.[0]?.message?.content || '');
    const tokens = isOllama
      ? { input: (response as OllamaResponse).prompt_eval_count || 0, output: (response as OllamaResponse).eval_count || 0 }
      : { input: (response as LMStudioResponse).usage?.prompt_tokens || 0, output: (response as LMStudioResponse).usage?.completion_tokens || 0 };

    return {
      agent: AGENT_NAME,
      model: usedModel,
      intent: INTENT,
      runtime: usedRuntime,
      content,
      tokens,
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('ReasoningAgent execute error', { error: error.message });
    throw err;
  }
}

const metadata: AgentMetadata = {
  name: AGENT_NAME,
  intent: INTENT,
  runtime: RUNTIME,
  model: MODEL,
  capabilities: ['complex_reasoning', 'multi_step_analysis', 'planning'],
};

export { execute, metadata };
export default { execute, metadata } as Agent;
