import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection, ConnectionStates } from 'mongoose'
import { Public } from '@/common/decorators/public.decorator'

export const READY_TIMEOUT_MS = 5_000

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check(): Promise<{ status: string }> {
    if (this.connection.readyState === ConnectionStates.connecting) {
      await this.settled()
    }

    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException('Not ready')
    }

    return { status: 'ok' }
  }

  private async settled(): Promise<void> {
    let timer: NodeJS.Timeout | undefined

    try {
      await Promise.race([
        this.connection.asPromise(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, READY_TIMEOUT_MS)
        }),
      ])
    } catch {
      return
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
