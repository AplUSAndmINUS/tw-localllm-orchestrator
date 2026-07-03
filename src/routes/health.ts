import { Request, Response, NextFunction } from 'express';
import { checkAll, getLastHealth } from '../tools/health';

async function healthRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const full = req.query.full === 'true';
    const health = full ? await checkAll() : await getLastHealth();
    const status = health.status === 'unhealthy' ? 503 : 200;
    res.status(status).json(health);
  } catch (err) {
    next(err);
  }
}

export default healthRoute;
