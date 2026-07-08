import { HttpError } from '../types';

function httpError(status: number, message: string, code?: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  err.expose = true;
  if (code) err.code = code;
  return err;
}

export default httpError;
