import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import config from '../config';
import { createProtocolRouter, ProtocolRouteOptions, RoutedLLMResponse } from '../protocol/router';
import { ChatMessage, ContentPart } from '../types';

type ProtocolRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

interface ProtocolRouteDependencies {
  routeRequest?: (model: string, messages: ChatMessage[], options?: ProtocolRouteOptions) => Promise<RoutedLLMResponse | null>;
  createId?: (prefix: 'resp' | 'msg') => string;
}

function createId(prefix: 'resp' | 'msg'): string {
  return `${prefix}_${randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeContent(content: unknown): string | ContentPart[] | null {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts: ContentPart[] = [];

  for (const rawPart of content) {
    if (!isRecord(rawPart)) {
      return null;
    }

    const type = typeof rawPart.type === 'string' ? rawPart.type : 'text';

    if ((type === 'text' || type === 'input_text' || type === 'output_text') && typeof rawPart.text === 'string') {
      parts.push({ type: 'text', text: rawPart.text });
      continue;
    }

    if ((type === 'image_url' || type === 'input_image') && isRecord(rawPart.image_url) && typeof rawPart.image_url.url === 'string') {
      parts.push({ type: 'image_url', image_url: { url: rawPart.image_url.url } });
      continue;
    }

    if (type === 'image' && isRecord(rawPart.source) && rawPart.source.type === 'base64' && typeof rawPart.source.data === 'string' && typeof rawPart.source.media_type === 'string') {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${rawPart.source.media_type};base64,${rawPart.source.data}` },
      });
      continue;
    }

    parts.push({ type: 'text', text: JSON.stringify(rawPart) });
  }

  return parts;
}

function normalizeMessages(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  const normalized: ChatMessage[] = [];

  for (const rawMessage of messages) {
    if (!isRecord(rawMessage) || typeof rawMessage.role !== 'string') {
      return null;
    }

    if (!['system', 'user', 'assistant'].includes(rawMessage.role)) {
      return null;
    }

    const content = normalizeContent(rawMessage.content);
    if (content === null) {
      return null;
    }

    normalized.push({
      role: rawMessage.role as ChatMessage['role'],
      content,
    });
  }

  return normalized;
}

function normalizeResponsesInput(input: unknown, messages: unknown): ChatMessage[] | null {
  const explicitMessages = normalizeMessages(messages);
  if (explicitMessages) {
    return explicitMessages;
  }

  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }

  const inputMessages = normalizeMessages(input);
  if (inputMessages) {
    return inputMessages;
  }

  const normalizedInputContent = normalizeContent(input);
  if (normalizedInputContent) {
    return [{ role: 'user', content: normalizedInputContent }];
  }

  return null;
}

function parseToolInput(argumentsJson: string, input?: Record<string, unknown>): Record<string, unknown> {
  if (input) {
    return input;
  }

  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return { raw: argumentsJson };
  }
}

function formatResponsesPayload(id: string, result: RoutedLLMResponse): Record<string, unknown> {
  const message: Record<string, unknown> = {
    type: 'message',
    role: 'assistant',
    content: result.content,
  };

  if (result.toolCalls?.length) {
    message.tool_calls = result.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: 'function',
      function: {
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
    }));
  }

  return {
    id,
    object: 'response',
    model: result.model,
    output: [message],
  };
}

function formatAnthropicPayload(id: string, result: RoutedLLMResponse): Record<string, unknown> {
  if (!result.toolCalls?.length) {
    return {
      id,
      type: 'message',
      role: 'assistant',
      model: result.model,
      content: result.content,
    };
  }

  const content: Array<Record<string, unknown>> = [];

  if (result.content) {
    content.push({ type: 'text', text: result.content });
  }

  for (const toolCall of result.toolCalls) {
    content.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: parseToolInput(toolCall.arguments, toolCall.input),
    });
  }

  return {
    id,
    type: 'message',
    role: 'assistant',
    model: result.model,
    content,
  };
}

function createResponsesRoute(dependencies: ProtocolRouteDependencies = {}): ProtocolRouteHandler {
  const routeRequest = dependencies.routeRequest || createProtocolRouter();
  const nextId = dependencies.createId || createId;

  return async function responsesRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!config.protocol.enableOpenAIResponses) {
        res.status(404).json({ error: 'not_found', message: 'OpenAI Responses endpoint is disabled' });
        return;
      }

      const { model, input, messages, temperature, max_output_tokens, tools, metadata } = req.body || {};

      if (typeof model !== 'string' || !model.trim()) {
        res.status(400).json({ error: 'bad_request', message: 'model is required' });
        return;
      }

      const normalizedMessages = normalizeResponsesInput(input, messages);
      if (!normalizedMessages) {
        res.status(400).json({ error: 'bad_request', message: 'input or messages must be a valid non-empty message payload' });
        return;
      }

      const options: ProtocolRouteOptions = {
        toolFormat: 'openai',
      };

      if (typeof temperature === 'number') {
        options.temperature = temperature;
      }
      if (typeof max_output_tokens === 'number') {
        options.max_tokens = max_output_tokens;
      }
      if (Array.isArray(tools)) {
        options.tools = tools;
      }
      if (isRecord(metadata)) {
        options.metadata = metadata;
      }

      const result = await routeRequest(model, normalizedMessages, options);
      if (!result) {
        throw new Error(`Responses routing failed for model ${model}: no available provider`);
      }

      res.json(formatResponsesPayload(nextId('resp'), result));
    } catch (err) {
      next(err);
    }
  };
}

function createMessagesRoute(dependencies: ProtocolRouteDependencies = {}): ProtocolRouteHandler {
  const routeRequest = dependencies.routeRequest || createProtocolRouter();
  const nextId = dependencies.createId || createId;

  return async function messagesRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!config.protocol.enableAnthropicMessages) {
        res.status(404).json({ error: 'not_found', message: 'Anthropic Messages endpoint is disabled' });
        return;
      }

      const { model, messages, system, max_tokens, temperature, tools } = req.body || {};

      if (typeof model !== 'string' || !model.trim()) {
        res.status(400).json({ error: 'bad_request', message: 'model is required' });
        return;
      }

      const normalizedMessages = normalizeMessages(messages);
      if (!normalizedMessages) {
        res.status(400).json({ error: 'bad_request', message: 'messages must be a valid non-empty message array' });
        return;
      }

      const protocolMessages = typeof system === 'string' && system.trim()
        ? [{ role: 'system' as const, content: system }, ...normalizedMessages]
        : normalizedMessages;

      const options: ProtocolRouteOptions = {
        toolFormat: 'anthropic',
      };

      if (typeof max_tokens === 'number') {
        options.max_tokens = max_tokens;
      }
      if (typeof temperature === 'number') {
        options.temperature = temperature;
      }
      if (Array.isArray(tools)) {
        options.tools = tools;
      }

      const result = await routeRequest(model, protocolMessages, options);
      if (!result) {
        throw new Error(`Messages routing failed for model ${model}: no available provider`);
      }

      res.json(formatAnthropicPayload(nextId('msg'), result));
    } catch (err) {
      next(err);
    }
  };
}

export { createResponsesRoute, createMessagesRoute };
export default {
  responses: createResponsesRoute(),
  messages: createMessagesRoute(),
};
