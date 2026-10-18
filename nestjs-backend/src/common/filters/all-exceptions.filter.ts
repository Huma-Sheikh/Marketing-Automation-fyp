import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** The body of every error response the API sends. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  /** Always a single human-readable string, safe to show in the UI. */
  message: string;
  /** Individual messages when there were several (e.g. one per invalid field). */
  errors?: string[];
  path: string;
  timestamp: string;
}

/**
 * One error shape for the whole API.
 *
 * HttpExceptions keep their status and message. Validation errors, which Nest
 * reports as an array of messages, are joined into `message` and also listed in
 * `errors`, so clients can always display `message` directly. Anything else is
 * an unexpected failure: it is logged with its stack and the client gets a
 * generic 500 that leaks no internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (res.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let messages: string[] = ['Something went wrong. Please try again.'];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        messages = [body];
        error = exception.name;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        messages = Array.isArray(b.message) ? b.message : [b.message ?? exception.message];
        error = b.error ?? exception.name;
      }
    }

    if (status >= 500) {
      const err = exception as Error;
      this.logger.error(`${req.method} ${req.originalUrl} -> ${status}: ${err?.message}`, err?.stack);
    }

    const payload: ApiErrorBody = {
      statusCode: status,
      error,
      message: messages.join('; '),
      ...(messages.length > 1 ? { errors: messages } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(payload);
  }
}
