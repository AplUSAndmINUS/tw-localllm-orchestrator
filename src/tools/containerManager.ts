import { execSync, exec } from 'child_process';
import path from 'path';
import config from '../config';
import logger from './logger';
import { ContainerService, ContainerStatus, GpuStatus } from '../types';

const SERVICE_CONTAINER_MAP: Record<ContainerService, string> = {
  'ollama': 'aplus-ollama',
  'xtts': 'aplus-xtts',
  'onnx-runtime': 'aplus-onnx',
  'chromadb': 'aplus-chromadb',
};

const lastActivity = new Map<ContainerService, number>();
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

function composePath(): string {
  return path.resolve(config.containers.composePath, 'docker-compose.yml');
}

function dockerCompose(args: string): string {
  const cmd = `docker compose -f "${composePath()}" ${args}`;
  logger.debug('Running docker command', { cmd });
  return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
}

function dockerComposeAsync(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = `docker compose -f "${composePath()}" ${args}`;
    logger.debug('Running async docker command', { cmd });
    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Docker command failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function getContainerStatus(service: ContainerService): ContainerStatus {
  const containerName = SERVICE_CONTAINER_MAP[service];
  try {
    const format = '{{.State.Status}}|{{.State.Health.Status}}|{{.State.StartedAt}}';
    const raw = execSync(
      `docker inspect --format="${format}" ${containerName}`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    const [status, health, startedAt] = raw.split('|');
    const running = status === 'running';
    const healthy = health === 'healthy' || (running && health === '');

    let uptime: string | undefined;
    if (running && startedAt) {
      const ms = Date.now() - new Date(startedAt).getTime();
      const mins = Math.floor(ms / 60000);
      uptime = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }

    return { service, containerName, running, healthy, uptime, startedAt: running ? startedAt : undefined };
  } catch {
    return { service, containerName, running: false, healthy: false };
  }
}

function getAllStatuses(): ContainerStatus[] {
  return (Object.keys(SERVICE_CONTAINER_MAP) as ContainerService[]).map(getContainerStatus);
}

async function startService(service: ContainerService): Promise<ContainerStatus> {
  logger.info('Starting container', { service });
  try {
    dockerCompose(`up -d ${service}`);
  } catch (err) {
    logger.error('Failed to start container', { service, error: (err as Error).message });
    throw err;
  }

  const status = await waitForHealthy(service);
  if (status.running) {
    recordActivity(service);
    logger.info('Container started', { service, healthy: status.healthy });
  }
  return status;
}

async function stopService(service: ContainerService): Promise<ContainerStatus> {
  logger.info('Stopping container', { service });
  try {
    dockerCompose(`stop ${service}`);
  } catch (err) {
    logger.error('Failed to stop container', { service, error: (err as Error).message });
    throw err;
  }
  lastActivity.delete(service);
  return getContainerStatus(service);
}

async function restartService(service: ContainerService): Promise<ContainerStatus> {
  logger.info('Restarting container', { service });
  await stopService(service);
  return startService(service);
}

async function waitForHealthy(service: ContainerService): Promise<ContainerStatus> {
  const { startupTimeoutMs, healthCheckRetries, healthCheckIntervalMs } = config.containers;
  const deadline = Date.now() + startupTimeoutMs;
  let attempts = 0;

  while (attempts < healthCheckRetries && Date.now() < deadline) {
    await sleep(healthCheckIntervalMs);
    const status = getContainerStatus(service);
    if (status.running && status.healthy) return status;
    if (!status.running) {
      logger.warn('Container not running during health wait', { service, attempts });
      break;
    }
    attempts++;
  }

  const final = getContainerStatus(service);
  if (!final.healthy) {
    logger.warn('Container did not become healthy in time', { service, attempts });
  }
  return final;
}

async function ensureRunning(service: ContainerService): Promise<ContainerStatus> {
  const status = getContainerStatus(service);
  if (status.running && status.healthy) {
    recordActivity(service);
    return status;
  }

  if (!config.containers.autoStart) {
    logger.warn('Container not running and auto-start disabled', { service });
    return status;
  }

  if (status.running && !status.healthy) {
    return restartService(service);
  }
  return startService(service);
}

function checkGpuStatus(): GpuStatus {
  try {
    const raw = execSync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    const [utilization, memUsed, memTotal] = raw.split(',').map(s => parseFloat(s.trim()));
    const saturated = utilization >= config.containers.gpuSaturationThreshold;

    return {
      available: true,
      utilizationPercent: utilization,
      memoryUsedMb: memUsed,
      memoryTotalMb: memTotal,
      saturated,
    };
  } catch {
    return { available: false, utilizationPercent: 0, memoryUsedMb: 0, memoryTotalMb: 0, saturated: false };
  }
}

function isGpuSaturated(): boolean {
  return checkGpuStatus().saturated;
}

function recordActivity(service: ContainerService): void {
  lastActivity.set(service, Date.now());
}

async function checkIdleServices(): Promise<void> {
  if (!config.containers.autoStop) return;

  const now = Date.now();
  const services = Object.keys(SERVICE_CONTAINER_MAP) as ContainerService[];

  for (const service of services) {
    const last = lastActivity.get(service);
    if (!last) continue;

    const idle = now - last;
    if (idle < config.containers.idleTimeoutMs) continue;

    const status = getContainerStatus(service);
    if (!status.running) {
      lastActivity.delete(service);
      continue;
    }

    logger.info('Stopping idle container', { service, idleMs: idle });
    try {
      await stopService(service);
    } catch (err) {
      logger.error('Failed to stop idle container', { service, error: (err as Error).message });
    }
  }
}

function startIdlePolling(): void {
  if (idleCheckInterval) return;
  const interval = Math.max(60000, Math.floor(config.containers.idleTimeoutMs / 4));
  idleCheckInterval = setInterval(() => {
    checkIdleServices().catch(err =>
      logger.error('Idle check failed', { error: (err as Error).message })
    );
  }, interval);
  logger.info('Idle container polling started', { intervalMs: interval });
}

function stopIdlePolling(): void {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  getContainerStatus,
  getAllStatuses,
  startService,
  stopService,
  restartService,
  ensureRunning,
  checkGpuStatus,
  isGpuSaturated,
  recordActivity,
  checkIdleServices,
  startIdlePolling,
  stopIdlePolling,
};
