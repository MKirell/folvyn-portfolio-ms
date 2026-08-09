import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { Error as MongooseError, mongo } from 'mongoose'

interface ErrorBody {
  statusCode: number
  error: string
  message: string | string[]
  path: string
  timestamp: string
  details?: Record<string, unknown>
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const { status, message, error, details } = this.normalize(exception)

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}`)
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    }

    response.status(status).json(body)
  }

  private normalize(exception: unknown): {
    status: number
    message: string | string[]
    error: string
    details?: Record<string, unknown>
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()
      if (typeof payload === 'string') {
        return { status, message: payload, error: exception.name }
      }
      const record = payload as Record<string, unknown>
      return {
        status,
        message: (record.message as string | string[]) ?? exception.message,
        error: (record.error as string) ?? exception.name,
        details: (record.details as Record<string, unknown>) ?? undefined,
      }
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: Object.keys(exception.errors).map((field) => `${field} is invalid`),
        error: 'ValidationError',
      }
    }

    if (exception instanceof MongooseError.CastError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Malformed value for ${exception.path}`,
        error: 'BadRequest',
      }
    }

    if (exception instanceof mongo.MongoServerError && exception.code === 11000) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'Resource already exists',
        error: 'Conflict',
      }
    }

    const isProduction = this.config.get<boolean>('app.isProduction')
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        isProduction || !(exception instanceof Error) ? 'Internal server error' : exception.message,
      error: 'InternalServerError',
    }
  }
}
