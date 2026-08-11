export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const asInt = (value, name) => {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${name} must be an integer`);
  return n;
};

export const asBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
};

export const requireQuery = (req, name) => {
  const value = req.query[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `query parameter "${name}" is required`);
  }
  return value.trim();
};

export const notFound = (row, message) => {
  if (row === null || row === undefined) throw new HttpError(404, message);
  return row;
};

// Express 4 does not forward rejected promises to the error handler.
export const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
