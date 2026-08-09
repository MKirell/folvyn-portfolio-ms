import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common'
import type { OwnerScopedRequest } from '@/common/guards/owner-scope.guard'
import type { OwnerRecord } from '@/owner/owner.service'

function readOwner(ctx: ExecutionContext): OwnerRecord {
  const request = ctx.switchToHttp().getRequest<OwnerScopedRequest>()
  if (!request.owner) {
    throw new ForbiddenException('This endpoint belongs to a portfolio owner')
  }
  return request.owner
}

export const CurrentOwner = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  readOwner(ctx),
)

export const OwnerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => readOwner(ctx).id,
)
