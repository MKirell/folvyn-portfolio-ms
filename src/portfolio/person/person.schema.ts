import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdUniqueProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class PersonTranslation {
  @Prop({ required: true, trim: true })
  headline: string

  @Prop({ type: [String], default: [] })
  aboutParagraphs: string[]
}

export const PersonTranslationSchema = SchemaFactory.createForClass(PersonTranslation)

@Schema({ ...baseSchemaOptions, collection: 'person' })
export class Person {
  @Prop(ownerIdUniqueProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, trim: true })
  givenName: string

  @Prop({ required: true, trim: true })
  familyName: string

  @Prop({ required: true, trim: true, lowercase: true })
  email: string

  @Prop({ required: true, trim: true })
  phone: string

  @Prop({ required: true, trim: true })
  linkedin: string

  @Prop({ required: true, trim: true })
  github: string

  @Prop({ required: true, trim: true })
  affiliation: string

  @Prop({ required: true, trim: true, uppercase: true })
  country: string

  @Prop({ required: true, trim: true })
  city: string

  @Prop({ required: true, trim: true })
  photo: string

  @Prop({ type: Map, of: String, default: () => new Map<string, string>() })
  resumes: Map<string, string>

  @Prop({ type: Map, of: PersonTranslationSchema, required: true })
  translations: Map<string, PersonTranslation>
}

export type PersonDocument = HydratedDocument<Person>
export const PersonSchema = SchemaFactory.createForClass(Person)
