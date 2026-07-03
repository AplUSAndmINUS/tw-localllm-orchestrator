import { Request, Response, NextFunction } from 'express';
import visionAgent from '../agents/visionAgent';
import * as containerManager from '../tools/containerManager';
import logger from '../tools/logger';
import { ChatMessage } from '../types';

async function visionRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messages, image, prompt, options = {} } = req.body;

    const inputMessages: ChatMessage[] = messages || [];

    if (image && prompt) {
      inputMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      });
    } else if (!inputMessages.length) {
      res.status(400).json({ error: 'bad_request', message: 'messages, or image+prompt, required' });
      return;
    }

    await containerManager.ensureRunning('ollama');
    containerManager.recordActivity('ollama');

    const result = await visionAgent.execute({ messages: inputMessages, options });

    if (!result) {
      res.status(502).json({ error: 'vision_error', message: 'Vision agent failed' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default visionRoute;
