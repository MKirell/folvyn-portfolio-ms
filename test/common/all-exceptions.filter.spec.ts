import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Error as MongooseError, mongo } from 'mongoose'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'

interface CapturedBody {
  statusCode: number
  error: string
  message: string | string[]
  path: string
  timestamp: string
}

function buildHost(): { host: ArgumentsHost; sent: () => CapturedBody; status: () => number } {
  let body: CapturedBody
  let code = 0

  const response = {
    status: (value: number) => {
      code = value
      return { json: (payload: CapturedBody) => (body = payload) }
    },
  }
  const request = { method: 'POST', url: '/api/v1/admin/experiences' }

  return {
    host: {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost,
    sent: () => body,
    status: () => code,
  }
}

function buildFilter(isProduction: boolean): AllExceptionsFilter {
  return new AllExceptionsFilter({
    get: jest.fn().mockReturnValue(isProduction),
  } as unknown as ConfigService)
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it('preserves the status and message of an HTTP exception', () => {
    const { host, sent, status } = buildHost()

    buildFilter(false).catch(new NotFoundException('Language "de" is not available'), host)

    expect(status()).toBe(404)
    expect(sent().message).toBe('Language "de" is not available')
    expect(sent().path).toBe('/api/v1/admin/experiences')
    expect(sent().timestamp).toEqual(expect.any(String))
  })

  it('keeps the array of messages produced by validation', () => {
    const { host, sent } = buildHost()

    buildFilter(false).catch(
      new BadRequestException({ message: ['company must be a string'], error: 'Bad Request' }),
      host,
    )

    expect(sent().message).toEqual(['company must be a string'])
    expect(sent().error).toBe('Bad Request')
  })

  it('handles an HTTP exception carrying a plain string body', () => {
    const { host, sent, status } = buildHost()

    buildFilter(false).catch(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT), host)

    expect(status()).toBe(418)
    expect(sent().message).toBe('Teapot')
  })

  it('reports a forbidden action as 403', () => {
    const { host, status } = buildHost()

    buildFilter(false).catch(new ForbiddenException('Insufficient permissions'), host)

    expect(status()).toBe(403)
  })

  it('turns a Mongoose validation error into 422 with field names only', () => {
    const { host, sent, status } = buildHost()
    const error = new MongooseError.ValidationError()
    error.errors = {
      company: new MongooseError.ValidatorError({ path: 'company' }),
    }

    buildFilter(true).catch(error, host)

    expect(status()).toBe(422)
    expect(sent().message).toEqual(['company is invalid'])
    expect(sent().error).toBe('ValidationError')
  })

  it('turns a cast error into 400 naming the offending path', () => {
    const { host, sent, status } = buildHost()

    buildFilter(true).catch(new MongooseError.CastError('ObjectId', 'abc', 'id'), host)

    expect(status()).toBe(400)
    expect(sent().message).toBe('Malformed value for id')
  })

  it('turns a duplicate key error into 409 without echoing the key', () => {
    const { host, sent, status } = buildHost()
    const error = new mongo.MongoServerError({ message: 'E11000 duplicate key' })
    error.code = 11000

    buildFilter(true).catch(error, host)

    expect(status()).toBe(409)
    expect(sent().message).toBe('Resource already exists')
    expect(JSON.stringify(sent())).not.toContain('E11000')
  })

  it('hides internal error messages in production', () => {
    const { host, sent, status } = buildHost()

    buildFilter(true).catch(new Error('connect ECONNREFUSED 127.0.0.1:27017'), host)

    expect(status()).toBe(500)
    expect(sent().message).toBe('Internal server error')
    expect(JSON.stringify(sent())).not.toContain('27017')
  })

  it('surfaces the internal message outside production for debugging', () => {
    const { host, sent } = buildHost()

    buildFilter(false).catch(new Error('something specific broke'), host)

    expect(sent().message).toBe('something specific broke')
  })

  it('never leaks a stack trace in the response body', () => {
    const { host, sent } = buildHost()

    buildFilter(false).catch(new Error('boom'), host)

    expect(Object.keys(sent())).toEqual(['statusCode', 'error', 'message', 'path', 'timestamp'])
  })

  it('copes with a thrown value that is not an Error', () => {
    const { host, sent, status } = buildHost()

    buildFilter(false).catch('just a string', host)

    expect(status()).toBe(500)
    expect(sent().message).toBe('Internal server error')
  })
})
