import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Degree } from '@/portfolio/education/degree.schema'

@Injectable()
export class DegreeService extends BaseCrudService<Degree> {
  constructor(@InjectModel(Degree.name) model: Model<Degree>) {
    super(model, 'Degree')
  }
}
