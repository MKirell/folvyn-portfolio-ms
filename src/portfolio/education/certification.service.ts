import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Certification } from '@/portfolio/education/certification.schema'

@Injectable()
export class CertificationService extends BaseCrudService<Certification> {
  constructor(@InjectModel(Certification.name) model: Model<Certification>) {
    super(model, 'Certification')
  }
}
