import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { baseSchemaOptions } from '@/common/schemas/schema-options'

export const AUDIT_ACTIONS = [
  'suspend',
  'restore',
  'erase',
  'export',
  'read-account',
  'erasure-queued',
  'erasure-run',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

@Schema({ ...baseSchemaOptions, collection: 'platform_audit' })
export class AuditEntry {
  @Prop({ required: true, index: true })
  actorSub: string

  @Prop({ type: String, default: null })
  actorEmail: string | null

  @Prop({ type: String, required: true, enum: AUDIT_ACTIONS })
  action: AuditAction

  @Prop({ type: Types.ObjectId, default: null })
  targetOwnerId: Types.ObjectId | null

  @Prop({ type: String, default: null })
  targetSlug: string | null

  @Prop({ type: String, default: null })
  reason: string | null

  createdAt: Date
}

export type AuditEntryDocument = HydratedDocument<AuditEntry>
export const AuditEntrySchema = SchemaFactory.createForClass(AuditEntry)

AuditEntrySchema.index({ createdAt: -1 })
