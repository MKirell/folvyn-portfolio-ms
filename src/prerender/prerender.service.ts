import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { LAMBDA_CLIENT } from '@/prerender/lambda.token'
import type { PrerenderConfig } from '@/config/configuration'

export interface PrerenderAttempt {
  slug: string
  requestedAt: string
  succeeded: boolean
  detail: string | null
}

@Injectable()
export class PrerenderService implements OnModuleDestroy {
  private readonly logger = new Logger(PrerenderService.name)
  private readonly config: PrerenderConfig
  private readonly pending = new Map<string, NodeJS.Timeout>()
  private readonly attempts = new Map<string, PrerenderAttempt>()

  constructor(
    @Inject(LAMBDA_CLIENT) private readonly client: LambdaClient,
    config: ConfigService,
  ) {
    this.config = config.getOrThrow<PrerenderConfig>('prerender')
  }

  get enabled(): boolean {
    return this.config.functionName !== ''
  }

  schedule(slug: string, options: { removed?: boolean } = {}): void {
    if (!this.enabled || !slug) return

    const existing = this.pending.get(slug)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.pending.delete(slug)
      void this.run(slug, options.removed === true)
    }, this.config.debounceMs)

    timer.unref?.()
    this.pending.set(slug, timer)
  }

  async flush(): Promise<void> {
    const slugs = [...this.pending.keys()]

    for (const slug of slugs) {
      clearTimeout(this.pending.get(slug))
      this.pending.delete(slug)
      await this.run(slug, false)
    }
  }

  recent(): PrerenderAttempt[] {
    return [...this.attempts.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  }

  private async run(slug: string, removed: boolean): Promise<void> {
    const attempt: PrerenderAttempt = {
      slug,
      requestedAt: new Date().toISOString(),
      succeeded: false,
      detail: null,
    }

    try {
      await this.client.send(
        new InvokeCommand({
          FunctionName: this.config.functionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ slug, removed })),
        }),
      )
      attempt.succeeded = true
    } catch (error) {
      attempt.detail = (error as Error).message
      this.logger.error(`Could not ask the renderer for ${slug}: ${attempt.detail}`)
    }

    this.attempts.set(slug, attempt)
  }

  onModuleDestroy(): void {
    for (const timer of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
  }
}
