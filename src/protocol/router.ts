import modelRegistry from '../config/modelRegistry.json';
import config from '../config';
import * as azure from '../cloud/azure';
import * as anthropic from '../cloud/anthropic';
import * as ollama from '../models/ollama';
import * as lmstudio from '../models/lmstudio';
import * as containerManager from '../tools/containerManager';
import { AssistantToolCall, AzureResponse, AnthropicResponse, ChatMessage, LMStudioResponse, OllamaResponse, TokenUsage } from '../types';

type ModelRuntime = 'ollama' | 'lmstudio' | 'cloud';
type ToolFormat = 'openai' | 'anthropic';

export interface ProtocolRouteOptions extends Record<string, unknown> {
  toolFormat?: ToolFormat;
  tools?: unknown[];
  max_tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface RoutedLLMResponse {
  model: string;
  runtime: string;
  content: string;
  tokens: TokenUsage;
  toolCalls?: AssistantToolCall[];
}

interface RouteImplementation {
  routeToLocalLLM(model: string, messages: ChatMessage[], options?: ProtocolRouteOptions): Promise<RoutedLLMResponse | null>;
  routeToCloudLLM(model: string, messages: ChatMessage[], options?: ProtocolRouteOptions): Promise<RoutedLLMResponse | null>;
  routeToLMStudio(model: string, messages: ChatMessage[], options?: ProtocolRouteOptions): Promise<RoutedLLMResponse | null>;
}

interface RegistryModel {
  id?: string;
  model?: string;
  runtime?: string;
}

function normalizeOpenAIToolCalls(toolCalls: Array<{ id?: string; function?: { name?: string; arguments?: string } }> = []): AssistantToolCall[] | undefined {
  if (!toolCalls.length) {
    return undefined;
  }

  return toolCalls.map((toolCall, index) => ({
    id: toolCall.id || `tool_${index}`,
    name: toolCall.function?.name || 'tool',
    arguments: toolCall.function?.arguments || '{}',
  }));
}

function toOpenAITools(tools: unknown[] | undefined, toolFormat: ToolFormat = 'openai'): unknown[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  if (toolFormat === 'openai') {
    return tools;
  }

  return tools.map((tool) => {
    const candidate = tool as {
      name?: string;
      description?: string;
      input_schema?: Record<string, unknown>;
    };

    return {
      type: 'function',
      function: {
        name: candidate.name,
        description: candidate.description,
        parameters: candidate.input_schema || { type: 'object', properties: {} },
      },
    };
  });
}

function toAnthropicTools(tools: unknown[] | undefined, toolFormat: ToolFormat = 'openai'): unknown[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  if (toolFormat === 'anthropic') {
    return tools;
  }

  return tools.map((tool) => {
    const candidate = tool as {
      name?: string;
      description?: string;
      input_schema?: Record<string, unknown>;
      function?: {
        name?: string;
        description?: string;
        parameters?: Record<string, unknown>;
      };
    };

    return {
      name: candidate.function?.name || candidate.name,
      description: candidate.function?.description || candidate.description,
      input_schema: candidate.function?.parameters || candidate.input_schema || { type: 'object', properties: {} },
    };
  });
}

function toOpenAIOptions(options: ProtocolRouteOptions = {}): Record<string, unknown> {
  const { toolFormat = 'openai', tools, ...rest } = options;
  const normalized: Record<string, unknown> = { ...rest };
  const normalizedTools = toOpenAITools(tools, toolFormat);

  if (normalizedTools) {
    normalized.tools = normalizedTools;
  }

  return normalized;
}

function toAnthropicOptions(options: ProtocolRouteOptions = {}): Record<string, unknown> {
  const { toolFormat = 'openai', tools, metadata: _metadata, ...rest } = options;
  const normalized: Record<string, unknown> = { ...rest };
  const normalizedTools = toAnthropicTools(tools, toolFormat);

  if (normalizedTools) {
    normalized.tools = normalizedTools;
  }

  return normalized;
}

function resolveRuntime(runtime: string | undefined, model: string): ModelRuntime {
  if (runtime === 'lmstudio') {
    return 'lmstudio';
  }

  if (runtime && (runtime.startsWith('cloud') || runtime === 'azure' || runtime === 'anthropic')) {
    return 'cloud';
  }

  if (/\.gguf$/i.test(model)) {
    return 'lmstudio';
  }

  const normalizedModel = model.toLowerCase();
  if (normalizedModel.startsWith('claude') || normalizedModel.startsWith('gpt-') || normalizedModel === 'phi-4-reasoning') {
    return 'cloud';
  }

  return 'ollama';
}

function resolveModel(model: string): { model: string; runtime: ModelRuntime } {
  const registryModels = Object.values((modelRegistry as { models: Record<string, RegistryModel> }).models);
  const registryModel = registryModels.find((candidate) => candidate.id === model || candidate.model === model);

  if (registryModel?.model) {
    return {
      model: registryModel.model,
      runtime: resolveRuntime(registryModel.runtime, registryModel.model),
    };
  }

  return {
    model,
    runtime: resolveRuntime(undefined, model),
  };
}

export async function routeToLocalLLM(model: string, messages: ChatMessage[], options: ProtocolRouteOptions = {}): Promise<RoutedLLMResponse | null> {
  await containerManager.ensureRunning('ollama');
  containerManager.recordActivity('ollama');

  const response: OllamaResponse | null = await ollama.chat(model, messages, options);
  if (!response) {
    return null;
  }

  return {
    model: response.model || model,
    runtime: 'ollama',
    content: response.message?.content || '',
    tokens: {
      input: response.prompt_eval_count || 0,
      output: response.eval_count || 0,
    },
    toolCalls: normalizeOpenAIToolCalls(response.message?.tool_calls),
  };
}

export async function routeToLMStudio(model: string, messages: ChatMessage[], options: ProtocolRouteOptions = {}): Promise<RoutedLLMResponse | null> {
  const available = await lmstudio.isAvailable();
  const loaded = available && await lmstudio.isModelLoaded(model);

  if (!loaded) {
    return null;
  }

  const response: LMStudioResponse | null = await lmstudio.chat(messages, { model, ...options });
  if (!response) {
    return null;
  }

  return {
    model: response.model || model,
    runtime: 'lmstudio',
    content: response.choices?.[0]?.message?.content || '',
    tokens: {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
    },
    toolCalls: normalizeOpenAIToolCalls(response.choices?.[0]?.message?.tool_calls),
  };
}

export async function routeToCloudLLM(model: string, messages: ChatMessage[], options: ProtocolRouteOptions = {}): Promise<RoutedLLMResponse | null> {
  const normalizedModel = model.toLowerCase();
  const isClaudeModel = normalizedModel.startsWith('claude');

  if (isClaudeModel) {
    const response: AnthropicResponse | null = anthropic.isAvailable()
      ? await anthropic.chat(model, messages, options)
      : azure.isAvailable()
        ? await azure.chatClaude(model, messages, options)
        : null;

    if (!response) {
      return null;
    }

    return {
      model: response.model || model,
      runtime: anthropic.isAvailable() ? 'cloud_anthropic' : 'cloud_azure',
      content: response.content || '',
      tokens: {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
      },
      toolCalls: response.tool_calls,
    };
  }

  if (!azure.isAvailable()) {
    return null;
  }

  const response: AzureResponse | null = await azure.chat(model, messages, options);
  if (!response) {
    return null;
  }

  return {
    model: response.model || model,
    runtime: 'cloud_azure',
    content: response.choices?.[0]?.message?.content || '',
    tokens: {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
    },
    toolCalls: normalizeOpenAIToolCalls(response.choices?.[0]?.message?.tool_calls),
  };
}

export function createProtocolRouter(overrides: Partial<RouteImplementation> = {}) {
  const implementation: RouteImplementation = {
    routeToLocalLLM,
    routeToCloudLLM,
    routeToLMStudio,
    ...overrides,
  };

  return async function routeModelRequest(model: string, messages: ChatMessage[], options: ProtocolRouteOptions = {}): Promise<RoutedLLMResponse | null> {
    const resolved = resolveModel(model);
    const localOptions = toOpenAIOptions(options) as ProtocolRouteOptions;
    const cloudOptions = resolved.model.toLowerCase().startsWith('claude')
      ? toAnthropicOptions(options) as ProtocolRouteOptions
      : toOpenAIOptions(options) as ProtocolRouteOptions;

    if (resolved.runtime === 'cloud') {
      const cloudResponse = await implementation.routeToCloudLLM(resolved.model, messages, cloudOptions);
      if (cloudResponse) {
        return cloudResponse;
      }
      return implementation.routeToLocalLLM(config.ollama.entryModel, messages, localOptions);
    }

    if (resolved.runtime === 'lmstudio') {
      const lmstudioResponse = await implementation.routeToLMStudio(resolved.model, messages, localOptions);
      if (lmstudioResponse) {
        return lmstudioResponse;
      }
      return implementation.routeToLocalLLM(config.ollama.entryModel, messages, localOptions);
    }

    return implementation.routeToLocalLLM(resolved.model, messages, localOptions);
  };
}
