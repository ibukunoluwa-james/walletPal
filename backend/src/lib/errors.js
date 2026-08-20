/** One error type, so every route reports failures the same way. */

export class AppError extends Error {
  constructor(statusCode, message, code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message, code) => new AppError(400, message, code);
export const unauthorized = (message, code) => new AppError(401, message, code);
export const forbidden = (message, code) => new AppError(403, message, code);
export const notFound = (message, code) => new AppError(404, message, code);
export const conflict = (message, code) => new AppError(409, message, code);
