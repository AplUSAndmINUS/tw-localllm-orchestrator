import axios from 'axios';
import config from '../config';
import logger from '../tools/logger';
import { ServiceHealth } from '../types';

const endpoint: string = config.endpoints.onnx;

async function embed(input: string | string[]): Promise<number[][] | null> {
  try {
    const { data } = await axios.post(`${endpoint}/embed`, { inputs: input });
    return data;
  } catch (err: unknown) {
    logger.error('ONNX embed failed', { error: (err as Error).message });
    return null;
  }
}

async function getHealth(): Promise<ServiceHealth> {
  try {
    await axios.get(`${endpoint}/health`);
    return { healthy: true };
  } catch (err: unknown) {
    logger.error('ONNX health check failed', { error: (err as Error).message });
    return { healthy: false };
  }
}

export {
  embed,
  getHealth,
};
