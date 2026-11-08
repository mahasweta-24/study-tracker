export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (m) => new HttpError(400, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);

export function requireMessage(body) {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) throw badRequest('A message is required for this change.');
  if (message.length > 1000) throw badRequest('Message is too long (max 1000 characters).');
  return message;
}

export function requireInt(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}
