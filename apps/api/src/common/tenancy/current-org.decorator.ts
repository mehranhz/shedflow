import { createParamDecorator, ExecutionContext, NotFoundException } from '@nestjs/common';
import { readRequestContext } from './request-context.http';
import { RequestContextValue } from './request-context';

export const CurrentOrgContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContextValue => {
    const request = context.switchToHttp().getRequest<object>();
    const value = readRequestContext(request);
    if (!value) {
      throw new NotFoundException('Not found');
    }
    return value;
  },
);
