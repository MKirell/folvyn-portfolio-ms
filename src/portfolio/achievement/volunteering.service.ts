import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Volunteering } from '@/portfolio/achievement/volunteering.schema'

@Injectable()
export class VolunteeringService extends BaseCrudService<Volunteering> {
  constructor(@InjectModel(Volunteering.name) model: Model<Volunteering>) {
    super(model, 'Volunteering entry')
  }
}
