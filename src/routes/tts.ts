import { Request, Response, NextFunction } from 'express';
import ttsAgent from '../agents/ttsAgent';
import logger from '../tools/logger';

async function ttsRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { text, agent: agentId, language, voiceRef, options = {} } = req.body;

    if (!text) {
      res.status(400).json({ error: 'bad_request', message: 'text is required' });
      return;
    }

    const result = await ttsAgent.execute({
      text,
      language: language || 'en',
      voiceRef,
      options,
    });

    if (!result) {
      res.status(502).json({ error: 'tts_error', message: 'TTS agent failed' });
      return;
    }

    if (result.audioBuffer) {
      res.set('Content-Type', 'audio/wav');
      res.send(result.audioBuffer);
    } else {
      res.json(result);
    }
  } catch (err) {
    next(err);
  }
}

export default ttsRoute;
