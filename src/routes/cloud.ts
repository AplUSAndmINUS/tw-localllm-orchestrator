import { Request, Response, NextFunction } from 'express';
import cloudAgent from '../agents/cloudAgent';
import logger from '../tools/logger';

async function cloudRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messages, prompt, cloudIntent = 'mid_reasoning', options = {} } = req.body;

    const inputMessages = messages || [{ role: 'user', content: prompt }];

    if (!inputMessages || inputMessages.length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'messages or prompt is required' });
      return;
    }

    const result = await cloudAgent.execute({
      messages: inputMessages,
      cloudIntent,
      options,
    });

    if (!result) {
      res.status(502).json({ error: 'cloud_error', message: 'Cloud agent failed' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default cloudRoute;
