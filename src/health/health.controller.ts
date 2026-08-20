import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection, ConnectionStates } from 'mongoose'
import { Public } from '@/common/decorators/public.decorator'

export const READY_TIMEOUT_MS = 5_000
export const POLL_MS = 100

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check(): Promise<{ status: string }> {
    if (this.connection.readyState !== ConnectionStates.connected) {
      await this.settled()
    }

    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException('Not ready')
    }

    return { status: 'ok' }
  }

  private async settled(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS

    while (Date.now() < deadline) {
      if (this.connection.readyState === ConnectionStates.connected) return
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
  }
}
