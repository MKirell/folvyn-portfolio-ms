import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Experience } from '@/portfolio/experience/experience.schema'

@Injectable()
export class ExperienceService extends BaseCrudService<Experience> {
  constructor(@InjectModel(Experience.name) model: Model<Experience>) {
    super(model, 'Experience')
  }
}
