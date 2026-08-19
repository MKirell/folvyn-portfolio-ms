import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class SkillCategoryTranslation {
  @Prop({ required: true, trim: true })
  title: string
}

export const SkillCategoryTranslationSchema = SchemaFactory.createForClass(SkillCategoryTranslation)

@Schema({ ...baseSchemaOptions, collection: 'skill_categories' })
export class SkillCategory {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, default: 0, min: 0 })
  order: number

  @Prop({ required: true, trim: true })
  icon: string

  @Prop({ type: [String], default: [] })
  tags: string[]

  @Prop({ type: [String], default: [] })
  accentTags: string[]

  @Prop({ type: Map, of: SkillCategoryTranslationSchema, required: true })
  translations: Map<string, SkillCategoryTranslation>
}

export type SkillCategoryDocument = HydratedDocument<SkillCategory>
export const SkillCategorySchema = SchemaFactory.createForClass(SkillCategory)

SkillCategorySchema.index({ ownerId: 1, order: 1 })
