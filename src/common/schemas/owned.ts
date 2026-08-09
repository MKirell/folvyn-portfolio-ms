import { BadRequestException } from '@nestjs/common'
import { Types } from 'mongoose'

export const OWNER_REF = 'Owner'

export const ownerIdProp = {
  type: Types.ObjectId,
  ref: OWNER_REF,
  required: true,
  index: true,
} as const

export const ownerIdUniqueProp = {
  type: Types.ObjectId,
  ref: OWNER_REF,
  required: true,
  unique: true,
} as const

export function withoutOwnerId(payload: object): Record<string, unknown> {
  const clone = { ...(payload as Record<string, unknown>) }
  delete clone.ownerId
  return clone
}

export function ownerObjectId(ownerId: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(ownerId)) {
    throw new BadRequestException('Malformed owner identifier')
  }
  return new Types.ObjectId(ownerId)
}
