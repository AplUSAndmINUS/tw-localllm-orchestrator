import * as ollama from '../models/ollama';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, ChatMessage, Agent, OllamaResponse } from '../types';

const AGENT_NAME = 'MathAgent';
const MODEL = 'deepseek-math:7b';
const RUNTIME = 'ollama';
const INTENT = 'math';

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
    logger.error('MathAgent execute error', { error: error.message });
    throw err;
  }
}

const metadata: AgentMetadata = {
  name: AGENT_NAME,
  intent: INTENT,
  runtime: RUNTIME,
  model: MODEL,
  capabilities: ['mathematical_computation', 'proofs', 'equations', 'calculus'],
};

export { execute, metadata };
export default { execute, metadata } as Agent;
