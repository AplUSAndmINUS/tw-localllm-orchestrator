export interface AgentResponse {
  agent: string;
  model: string;
  intent: string;
  runtime: string;
  content: string;
  tokens: TokenUsage;
  latency_ms: number;
  cached: boolean;
  classification?: IntentClassification;
  rag?: RagMetadata;
  audioBuffer?: Buffer;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface IntentClassification {
  intent: string;
  confidence: number;
  reasoning: string;
}

export interface AgentMetadata {
  name: string;
  intent: string;
  runtime: string;
  model: string;
  capabilities: string[];
}

export interface AgentExecuteParams {
  messages?: ChatMessage[];
  prompt?: string;
  options?: Record<string, unknown>;
  context?: string[];
  text?: string;
  language?: string;
  voiceRef?: string;
  cloudIntent?: string;
  audioBuffer?: Buffer | string;
  audio?: Buffer | string;
  voice?: string;
}

export interface Agent {
  execute(params: AgentExecuteParams): Promise<AgentResponse>;
  metadata: AgentMetadata;
}

export interface ClassifyingAgent extends Agent {
  classify(messages: ChatMessage[]): Promise<IntentClassification>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface RagMetadata {
  collection: string;
  contextChunks: number;
  topK: number;
}

export interface ServiceHealth {
  healthy: boolean;
  models?: string[];
  model?: string | null;
  collections?: number;
  note?: string;
  available?: boolean;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    ollama: ServiceHealth;
    lmstudio: ServiceHealth;
    xtts: ServiceHealth;
    onnx: ServiceHealth;
    chromadb: ServiceHealth;
  };
}

export interface CloudRoute {
  provider: 'anthropic' | 'azure';
  model: string;
}

export interface CloudRouteMap {
  [intent: string]: CloudRoute;
}

export interface OllamaResponse {
  message?: { content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  model?: string;
}

export interface OllamaModel {
  name: string;
  size?: number;
  digest?: string;
  modified_at?: string;
}

export interface LMStudioResponse {
  choices?: Array<{
    message?: { content: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  model?: string;
}

export interface AzureResponse {
  choices?: Array<{
    message?: { content: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface AnthropicResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export type ContainerService = 'ollama' | 'xtts' | 'onnx-runtime' | 'chromadb';

export interface ContainerStatus {
  service: ContainerService;
  containerName: string;
  running: boolean;
  healthy: boolean;
  uptime?: string;
  startedAt?: string;
}

export interface ContainerManagerConfig {
  composePath: string;
  idleTimeoutMs: number;
  startupTimeoutMs: number;
  healthCheckRetries: number;
  healthCheckIntervalMs: number;
  autoStart: boolean;
  autoStop: boolean;
  gpuSaturationThreshold: number;
}

export interface GpuStatus {
  available: boolean;
  utilizationPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  saturated: boolean;
}

export interface AppConfig {
  server: {
    port: number;
    host: string;
    env: string;
  };
  tailscaleHost: string;
  endpoints: {
    ollama: string;
    lmstudio: string;
    xtts: string;
    onnx: string;
    chromadb: string;
  };
  ollama: {
    entryModel: string;
    pullTimeout: number;
  };
  lmstudio: {
    healthCheckInterval: number;
    allowFallback: boolean;
  };
  azure: {
    endpoint: string;
    apiKey: string;
    apiVersion: string;
  };
  anthropic: {
    apiKey: string;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  cors: {
    origins: string[];
  };
  logging: {
    level: string;
    structured: boolean;
  };
  containers: ContainerManagerConfig;
}
