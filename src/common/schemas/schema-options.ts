import type { SchemaOptions } from 'mongoose'

export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  minimize: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id)
      delete ret._id
      return ret
    },
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id)
      delete ret._id
      return ret
    },
  },
}

export const translationSchemaOptions: SchemaOptions = {
  _id: false,
  versionKey: false,
  minimize: false,
}
