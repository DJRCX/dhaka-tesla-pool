import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ErrorCodes, extractPgError, mapPostgresError } from './errors.js';

function getRequestId(request: FastifyRequest): string {
  const existing = request.id;
  if (typeof existing === 'string' && existing.length > 0) return existing;
  return 'unknown';
}

/** Fastify error handlers are not inherited across encapsulated plugins — call this in each scope. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    const requestId = getRequestId(request);

    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      });
    }

    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request validation failed',
          requestId,
          details: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    const validation = err as FastifyError;
    if (validation.validation) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: validation.message,
          requestId,
          details: validation.validation,
        },
      });
    }

    if ((err as FastifyError).statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: ErrorCodes.RATE_LIMITED,
          message: 'Too many requests. Please try again later.',
          requestId,
        },
      });
    }

    const pg = extractPgError(err);
    if (pg) {
      const mapped = mapPostgresError(pg);
      if (mapped) {
        return reply.status(mapped.statusCode).send({
          error: {
            code: mapped.code,
            message: mapped.message,
            requestId,
            details: mapped.details,
          },
        });
      }
      request.log.error({ err, constraint: pg.constraint }, 'unmapped postgres error');
      return reply.status(500).send({
        error: {
          code: ErrorCodes.INTERNAL,
          message: 'An unexpected error occurred',
          requestId,
        },
      });
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: ErrorCodes.INTERNAL,
        message: 'An unexpected error occurred',
        requestId,
      },
    });
  });
}
