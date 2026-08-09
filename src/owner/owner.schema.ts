import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { baseSchemaOptions } from '@/common/schemas/schema-options'
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN } from '@/owner/slug'

export const OWNER_STATUSES = ['draft', 'published', 'suspended'] as const
export const CONSENT_MODES = ['measurement', 'enhanced'] as const

export type OwnerStatus = (typeof OWNER_STATUSES)[number]
export type ConsentMode = (typeof CONSENT_MODES)[number]

@Schema({ ...baseSchemaOptions, collection: 'owners' })
export class Owner {
  @Prop({ required: true, unique: true, trim: true })
  sub: string

  @Prop({
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: SLUG_MIN_LENGTH,
    maxlength: SLUG_MAX_LENGTH,
    match: SLUG_PATTERN,
  })
  slug: string

  @Prop({ type: String, default: null, trim: true, lowercase: true })
  email: string | null

  @Prop({ type: String, default: null, trim: true })
  displayName: string | null

  @Prop({ type: String, required: true, enum: OWNER_STATUSES, default: 'draft' })
  status: OwnerStatus

  @Prop({ type: String, required: true, enum: CONSENT_MODES, default: 'measurement' })
  consentMode: ConsentMode

  @Prop({ required: true, default: 'free', trim: true })
  plan: string

  @Prop({ type: Date, default: null })
  publishedAt: Date | null
}

export type OwnerDocument = HydratedDocument<Owner>
export const OwnerSchema = SchemaFactory.createForClass(Owner)

OwnerSchema.index({ status: 1 })
