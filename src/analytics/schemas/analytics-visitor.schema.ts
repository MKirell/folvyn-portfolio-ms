import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { ownerIdProp } from '@/common/schemas/owned'

export const VISITOR_TTL_SECONDS = 172_800

@Schema({ timestamps: true, versionKey: false, collection: 'analytics_visitors' })
export class AnalyticsVisitor {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true })
  date: string

  @Prop({ required: true, default: 'visitor' })
  kind: string

  @Prop({ required: true })
  visitorDay: string

  createdAt: Date
}

export type AnalyticsVisitorDocument = HydratedDocument<AnalyticsVisitor>
export const AnalyticsVisitorSchema = SchemaFactory.createForClass(AnalyticsVisitor)

AnalyticsVisitorSchema.index({ ownerId: 1, date: 1, kind: 1, visitorDay: 1 }, { unique: true })
AnalyticsVisitorSchema.index({ createdAt: 1 }, { expireAfterSeconds: VISITOR_TTL_SECONDS })
