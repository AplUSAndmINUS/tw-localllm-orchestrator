import * as ollama from '../models/ollama';
import { getAgentProfile } from '../config/agentRegistry';
import logger from '../tools/logger';
import { AgentResponse, AgentMetadata, AgentExecuteParams, IntentClassification, ChatMessage, ClassifyingAgent, OllamaResponse } from '../types';

const AGENT_NAME = 'EntryAgent';
const PROFILE = getAgentProfile(AGENT_NAME);
const MODEL = PROFILE.model;
const RUNTIME = PROFILE.runtime;
const INTENT = 'classify';

const VALID_INTENTS: string[] = [
  'reasoning_heavy', 'stats', 'rag', 'coding', 'math',
  'image_high', 'image_low', 'speech_to_text', 'text_to_speech',
  'vision', 'cloud', 'general',
];

const CLASSIFY_SYSTEM_PROMPT = `You are an intent classifier for a local LLM orchestration system.
Given the user's message, classify the intent into exactly one of the following categories:
${VALID_INTENTS.join(', ')}

Respond ONLY with a JSON object in this format:
{"intent": "<category>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}

Guidelines:
- reasoning_heavy: complex multi-step reasoning, analysis, planning
- stats: statistical analysis, data science, probability
- rag: questions that need retrieval-augmented context
- coding: programming, debugging, code generation
- math: mathematical computations, proofs, equations
- image_high: high-quality image description, analysis, or generation prompts
- image_low: simple image tasks, quick descriptions
- speech_to_text: audio transcription requests
- text_to_speech: voice synthesis requests
- vision: image understanding, OCR, visual reasoning
- cloud: tasks requiring cloud-scale models (very complex, multi-modal, or high-stakes)
- general: casual conversation, simple questions, greetings`;

async function classify(messages: ChatMessage[]): Promise<IntentClassification> {
  const startMs = Date.now();

  try {
    const userMessage = Array.isArray(messages)
      ? messages.filter((m: ChatMessage) => m.role === 'user').map((m: ChatMessage) => m.content).join('\n')
      : String(messages);

    const classifyMessages: ChatMessage[] = [
      { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      { role: 'user', content: userMessage as string },
    ];

    const response: OllamaResponse | null = await ollama.chat(MODEL, classifyMessages);
    const latencyMs = Date.now() - startMs;

    if (!response) {
      logger.warn('EntryAgent classification returned null, defaulting to general');
      return { intent: 'general', confidence: 0, reasoning: 'Classification failed — defaulting' };
    }

    const text = response.message?.content || '';

    try {
      const parsed = JSON.parse(text.replace(/```json\s*/g, '').replace(/```/g, '').trim());
      const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : 'general';

      logger.info('EntryAgent classified intent', { intent, confidence: parsed.confidence, latencyMs });

      return {
        intent,
        confidence: parsed.confidence || 0,
        reasoning: parsed.reasoning || '',
      };
    } catch {
      logger.warn('EntryAgent failed to parse classification response', { text });
      return { intent: 'general', confidence: 0, reasoning: 'Parse error — defaulting' };
    }
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('EntryAgent classify error', { error: error.message });
    return { intent: 'general', confidence: 0, reasoning: `Error: ${error.message}` };
  }
}

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
    logger.error('EntryAgent execute error', { error: error.message });
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

export { classify, execute, metadata };
export default { classify, execute, metadata } as ClassifyingAgent;
