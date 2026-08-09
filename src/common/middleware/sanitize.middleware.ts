import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

const FORBIDDEN_KEY = /^\$|\./

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = scrub(item, depth + 1)
    })
    return value
  }

  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEY.test(key)) {
      delete record[key]
      continue
    }
    record[key] = scrub(record[key], depth + 1)
  }
  return record
}

@Injectable()
export class SanitizeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body) scrub(req.body)
    if (req.params) scrub(req.params)
    if (req.query) scrub(req.query)
    next()
  }
}
