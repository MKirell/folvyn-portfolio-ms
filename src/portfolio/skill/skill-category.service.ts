import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { SkillCategory } from '@/portfolio/skill/skill-category.schema'

@Injectable()
export class SkillCategoryService extends BaseCrudService<SkillCategory> {
  constructor(@InjectModel(SkillCategory.name) model: Model<SkillCategory>) {
    super(model, 'Skill category')
  }
}
