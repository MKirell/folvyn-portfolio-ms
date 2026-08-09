import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { SpokenLanguage } from '@/portfolio/education/spoken-language.schema'

@Injectable()
export class SpokenLanguageService extends BaseCrudService<SpokenLanguage> {
  constructor(@InjectModel(SpokenLanguage.name) model: Model<SpokenLanguage>) {
    super(model, 'Spoken language')
  }
}
