import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Award } from '@/portfolio/achievement/award.schema'

@Injectable()
export class AwardService extends BaseCrudService<Award> {
  constructor(@InjectModel(Award.name) model: Model<Award>) {
    super(model, 'Award')
  }
}
