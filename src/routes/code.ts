import { Request, Response, NextFunction } from 'express';
import codingAgent from '../agents/codingAgent';
import logger from '../tools/logger';

async function codeRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messages, prompt, language, options = {} } = req.body;

    const inputMessages = messages || [{ role: 'user', content: prompt }];

    if (!inputMessages || inputMessages.length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'messages or prompt is required' });
      return;
    }

    if (language) {
      options.language = language;
    }

    const result = await codingAgent.execute({ messages: inputMessages, options });

    if (!result) {
      res.status(502).json({ error: 'code_error', message: 'Coding agent failed' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default codeRoute;
