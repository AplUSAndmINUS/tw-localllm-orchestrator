import * as ollama from '../models/ollama';
import * as lmstudio from '../models/lmstudio';
import * as xtts from '../models/xtts';
import * as onnx from '../models/onnx';
import * as rag from './rag';
import * as containerManager from './containerManager';
import config from '../config';
import logger from '../tools/logger';
import { HealthReport, ServiceHealth, ContainerService } from '../types';

let lastHealth: HealthReport | null = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;

function deriveStatus(services: HealthReport['services']): HealthReport['status'] {
  if (!services.ollama.healthy) return 'unhealthy';
  const down = Object.entries(services)
    .filter(([name, svc]) => !svc.healthy && name !== 'lmstudio')
    .length;
  return down > 0 ? 'degraded' : 'healthy';
}

async function checkAll(): Promise<HealthReport> {
  const [ollamaResult, lmstudioResult, xttsResult, onnxResult, chromadbResult] =
    await Promise.allSettled([
      ollama.getHealth(),
      lmstudio.getHealth(),
      xtts.getHealth(),
      onnx.getHealth(),
      rag.getHealth(),
    ]);

  const resolve = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
    result.status === 'fulfilled' ? result.value : fallback;

  const services: HealthReport['services'] = {
    ollama: resolve(ollamaResult, { healthy: false, models: [] }),
    lmstudio: resolve(lmstudioResult, { healthy: false, model: null }),
    xtts: resolve(xttsResult, { healthy: false }),
    onnx: resolve(onnxResult, { healthy: false }),
    chromadb: resolve(chromadbResult, { healthy: false, collections: 0 }),
  };

  if (!services.lmstudio.healthy) {
    services.lmstudio.note = 'LM Studio offline or no model loaded';
  }

  if (config.containers.autoStart) {
    const serviceMap: Array<[keyof HealthReport['services'], ContainerService]> = [
      ['ollama', 'ollama'],
      ['xtts', 'xtts'],
      ['onnx', 'onnx-runtime'],
      ['chromadb', 'chromadb'],
    ];
    for (const [key, containerService] of serviceMap) {
      if (!services[key].healthy) {
        containerManager.ensureRunning(containerService).catch(err =>
          logger.warn('Auto-start failed during health check', { service: containerService, error: (err as Error).message })
        );
      }
    }
  }

  const result: HealthReport = {
    status: deriveStatus(services),
    timestamp: new Date().toISOString(),
    services,
  };

  lastHealth = result;
  return result;
}

function startHealthPolling(): void {
  if (pollingInterval) return;
  checkAll().catch((err: Error) => logger.error('Initial health check failed', { error: err.message }));
  pollingInterval = setInterval(() => {
    checkAll().catch((err: Error) => logger.error('Health polling failed', { error: err.message }));
  }, config.lmstudio.healthCheckInterval);
}

async function getLastHealth(): Promise<HealthReport> {
  if (!lastHealth) {
    return checkAll();
  }
  return lastHealth;
}

export {
  checkAll,
  startHealthPolling,
  getLastHealth,
};
