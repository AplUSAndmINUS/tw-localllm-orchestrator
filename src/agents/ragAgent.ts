import * as ollama from '../models/ollama';
import { getAgentProfile } from '../config/agentRegistry';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, OllamaResponse } from '../types';

const AGENT_NAME = 'RagAgent';
const PROFILE = getAgentProfile(AGENT_NAME);
const MODEL = PROFILE.model;
const RUNTIME = PROFILE.runtime;
const INTENT = 'rag';

async function execute(params: AgentExecuteParams = {}): Promise<AgentResponse> {
  const { messages = [], prompt, context, options = {} } = params;
  const startMs = Date.now();

  try {
    const chatMessages: ChatMessage[] = messages.length > 0
      ? [...messages]
      : [{ role: 'user', content: prompt || '' }];

    if (context) {
      const contextChunks = Array.isArray(context) ? context.join('\n\n---\n\n') : String(context);
      const systemContent = `You are a helpful assistant that answers questions using the provided context. If the context does not contain relevant information, say so clearly.\n\n## Retrieved Context\n\n${contextChunks}`;

      const existingSystem = chatMessages.findIndex((m: ChatMessage) => m.role === 'system');
      if (existingSystem >= 0) {
        chatMessages[existingSystem] = {
          role: 'system',
          content: `${chatMessages[existingSystem].content}\n\n${systemContent}`,
        };
      } else {
        chatMessages.unshift({ role: 'system', content: systemContent });
      }
    }

    const response: OllamaResponse | null = await ollama.chat(MODEL, chatMessages, options);
    const latencyMs = Date.now() - startMs;

    if (!response) {
      throw new Error('Ollama returned null response');
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
    logger.error('RagAgent execute error', { error: error.message });
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
