import { Request, Response, NextFunction } from 'express';
import speechAgent from '../agents/speechAgent';
import * as containerManager from '../tools/containerManager';
import logger from '../tools/logger';

async function sttRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { audio, language, options = {} } = req.body;

    if (!audio) {
      res.status(400).json({ error: 'bad_request', message: 'audio data is required (base64 encoded)' });
      return;
    }

    await containerManager.ensureRunning('ollama');
    containerManager.recordActivity('ollama');

    const result = await speechAgent.execute({
      prompt: audio,
      options: { language, ...options },
    });

    if (!result) {
      res.status(502).json({ error: 'stt_error', message: 'Speech-to-text agent failed' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default sttRoute;
