import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ErrorCode } from '@shedflow/shared';
import type { Request, Response } from 'express';
import { readRequestId } from './request-id.middleware';

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown> | null;
    requestId: string;
  };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = readRequestId(request);

    const mapped = this.mapException(exception);
    if (mapped.status >= 500) {
      this.logger.error(
        mapped.message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorEnvelope = {
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
        requestId,
      },
    };

    response.status(mapped.status).json(body);
  }

  describe(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ErrorEnvelope } {
    const mapped = this.mapException(exception);
    return {
      status: mapped.status,
      body: {
        error: {
          code: mapped.code,
          message: mapped.message,
          details: mapped.details,
          requestId,
        },
      },
    };
  }

  private mapException(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details: Record<string, unknown> | null;
  } {
    if (exception instanceof UnauthorizedException) {
      const payload = this.httpPayload(exception);
      const expired =
        this.isTokenExpired(exception) || payload.code === 'TOKEN_EXPIRED';
      return {
        status: HttpStatus.UNAUTHORIZED,
        code: expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED',
        message: expired
          ? 'Access token expired'
          : this.httpMessage(exception, 'Authentication required'),
        details: this.detailsFromPayload(payload),
      };
    }

    if (exception instanceof ForbiddenException) {
      const payload = this.httpPayload(exception);
      return {
        status: HttpStatus.FORBIDDEN,
        code: payload.code === 'FEATURE_GATED' ? 'FEATURE_GATED' : 'FORBIDDEN',
        message: this.httpMessage(exception, 'Forbidden'),
        details: this.detailsFromPayload(payload),
      };
    }

    if (exception instanceof NotFoundException) {
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: this.httpMessage(exception, 'Not found'),
        details: null,
      };
    }

    if (exception instanceof ConflictException) {
      const payload = this.httpPayload(exception);
      return {
        status: HttpStatus.CONFLICT,
        code: this.codeForStatus(HttpStatus.CONFLICT, payload.code),
        message: this.httpMessage(exception, exception.message),
        details: this.detailsFromPayload(payload),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = this.httpPayload(exception);
      const fieldErrors = this.extractFieldErrors(payload);
      if (status === HttpStatus.BAD_REQUEST || fieldErrors) {
        const explicit =
          typeof payload.code === 'string' && payload.code.length > 0
            ? payload.code
            : undefined;
        return {
          status: HttpStatus.BAD_REQUEST,
          code: fieldErrors
            ? 'VALIDATION_ERROR'
            : this.codeForStatus(status, explicit),
          message: fieldErrors
            ? 'Validation failed'
            : this.httpMessage(exception, 'Validation failed'),
          details: fieldErrors
            ? { fieldErrors }
            : this.detailsFromPayload(payload),
        };
      }

      return {
        status,
        code: this.codeForStatus(status, payload.code),
        message: this.httpMessage(exception, exception.message),
        details: this.detailsFromPayload(payload),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: 'Internal server error',
      details: null,
    };
  }

  private httpPayload(exception: HttpException): Record<string, unknown> {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response };
    }
    if (response && typeof response === 'object') {
      return response as Record<string, unknown>;
    }
    return {};
  }

  private httpMessage(exception: HttpException, fallback: string): string {
    const payload = this.httpPayload(exception);
    const message = payload.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join(', ');
    }
    return fallback;
  }

  private extractFieldErrors(
    payload: Record<string, unknown>,
  ): Record<string, string[]> | null {
    const nested = payload.fieldErrors;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, string[]>;
    }

    const message = payload.message;
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return { _errors: message };
    }

    return null;
  }

  private detailsFromPayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const { statusCode: _s, error: _e, message: _m, code: _c, ...rest } =
      payload;
    return Object.keys(rest).length > 0 ? rest : null;
  }

  private isTokenExpired(exception: UnauthorizedException): boolean {
    const message = this.httpMessage(exception, '').toLowerCase();
    return message.includes('jwt expired') || message.includes('token expired');
  }

  private codeForStatus(status: number, explicit?: unknown): ErrorCode {
    if (typeof explicit === 'string' && explicit.length > 0) {
      return explicit as ErrorCode;
    }
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'OUTSIDE_POLICY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.BAD_GATEWAY:
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'UPSTREAM_UNAVAILABLE';
      default:
        return status >= 500 ? 'INTERNAL' : 'VALIDATION_ERROR';
    }
  }
}
