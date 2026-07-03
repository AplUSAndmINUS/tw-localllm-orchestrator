import { Request, Response, NextFunction } from 'express';
import * as containerManager from '../tools/containerManager';
import logger from '../tools/logger';
import { ContainerService } from '../types';

const VALID_SERVICES: ContainerService[] = ['ollama', 'xtts', 'onnx-runtime', 'chromadb'];

function validateService(service: string): service is ContainerService {
  return VALID_SERVICES.includes(service as ContainerService);
}

async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const statuses = containerManager.getAllStatuses();
    res.json({ containers: statuses });
  } catch (err) {
    next(err);
  }
}

async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const service = req.params.service as string;
    if (!validateService(service)) {
      res.status(400).json({ error: 'invalid_service', message: `Valid services: ${VALID_SERVICES.join(', ')}` });
      return;
    }
    const status = await containerManager.startService(service);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function stop(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const service = req.params.service as string;
    if (!validateService(service)) {
      res.status(400).json({ error: 'invalid_service', message: `Valid services: ${VALID_SERVICES.join(', ')}` });
      return;
    }
    const status = await containerManager.stopService(service);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function restart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const service = req.params.service as string;
    if (!validateService(service)) {
      res.status(400).json({ error: 'invalid_service', message: `Valid services: ${VALID_SERVICES.join(', ')}` });
      return;
    }
    const status = await containerManager.restartService(service);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function gpu(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = containerManager.checkGpuStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
}

export default { list, start, stop, restart, gpu };
