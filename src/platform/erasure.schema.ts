import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions } from '@/common/schemas/schema-options'

export const ERASURE_STATES = ['pending', 'running', 'done', 'failed'] as const
export const ERASURE_STORES = ['documents', 'analytics', 'assets', 'identity'] as const
export const ERASURE_DEADLINE_DAYS = 30

export type ErasureState = (typeof ERASURE_STATES)[number]
export type ErasureStore = (typeof ERASURE_STORES)[number]

@Schema({ ...baseSchemaOptions, collection: 'erasure_requests' })
export class ErasureRequest {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId

  @Prop({ required: true })
  slug: string

  @Prop({ type: String, required: true, enum: ERASURE_STATES, default: 'pending' })
  state: ErasureState

  @Prop({ required: true, trim: true })
  reason: string

  @Prop({ type: String, default: null })
  requestedBy: string | null

  @Prop({ type: Date, required: true })
  dueAt: Date

  @Prop({ type: Date, default: null })
  completedAt: Date | null

  @Prop({ type: Object, default: () => ({}) })
  cascade: Record<string, number>

  @Prop({ type: String, default: null })
  failure: string | null
}

export type ErasureRequestDocument = HydratedDocument<ErasureRequest>
export const ErasureRequestSchema = SchemaFactory.createForClass(ErasureRequest)

ErasureRequestSchema.index({ state: 1, dueAt: 1 })
