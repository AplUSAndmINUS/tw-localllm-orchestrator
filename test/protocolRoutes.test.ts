import assert from 'node:assert/strict';
import test from 'node:test';
import { Request, Response } from 'express';
import config from '../src/config';
import { createMessagesRoute, createResponsesRoute } from '../src/routes/protocol';
import { createProtocolRouter, ProtocolRouteOptions } from '../src/protocol/router';
import { ChatMessage } from '../src/types';

function createMockResponse(): Response & { body?: unknown; statusCode: number } {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response as Response & { body?: unknown; statusCode: number };
}

function createNext() {
  const calls: unknown[] = [];
  const next = (error?: unknown) => {
    if (error) {
      calls.push(error);
    }
  };

  return { next, calls };
}

test('POST /v1/responses formats a basic text generation request and response', async () => {
  let captured: { model: string; messages: ChatMessage[]; options?: ProtocolRouteOptions } | undefined;

  const handler = createResponsesRoute({
    createId: () => 'resp_test',
    routeRequest: async (model, messages, options) => {
      captured = { model, messages, options };
      return {
        model: 'phi4-mini:latest',
        runtime: 'ollama',
        content: 'Hello from Ollama',
        tokens: { input: 4, output: 5 },
      };
    },
  });

  const req = {
    body: {
      model: 'phi4-mini',
      input: 'Say hello',
      temperature: 0.2,
      max_output_tokens: 128,
      metadata: { source: 'test' },
    },
  } as Request;
  const res = createMockResponse();
  const { next, calls } = createNext();

  await handler(req, res, next);

  assert.equal(calls.length, 0);
  assert.deepEqual(captured, {
    model: 'phi4-mini',
    messages: [{ role: 'user', content: 'Say hello' }],
    options: {
      toolFormat: 'openai',
      temperature: 0.2,
      max_tokens: 128,
      metadata: { source: 'test' },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: 'resp_test',
    object: 'response',
    model: 'phi4-mini:latest',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: 'Hello from Ollama',
      },
    ],
  });
});

test('POST /v1/messages formats text and tool use in Anthropic shape', async () => {
  const handler = createMessagesRoute({
    createId: () => 'msg_test',
    routeRequest: async () => ({
      model: 'claude-3-sonnet-20250514',
      runtime: 'cloud_anthropic',
      content: 'Calling the weather tool.',
      tokens: { input: 10, output: 6 },
      toolCalls: [
        {
          id: 'tool_1',
          name: 'get_weather',
          arguments: '{"city":"Paris"}',
        },
      ],
    }),
  });

  const req = {
    body: {
      model: 'claude-3-sonnet-20250514',
      system: 'Be concise',
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
      max_tokens: 64,
      temperature: 0.1,
    },
  } as Request;
  const res = createMockResponse();
  const { next, calls } = createNext();

  await handler(req, res, next);

  assert.equal(calls.length, 0);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-3-sonnet-20250514',
    content: [
      { type: 'text', text: 'Calling the weather tool.' },
      { type: 'tool_use', id: 'tool_1', name: 'get_weather', input: { city: 'Paris' } },
    ],
  });
});

test('Anthropic tools are translated before local routing', async () => {
  let capturedTools: unknown;

  const routeModelRequest = createProtocolRouter({
    routeToLocalLLM: async (_model, _messages, options) => {
      capturedTools = options?.tools;
      return {
        model: 'phi4-mini:latest',
        runtime: 'ollama',
        content: 'ok',
        tokens: { input: 1, output: 1 },
      };
    },
  });

  await routeModelRequest('phi4-mini', [{ role: 'user', content: 'Use a tool' }], {
    toolFormat: 'anthropic',
    tools: [
      {
        name: 'lookup_weather',
        description: 'Look up current weather',
        input_schema: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    ],
  });

  assert.deepEqual(capturedTools, [
    {
      type: 'function',
      function: {
        name: 'lookup_weather',
        description: 'Look up current weather',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    },
  ]);
});

test('cloud requests fall back to local inference when cloud routing is unavailable', async () => {
  let localModel: string | undefined;

  const routeModelRequest = createProtocolRouter({
    routeToCloudLLM: async () => null,
    routeToLocalLLM: async (model) => {
      localModel = model;
      return {
        model,
        runtime: 'ollama',
        content: 'fallback',
        tokens: { input: 1, output: 1 },
      };
    },
  });

  const result = await routeModelRequest('gpt-4o', [{ role: 'user', content: 'Hello' }]);

  assert.equal(localModel, config.ollama.entryModel);
  assert.equal(result?.content, 'fallback');
});

test('invalid protocol payloads return 400 errors', async () => {
  const responsesHandler = createResponsesRoute({
    routeRequest: async () => {
      throw new Error('should not be called');
    },
  });
  const messagesHandler = createMessagesRoute({
    routeRequest: async () => {
      throw new Error('should not be called');
    },
  });

  const badResponsesReq = { body: { input: 'missing model' } } as Request;
  const badMessagesReq = { body: { model: 'claude-3-sonnet-20250514', messages: 'nope' } } as Request;
  const responsesRes = createMockResponse();
  const messagesRes = createMockResponse();
  const responsesNext = createNext();
  const messagesNext = createNext();

  await responsesHandler(badResponsesReq, responsesRes, responsesNext.next);
  await messagesHandler(badMessagesReq, messagesRes, messagesNext.next);

  assert.deepEqual(responsesRes.body, { error: 'bad_request', message: 'model is required' });
  assert.deepEqual(messagesRes.body, { error: 'bad_request', message: 'messages must be a valid non-empty message array' });
});
