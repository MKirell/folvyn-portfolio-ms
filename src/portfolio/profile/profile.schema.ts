import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions, translationSchemaOptions } from '@/common/schemas/schema-options'
import { ownerIdUniqueProp } from '@/common/schemas/owned'

@Schema(translationSchemaOptions)
export class ProfileTranslation {
  @Prop({ type: [String], default: [] })
  subtitles: string[]

  @Prop({ required: true, trim: true })
  tagline: string
}

export const ProfileTranslationSchema = SchemaFactory.createForClass(ProfileTranslation)

@Schema({ ...baseSchemaOptions, collection: 'profile' })
export class Profile {
  @Prop(ownerIdUniqueProp)
  ownerId: Types.ObjectId

  @Prop({ type: [String], default: [] })
  highlights: string[]

  @Prop({ type: [String], default: [], trim: true })
  highlightFocus: string[]

  @Prop({ type: Map, of: ProfileTranslationSchema, required: true })
  translations: Map<string, ProfileTranslation>
}

export type ProfileDocument = HydratedDocument<Profile>
export const ProfileSchema = SchemaFactory.createForClass(Profile)
