import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'

@Injectable()
export class SaltService {
  private salt = randomBytes(32).toString('hex')
  private day = SaltService.today()

  static today(at: Date = new Date()): string {
    return at.toISOString().slice(0, 10)
  }

  current(at: Date = new Date()): string {
    const day = SaltService.today(at)
    if (day !== this.day) {
      this.day = day
      this.salt = randomBytes(32).toString('hex')
    }
    return this.salt
  }

  visitorDay(parts: readonly (string | undefined)[], at: Date = new Date()): string {
    return createHash('sha256')
      .update([this.current(at), ...parts.map((part) => part ?? '')].join('|'))
      .digest('hex')
      .slice(0, 16)
  }
}
