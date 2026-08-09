import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { ownerIdProp } from '@/common/schemas/owned'
import { EVENT_TYPES } from '@/analytics/collect.dto'

export const EVENT_TTL_SECONDS = 2_592_000

@Schema({ timestamps: true, versionKey: false, collection: 'analytics_events' })
export class AnalyticsEvent {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true, enum: EVENT_TYPES, index: true })
  type: string

  @Prop({ required: true })
  sessionId: string

  @Prop({ required: true })
  visitorDay: string

  @Prop()
  path?: string

  @Prop()
  lang?: string

  @Prop()
  referrerHost?: string

  @Prop()
  country?: string

  @Prop()
  device?: string

  @Prop()
  browser?: string

  @Prop()
  target?: string

  @Prop()
  value?: number

  createdAt: Date
}

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEvent>
export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent)

AnalyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: EVENT_TTL_SECONDS })
AnalyticsEventSchema.index({ ownerId: 1, type: 1, createdAt: -1 })
AnalyticsEventSchema.index({ ownerId: 1, sessionId: 1, createdAt: 1 })
