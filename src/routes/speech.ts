import { Request, Response, NextFunction } from 'express';
import azureSpeechTtsAgent from '../agents/azureSpeechTtsAgent';
import azureSpeechSttAgent from '../agents/azureSpeechSttAgent';
import * as azureSpeech from '../cloud/azureSpeech';

async function tts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { text, voice, options = {} } = req.body;

    if (!text) {
      res.status(400).json({ error: 'bad_request', message: 'text is required' });
      return;
    }

    const result = await azureSpeechTtsAgent.execute({ text, voice, options });

    if (!result) {
      res.status(502).json({ error: 'azure_tts_error', message: 'Azure Speech TTS failed' });
      return;
    }

    res.set('Content-Type', 'audio/wav');
    res.send(Buffer.from(result.content, 'base64'));
  } catch (err) {
    next(err);
  }
}

async function stt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { audio, language, options = {} } = req.body;

    if (!audio) {
      res.status(400).json({ error: 'bad_request', message: 'audio data is required (base64 encoded)' });
      return;
    }

    const result = await azureSpeechSttAgent.execute({ audio, options: { language, ...options } });

    if (!result) {
      res.status(502).json({ error: 'azure_stt_error', message: 'Azure Speech STT failed' });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listCnv(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!azureSpeech.isAvailable()) {
      res.status(503).json({ error: 'not_configured', message: 'Azure Speech is not configured' });
      return;
    }

    const projects = await azureSpeech.listCnvProjects();

    if (projects === null) {
      res.status(502).json({ error: 'cnv_error', message: 'Failed to list Custom Neural Voice projects' });
      return;
    }

    res.json({ projects });
  } catch (err) {
    next(err);
  }
}

async function synthesizeCnv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { text, deploymentId, voiceName } = req.body;

    if (!text || !deploymentId || !voiceName) {
      res.status(400).json({ error: 'bad_request', message: 'text, deploymentId, and voiceName are all required' });
      return;
    }

    if (!azureSpeech.isAvailable()) {
      res.status(503).json({ error: 'not_configured', message: 'Azure Speech is not configured' });
      return;
    }

    const audioBuffer = await azureSpeech.synthesizeCustomVoice(text, deploymentId, voiceName);

    if (!audioBuffer) {
      res.status(502).json({ error: 'cnv_error', message: 'Custom Neural Voice synthesis failed' });
      return;
    }

    res.set('Content-Type', 'audio/wav');
    res.send(audioBuffer);
  } catch (err) {
    next(err);
  }
}

export default { tts, stt, listCnv, synthesizeCnv };
