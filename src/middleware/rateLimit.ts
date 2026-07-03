import rateLimit from 'express-rate-limit';
import config from '../config';

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many requests', retryAfter: Math.ceil(config.rateLimit.windowMs / 1000) },
});

export default limiter;
