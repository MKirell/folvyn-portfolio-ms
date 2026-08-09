import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { ownerIdProp } from '@/common/schemas/owned'

export const RESERVOIR_LIMIT = 200

function counterMap() {
  return { type: Map, of: Number, default: () => new Map<string, number>() }
}

@Schema({ timestamps: true, versionKey: false, collection: 'analytics_daily' })
export class AnalyticsDaily {
  @Prop(ownerIdProp)
  ownerId: Types.ObjectId

  @Prop({ required: true })
  date: string

  @Prop({ default: 0 })
  sessions: number

  @Prop({ default: 0 })
  visitors: number

  @Prop({ default: 0 })
  bounced: number

  @Prop({ default: 0 })
  dwellMsTotal: number

  @Prop({ default: 0 })
  dwellSamples: number

  @Prop({ default: 0 })
  shellSessions: number

  @Prop({ default: 0 })
  rejected: number

  @Prop({ default: 0 })
  returning: number

  @Prop({ default: 0 })
  newVisitors: number

  @Prop(counterMap())
  byLang: Map<string, number>

  @Prop(counterMap())
  byCountry: Map<string, number>

  @Prop(counterMap())
  byReferrer: Map<string, number>

  @Prop(counterMap())
  byDevice: Map<string, number>

  @Prop(counterMap())
  byBrowser: Map<string, number>

  @Prop(counterMap())
  byEntry: Map<string, number>

  @Prop(counterMap())
  sections: Map<string, number>

  @Prop(counterMap())
  impressions: Map<string, number>

  @Prop(counterMap())
  clicks: Map<string, number>

  @Prop(counterMap())
  scroll: Map<string, number>

  @Prop(counterMap())
  docs: Map<string, number>

  @Prop(counterMap())
  outbound: Map<string, number>

  @Prop(counterMap())
  contact: Map<string, number>

  @Prop(counterMap())
  shell: Map<string, number>

  @Prop(counterMap())
  errors: Map<string, number>

  @Prop({ type: [Number], default: [] })
  lcpSamples: number[]

  @Prop({ type: [Number], default: [] })
  clsSamples: number[]

  @Prop({ type: [Number], default: [] })
  inpSamples: number[]

  @Prop({ type: [Number], default: [] })
  ttfbSamples: number[]
}

export type AnalyticsDailyDocument = HydratedDocument<AnalyticsDaily>
export const AnalyticsDailySchema = SchemaFactory.createForClass(AnalyticsDaily)

AnalyticsDailySchema.index({ ownerId: 1, date: 1 }, { unique: true })
AnalyticsDailySchema.index({ date: 1 })
