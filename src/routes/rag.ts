import { Request, Response, NextFunction } from 'express';
import ragAgent from '../agents/ragAgent';
import * as ragTool from '../tools/rag';
import * as containerManager from '../tools/containerManager';
import logger from '../tools/logger';

async function ragRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { action } = req.body;

    if (action === 'ingest') {
      await handleIngest(req, res);
      return;
    }

    await handleQuery(req, res);
  } catch (err) {
    next(err);
  }
}

async function handleQuery(req: Request, res: Response): Promise<void> {
  const { messages, query, collection, namespace, agent: agentId, top_k = 5, options = {} } = req.body;

  if (!query && (!messages || messages.length === 0)) {
    res.status(400).json({ error: 'bad_request', message: 'query or messages required' });
    return;
  }

  await containerManager.ensureRunning('ollama');
  await containerManager.ensureRunning('chromadb');
  containerManager.recordActivity('ollama');
  containerManager.recordActivity('chromadb');

  const collectionName = collection || (agentId ? `${agentId}_${namespace || 'default'}` : 'default');
  const queryText = query || messages[messages.length - 1].content;

  let context: string[] = [];
  try {
    const results = await ragTool.query({ collection: collectionName, queryTexts: [queryText], nResults: top_k });
    if (results && results.documents && results.documents[0]) {
      context = results.documents[0] as string[];
    }
  } catch (err: unknown) {
    logger.warn('RAG query failed, proceeding without context', { error: (err as Error).message });
  }

  const ragMessages = messages || [{ role: 'user', content: queryText }];
  const result = await ragAgent.execute({ messages: ragMessages, context, options });

  if (!result) {
    res.status(502).json({ error: 'rag_error', message: 'RAG agent failed to produce a response' });
    return;
  }

  result.rag = { collection: collectionName, contextChunks: context.length, topK: top_k };
  res.json(result);
}

async function handleIngest(req: Request, res: Response): Promise<void> {
  const { collection, namespace, agent: agentId, documents, ids, metadatas, chunk_size, chunk_overlap } = req.body;

  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    res.status(400).json({ error: 'bad_request', message: 'documents array is required for ingestion' });
    return;
  }

  await containerManager.ensureRunning('chromadb');
  containerManager.recordActivity('chromadb');

  const collectionName = collection || (agentId ? `${agentId}_${namespace || 'default'}` : 'default');

  const result = await ragTool.ingest({
    collection: collectionName,
    documents,
    ids,
    metadatas,
  });

  if (!result) {
    res.status(502).json({ error: 'ingest_error', message: 'Failed to ingest documents' });
    return;
  }

  res.json({
    status: 'ingested',
    collection: collectionName,
    documentCount: documents.length,
  });
}

export default ragRoute;
