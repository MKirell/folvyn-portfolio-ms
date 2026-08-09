import { validationSchema } from '@/config/validation.schema'
import { configuration } from '@/config/configuration'

const baseEnv = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_DB_NAME: 'folvyn_portfolio',
  CORS_ORIGINS: 'http://localhost:5173',
  COGNITO_REGION: 'eu-west-3',
  COGNITO_USER_POOL_ID: 'eu-west-3_Ab12Cd34E',
  COGNITO_ALLOWED_CLIENT_IDS: '2q7hbf0folvynconsole0001',
}

function validate(overrides: Record<string, unknown> = {}) {
  return validationSchema.validate({ ...baseEnv, ...overrides }, { abortEarly: false })
}

describe('environment validation', () => {
  it('accepts a complete configuration', () => {
    expect(validate().error).toBeUndefined()
  })

  it.each([
    'MONGODB_URI',
    'MONGODB_DB_NAME',
    'CORS_ORIGINS',
    'COGNITO_REGION',
    'COGNITO_USER_POOL_ID',
    'COGNITO_ALLOWED_CLIENT_IDS',
  ])('refuses to start without %s', (key) => {
    expect(validate({ [key]: undefined }).error?.message).toContain(key)
  })

  it.each([
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'ADMIN_EMAILS',
    'COOKIE_SECRET',
    'KEYCLOAK_AUTH_SERVER_URL',
    'KEYCLOAK_REALM',
    'KEYCLOAK_CLIENT_ID',
  ])('no longer declares %s', (key) => {
    const described = validationSchema.describe() as { keys: Record<string, unknown> }

    expect(Object.keys(described.keys)).not.toContain(key)
  })

  it('rejects a malformed user pool id', () => {
    expect(validate({ COGNITO_USER_POOL_ID: 'not-a-pool' }).error).toBeDefined()
  })

  it('rejects a user pool id whose region prefix is missing', () => {
    expect(validate({ COGNITO_USER_POOL_ID: 'Ab12Cd34E' }).error).toBeDefined()
  })

  it('rejects a malformed region', () => {
    expect(validate({ COGNITO_REGION: 'europe' }).error).toBeDefined()
  })

  it('rejects a symmetric signing algorithm — a resource server must not hold the key', () => {
    expect(validate({ COGNITO_ALGORITHMS: 'HS256' }).error?.message).toContain('must be asymmetric')
  })

  it('accepts a list of asymmetric algorithms', () => {
    expect(validate({ COGNITO_ALGORITHMS: 'RS256, PS256' }).error).toBeUndefined()
  })

  it('rejects a non-https hosted UI domain', () => {
    expect(validate({ COGNITO_HOSTED_UI_DOMAIN: 'http://auth.mkirell.com' }).error).toBeDefined()
  })

  it('rejects a non-mongodb database URI', () => {
    expect(validate({ MONGODB_URI: 'postgres://localhost:5432' }).error).toBeDefined()
  })

  it('accepts a mongodb+srv URI', () => {
    expect(validate({ MONGODB_URI: 'mongodb+srv://host/db' }).error).toBeUndefined()
  })

  it('applies defaults for optional settings', () => {
    const { value } = validate()

    expect(value.PORT).toBe(3000)
    expect(value.API_PREFIX).toBe('api/v1')
    expect(value.COGNITO_ALGORITHMS).toBe('RS256')
    expect(value.COGNITO_RESOURCE_SERVER).toBe('folvyn-portfolio-ms')
    expect(value.NODE_ENV).toBe('development')
  })
})

describe('configuration()', () => {
  const original = process.env

  beforeEach(() => {
    process.env = { ...original, ...baseEnv }
  })

  afterAll(() => {
    process.env = original
  })

  it('derives the issuer and JWKS endpoint from the region and pool', () => {
    const { cognito } = configuration()

    expect(cognito.issuerUrl).toBe(
      'https://cognito-idp.eu-west-3.amazonaws.com/eu-west-3_Ab12Cd34E',
    )
    expect(cognito.jwksUri).toBe(
      'https://cognito-idp.eu-west-3.amazonaws.com/eu-west-3_Ab12Cd34E/.well-known/jwks.json',
    )
  })

  it('lets an explicit JWKS URI win', () => {
    process.env.COGNITO_JWKS_URI = 'https://keys.mkirell.com/jwks.json'

    expect(configuration().cognito.jwksUri).toBe('https://keys.mkirell.com/jwks.json')
  })

  it('splits the app client allowlist and trims it', () => {
    process.env.COGNITO_ALLOWED_CLIENT_IDS = ' client-a , client-b ,, '

    expect(configuration().cognito.allowedClientIds).toEqual(['client-a', 'client-b'])
  })

  it('splits comma-separated CORS origins and trims them', () => {
    process.env.CORS_ORIGINS = ' http://a.test , http://b.test ,, '

    expect(configuration().app.corsOrigins).toEqual(['http://a.test', 'http://b.test'])
  })

  it('holds no signing key or client secret', () => {
    expect(Object.keys(configuration().cognito)).not.toContain('clientSecret')
    expect(JSON.stringify(configuration())).not.toMatch(/secret/i)
  })

  it('flags production explicitly', () => {
    process.env.NODE_ENV = 'production'
    expect(configuration().app.isProduction).toBe(true)

    process.env.NODE_ENV = 'development'
    expect(configuration().app.isProduction).toBe(false)
  })

  it('coerces numeric settings', () => {
    process.env.PORT = '4000'
    process.env.THROTTLE_LIMIT = '50'

    const config = configuration()
    expect(config.app.port).toBe(4000)
    expect(config.throttle.limit).toBe(50)
  })

  it('falls back to sane defaults when optional values are absent', () => {
    delete process.env.PORT
    delete process.env.API_PREFIX
    delete process.env.DEFAULT_LANG
    delete process.env.THROTTLE_TTL
    delete process.env.COGNITO_JWKS_CACHE_TTL

    const config = configuration()
    expect(config.app.port).toBe(3000)
    expect(config.app.apiPrefix).toBe('api/v1')
    expect(config.app.defaultLang).toBe('en')
    expect(config.throttle.ttl).toBe(60000)
    expect(config.cognito.jwksCacheMaxAge).toBe(600000)
    expect(config.cognito.algorithms).toEqual(['RS256'])
    expect(config.cognito.hostedUiDomain).toBeNull()
  })
})
