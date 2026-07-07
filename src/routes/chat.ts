import { Request, Response, NextFunction } from 'express';
import entryAgent from '../agents/entryAgent';
import reasoningAgent from '../agents/reasoningAgent';
import statsAgent from '../agents/statsAgent';
import ragAgent from '../agents/ragAgent';
import codingAgent from '../agents/codingAgent';
import mathAgent from '../agents/mathAgent';
import imageAgentHigh from '../agents/imageAgentHigh';
import imageAgentLow from '../agents/imageAgentLow';
import visionAgent from '../agents/visionAgent';
import cloudAgent from '../agents/cloudAgent';
import logger from '../tools/logger';
import * as containerManager from '../tools/containerManager';
import { Agent, ClassifyingAgent, ContainerService } from '../types';

const INTENT_CONTAINER_MAP: Record<string, ContainerService> = {
  reasoning_heavy: 'ollama',
  stats: 'ollama',
  rag: 'ollama',
  coding: 'ollama',
  math: 'ollama',
  general: 'ollama',
};

const AGENT_MAP: Record<string, Agent> = {
  reasoning_heavy: reasoningAgent,
  stats: statsAgent,
  rag: ragAgent,
  coding: codingAgent,
  math: mathAgent,
  image_high: imageAgentHigh,
  image_low: imageAgentLow,
  vision: visionAgent,
  cloud: cloudAgent,
  general: entryAgent,
};

// CloudAgent's routes use their own cloud-capability vocabulary (see
// agentProfiles.json CloudAgent.routes), not the local intent names above —
// this maps a saturated-GPU escalation to the closest cloud tier.
const INTENT_TO_CLOUD_ROUTE: Record<string, string> = {
  reasoning_heavy: 'heavy_reasoning',
  stats: 'mid_reasoning',
  rag: 'mid_reasoning',
  coding: 'major_code',
  math: 'mid_reasoning',
  general: 'mid_reasoning',
};

async function chatRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messages, model, agent: agentOverride, intent: intentOverride, stream, options = {} } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'messages array is required' });
      return;
    }

    if (model) {
      options.model = model;
    }

    let intent = intentOverride as string | undefined;
    let classification = null;

    if (!intent && !agentOverride) {
      classification = await (entryAgent as ClassifyingAgent).classify(messages);
      intent = classification ? classification.intent : 'general';
      logger.info(`Intent classified: ${intent}`, { confidence: classification?.confidence });
    }

    if (agentOverride && AGENT_MAP[agentOverride]) {
      intent = agentOverride;
    }

    const selectedAgent = AGENT_MAP[intent!] || entryAgent;

    const requiredContainer = INTENT_CONTAINER_MAP[intent!];
    if (requiredContainer) {
      if (containerManager.isGpuSaturated()) {
        const recovered = await containerManager.freeGpuHeadroom(requiredContainer);
        if (!recovered && AGENT_MAP['cloud']) {
          const cloudIntent = INTENT_TO_CLOUD_ROUTE[intent!] || 'mid_reasoning';
          logger.info('GPU saturated after recovery attempt, routing to cloud', { intent, cloudIntent });
          const cloudResult = await AGENT_MAP['cloud'].execute({ messages, options, cloudIntent });
          if (classification) cloudResult.classification = classification;
          res.json(cloudResult);
          return;
        }
      }
      await containerManager.ensureRunning(requiredContainer);
      containerManager.recordActivity(requiredContainer);
    }

    const result = await selectedAgent.execute({ messages, options });

    if (!result) {
      res.status(502).json({ error: 'agent_error', message: `Agent ${intent} failed to produce a response` });
      return;
    }

    if (classification) {
      result.classification = classification;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default chatRoute;
