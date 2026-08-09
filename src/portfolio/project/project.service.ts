import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { Project } from '@/portfolio/project/project.schema'

@Injectable()
export class ProjectService extends BaseCrudService<Project> {
  constructor(@InjectModel(Project.name) model: Model<Project>) {
    super(model, 'Project')
  }
}
