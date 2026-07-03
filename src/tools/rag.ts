import { ChromaClient, Collection, Metadata, QueryResponse } from 'chromadb';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import logger from '../tools/logger';
import { ServiceHealth } from '../types';

let client: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!client) {
    client = new ChromaClient({ path: config.endpoints.chromadb });
  }
  return client;
}

async function getOrCreateCollection(name: string): Promise<Collection | null> {
  try {
    return await getClient().getOrCreateCollection({ name });
  } catch (err: unknown) {
    logger.error('ChromaDB getOrCreateCollection failed', { name, error: (err as Error).message });
    return null;
  }
}

interface IngestParams {
  collection: string | Collection;
  documents: string[];
  ids?: string[];
  metadatas?: Metadata[];
}

interface IngestResult {
  added: number;
  ids: string[];
}

async function ingest({ collection, documents, ids, metadatas }: IngestParams): Promise<IngestResult | null> {
  try {
    const col = typeof collection === 'string' ? await getOrCreateCollection(collection) : collection;
    if (!col) return null;
    const resolvedIds = ids || documents.map(() => uuidv4());
    const params: { documents: string[]; ids: string[]; metadatas?: Metadata[] } = { documents, ids: resolvedIds };
    if (metadatas) params.metadatas = metadatas;
    await col.add(params);
    return { added: resolvedIds.length, ids: resolvedIds };
  } catch (err: unknown) {
    logger.error('ChromaDB ingest failed', { error: (err as Error).message });
    return null;
  }
}

interface QueryParams {
  collection: string | Collection;
  queryTexts: string[];
  nResults?: number;
}

async function query({ collection, queryTexts, nResults = 5 }: QueryParams): Promise<QueryResponse | null> {
  try {
    const col = typeof collection === 'string' ? await getOrCreateCollection(collection) : collection;
    if (!col) return null;
    return await col.query({ queryTexts, nResults });
  } catch (err: unknown) {
    logger.error('ChromaDB query failed', { error: (err as Error).message });
    return null;
  }
}

async function listCollections(): Promise<string[] | null> {
  try {
    return await getClient().listCollections();
  } catch (err: unknown) {
    logger.error('ChromaDB listCollections failed', { error: (err as Error).message });
    return null;
  }
}

async function deleteCollection(name: string): Promise<boolean | null> {
  try {
    await getClient().deleteCollection({ name });
    return true;
  } catch (err: unknown) {
    logger.error('ChromaDB deleteCollection failed', { name, error: (err as Error).message });
    return null;
  }
}

async function getHealth(): Promise<ServiceHealth> {
  try {
    const collections = await getClient().listCollections();
    return { healthy: true, collections: collections.length };
  } catch (err: unknown) {
    logger.error('ChromaDB health check failed', { error: (err as Error).message });
    return { healthy: false, collections: 0 };
  }
}

export {
  getClient,
  getOrCreateCollection,
  ingest,
  query,
  listCollections,
  deleteCollection,
  getHealth,
};
