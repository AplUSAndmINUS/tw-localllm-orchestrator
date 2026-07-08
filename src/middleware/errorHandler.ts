import { Request, Response, NextFunction } from 'express';
import logger from '../tools/logger';
import { HttpError } from '../types';

function errorHandler(err: HttpError, req: Request, res: Response, _next: NextFunction): void {
  const status = err.status || err.statusCode || 500;
  const message = err.expose ? err.message : 'Internal server error';

  logger.error(err.message, {
    status,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(status).json({
    error: err.code || 'internal_error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export default errorHandler;
