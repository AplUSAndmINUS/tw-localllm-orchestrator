import { Request, Response, NextFunction } from 'express';
import imageAgentHigh from '../agents/imageAgentHigh';
import imageAgentLow from '../agents/imageAgentLow';
import logger from '../tools/logger';

async function imageRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messages, prompt, quality = 'high', options = {} } = req.body;

    const inputMessages = messages || [{ role: 'user', content: prompt }];

    if (!inputMessages || inputMessages.length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'messages or prompt is required' });
      return;
    }

    const agent = quality === 'low' ? imageAgentLow : imageAgentHigh;
    const result = await agent.execute({ messages: inputMessages, options });

    if (!result) {
      res.status(502).json({ error: 'image_error', message: 'Image agent failed' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default imageRoute;
