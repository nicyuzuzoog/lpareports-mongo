export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(message = 'Record not found.') {
  return new HttpError(404, message);
}

export function forbidden(message = 'You do not have permission to perform this action.') {
  return new HttpError(403, message);
}

export function badRequest(message, details) {
  return new HttpError(400, message, details);
}
