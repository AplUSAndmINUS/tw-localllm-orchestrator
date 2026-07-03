import { Request, Response, NextFunction } from 'express';
import logger from '../tools/logger';

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.ORCHESTRATOR_API_KEY;
  if (!apiKey) { next(); return; }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or malformed Authorization header', { ip: req.ip, path: req.path });
    res.status(401).json({ error: 'unauthorized', message: 'Missing Bearer token' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== apiKey) {
    logger.warn('Invalid API key', { ip: req.ip, path: req.path });
    res.status(403).json({ error: 'forbidden', message: 'Invalid API key' });
    return;
  }

  next();
}

export default authMiddleware;
