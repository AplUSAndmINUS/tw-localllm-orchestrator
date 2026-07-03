import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config';
import logger from './tools/logger';
import authMiddleware from './middleware/auth';
import rateLimiter from './middleware/rateLimit';
import errorHandler from './middleware/errorHandler';

import chatRoute from './routes/chat';
import ragRoute from './routes/rag';
import sttRoute from './routes/stt';
import ttsRoute from './routes/tts';
import imageRoute from './routes/image';
import codeRoute from './routes/code';
import visionRoute from './routes/vision';
import cloudRoute from './routes/cloud';
import healthRoute from './routes/health';
import modelsRoute from './routes/models';
import agentsRoute from './routes/agents';

import { startHealthPolling } from './tools/health';

const app: Application = express();

app.use(helmet());
app.use(cors({ origin: config.cors.origins }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}));

app.use('/v1', rateLimiter);
app.use('/v1', authMiddleware);

app.get('/v1/health', healthRoute);
app.get('/v1/models', modelsRoute);
app.get('/v1/agents', agentsRoute);

app.post('/v1/chat', chatRoute);
app.post('/v1/rag', ragRoute);
app.post('/v1/stt', sttRoute);
app.post('/v1/tts', ttsRoute);
app.post('/v1/image', imageRoute);
app.post('/v1/code', codeRoute);
app.post('/v1/vision', visionRoute);
app.post('/v1/cloud', cloudRoute);

app.use(errorHandler);

const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, () => {
  logger.info(`APlus Orchestrator running on http://${HOST}:${PORT}`);
  logger.info(`Environment: ${config.server.env}`);
  logger.info('Endpoints configured:', {
    ollama: config.endpoints.ollama,
    lmstudio: config.endpoints.lmstudio,
    xtts: config.endpoints.xtts,
    onnx: config.endpoints.onnx,
    chromadb: config.endpoints.chromadb,
  });
  startHealthPolling();
});

export default app;
