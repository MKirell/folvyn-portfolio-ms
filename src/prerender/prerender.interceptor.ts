import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { tap } from 'rxjs/operators'
import type { Observable } from 'rxjs'
import { PrerenderService } from '@/prerender/prerender.service'
import type { OwnerScopedRequest } from '@/common/guards/owner-scope.guard'

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

interface OwnerShaped {
  slug?: unknown
  status?: unknown
}

@Injectable()
export class PrerenderInterceptor implements NestInterceptor {
  constructor(private readonly prerender: PrerenderService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<OwnerScopedRequest>()
    if (!MUTATIONS.has(request.method) || !this.prerender.enabled) return next.handle()

    return next.handle().pipe(
      tap((body: unknown) => {
        const answered = (body ?? {}) as OwnerShaped
        const slug = typeof answered.slug === 'string' ? answered.slug : request.owner?.slug
        if (!slug) return

        const status = typeof answered.status === 'string' ? answered.status : request.owner?.status
        if (status !== 'published' && status !== 'draft') return

        this.prerender.schedule(slug, { removed: status !== 'published' })
      }),
    )
  }
}
