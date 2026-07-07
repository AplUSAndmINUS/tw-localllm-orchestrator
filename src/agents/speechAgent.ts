import * as ollama from '../models/ollama';
import { getAgentProfile } from '../config/agentRegistry';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, OllamaResponse } from '../types';

const AGENT_NAME = 'SpeechAgent';
const PROFILE = getAgentProfile(AGENT_NAME);
const MODEL = PROFILE.model;
const RUNTIME = PROFILE.runtime;
const INTENT = 'speech_to_text';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { messages = [], prompt, options = {} } = params;
  const startMs = Date.now();

  try {
    const chatMessages: ChatMessage[] = messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt || '' }];

    const response: OllamaResponse | null = await ollama.chat(MODEL, chatMessages, options);
    const latencyMs = Date.now() - startMs;

    if (!response) {
      logger.warn('SpeechAgent: whisper-large model not available via Ollama — this is a placeholder agent');
      return {
        agent: AGENT_NAME,
        model: MODEL,
        intent: INTENT,
        runtime: RUNTIME,
        content: '',
        tokens: { input: 0, output: 0 },
        latency_ms: latencyMs,
        cached: false,
      };
    }

    return {
      agent: AGENT_NAME,
      model: MODEL,
      intent: INTENT,
      runtime: RUNTIME,
      content: response.message?.content || '',
      tokens: {
        input: response.prompt_eval_count || 0,
        output: response.eval_count || 0,
      },
      latency_ms: latencyMs,
      cached: false,
    };
  } catch (err: unknown) {
    const error = err as Error;
    const latencyMs = Date.now() - startMs;
    logger.error('SpeechAgent execute error', { error: error.message });

    return {
      agent: AGENT_NAME,
      model: MODEL,
      intent: INTENT,
      runtime: RUNTIME,
      content: '',
      tokens: { input: 0, output: 0 },
      latency_ms: latencyMs,
      cached: false,
    };
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
