import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Locale } from '@/portfolio/locale/locale.schema'
import type { LocaleSummary } from '@/common/types/portfolio.types'

@Injectable()
export class LocaleService extends BaseCrudService<Locale> {
  constructor(@InjectModel(Locale.name) model: Model<Locale>) {
    super(model, 'Locale')
  }

  async findEnabled(ownerId: string): Promise<LocaleSummary[]> {
    const locales = await this.model
      .find(this.scoped(ownerId, { enabled: true }))
      .sort({ order: 1 })
      .select('code flagCode')
      .lean<LocaleSummary[]>()
      .exec()
    return locales.map(({ code, flagCode }) => ({ code, flagCode }))
  }

  async isSupported(ownerId: string, code: string): Promise<boolean> {
    const found = await this.model.exists(this.scoped(ownerId, { code, enabled: true })).exec()
    return found !== null
  }
}
