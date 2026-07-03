import { Request, Response, NextFunction } from 'express';
import * as ollama from '../models/ollama';
import * as lmstudio from '../models/lmstudio';
import modelRegistry from '../config/modelRegistry.json';

async function modelsRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const runtimeFilter = req.query.runtime as string | undefined;
    const result: { models: Record<string, unknown>[] } = { models: [] };

    if (!runtimeFilter || runtimeFilter === 'ollama') {
      const ollamaHealth = await ollama.getHealth();
      if (ollamaHealth && ollamaHealth.models) {
        for (const m of ollamaHealth.models) {
          result.models.push({
            id: m,
            runtime: 'ollama',
            loaded: true,
          });
        }
      }
    }

    if (!runtimeFilter || runtimeFilter === 'lmstudio') {
      const loadedModel = await lmstudio.getLoadedModel();
      if (loadedModel) {
        result.models.push({
          id: loadedModel,
          runtime: 'lmstudio',
          loaded: true,
        });
      }
    }

    if (!runtimeFilter || runtimeFilter === 'registry') {
      for (const [key, model] of Object.entries((modelRegistry as Record<string, unknown>).models as Record<string, Record<string, unknown>>)) {
        result.models.push({
          id: model.id,
          name: model.name,
          runtime: model.runtime,
          purpose: model.purpose,
          capabilities: model.capabilities,
          registered: true,
        });
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export default modelsRoute;
