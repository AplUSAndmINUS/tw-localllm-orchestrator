import { Request, Response, NextFunction } from 'express';
import agentProfiles from '../config/agentProfiles.json';

function agentsRoute(req: Request, res: Response): void {
  const agents = Object.entries((agentProfiles as Record<string, unknown>).agents as Record<string, Record<string, unknown>>).map(([id, profile]) => ({
    id,
    name: profile.agentName,
    description: profile.description,
    runtime: profile.runtime,
    model: profile.model,
    capabilities: profile.capabilities,
    costModel: profile.costModel,
  }));
  res.json({ agents });
}

export default agentsRoute;
