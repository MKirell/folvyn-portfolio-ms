export type SigningAlgorithm = 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512'

export const SIGNING_ALGORITHMS: SigningAlgorithm[] = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
]

export interface AppConfig {
  env: string
  appEnv: string
  isProduction: boolean
  port: number
  apiPrefix: string
  defaultLang: string
  defaultSlug: string | null
  siteUrl: string
  corsOrigins: string[]
  logLevel: string
  accessAllowedEmails: string[]
}

export interface DatabaseConfig {
  uri: string
  dbName: string
}

export interface CognitoConfig {
  region: string
  userPoolId: string
  issuerUrl: string
  jwksUri: string
  resourceServer: string
  allowedClientIds: string[]
  frontendClientId: string
  hostedUiDomain: string | null
  algorithms: SigningAlgorithm[]
  jwksCacheMaxAge: number
  jwksRequestsPerMinute: number
  jwksTimeout: number
}

export interface ThrottleConfig {
  ttl: number
  limit: number
}

export interface AssetsConfig {
  bucket: string
  region: string
  baseUrl: string
  urlTtl: number
}

export interface Configuration {
  app: AppConfig
  database: DatabaseConfig
  cognito: CognitoConfig
  throttle: ThrottleConfig
  assets: AssetsConfig
}

function toList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function configuration(): Configuration {
  const env = process.env.NODE_ENV ?? 'development'
  const region = process.env.COGNITO_REGION as string
  const userPoolId = process.env.COGNITO_USER_POOL_ID as string
  const issuerUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`

  return {
    app: {
      env,
      appEnv: process.env.APP_ENV ?? 'local',
      isProduction: env === 'production',
      port: Number(process.env.PORT ?? 3000),
      apiPrefix: process.env.API_PREFIX ?? 'api/v1',
      defaultLang: process.env.DEFAULT_LANG ?? 'en',
      defaultSlug: process.env.DEFAULT_PORTFOLIO_SLUG?.toLowerCase() || null,
      siteUrl: (process.env.SITE_URL ?? 'https://folvyn.mkirell.com').replace(/\/+$/, ''),
      corsOrigins: toList(process.env.CORS_ORIGINS),
      logLevel: process.env.LOG_LEVEL ?? 'log',
      accessAllowedEmails: toList(process.env.ACCESS_ALLOWED_EMAILS),
    },
    database: {
      uri: process.env.MONGODB_URI as string,
      dbName: process.env.MONGODB_DB_NAME as string,
    },
    cognito: {
      region,
      userPoolId,
      issuerUrl,
      jwksUri: process.env.COGNITO_JWKS_URI ?? `${issuerUrl}/.well-known/jwks.json`,
      resourceServer: process.env.COGNITO_RESOURCE_SERVER ?? 'folvyn-portfolio-ms',
      allowedClientIds: toList(process.env.COGNITO_ALLOWED_CLIENT_IDS),
      frontendClientId: process.env.COGNITO_FRONTEND_CLIENT_ID ?? '',
      hostedUiDomain: process.env.COGNITO_HOSTED_UI_DOMAIN ?? null,
      algorithms: toList(process.env.COGNITO_ALGORITHMS ?? 'RS256') as SigningAlgorithm[],
      jwksCacheMaxAge: Number(process.env.COGNITO_JWKS_CACHE_TTL ?? 600_000),
      jwksRequestsPerMinute: Number(process.env.COGNITO_JWKS_RATE_LIMIT ?? 10),
      jwksTimeout: Number(process.env.COGNITO_JWKS_TIMEOUT ?? 5000),
    },
    throttle: {
      ttl: Number(process.env.THROTTLE_TTL ?? 60000),
      limit: Number(process.env.THROTTLE_LIMIT ?? 120),
    },
    assets: {
      bucket: process.env.ASSETS_BUCKET ?? '',
      region: process.env.ASSETS_REGION ?? region,
      baseUrl: process.env.ASSETS_BASE_URL ?? '',
      urlTtl: Number(process.env.ASSETS_URL_TTL ?? 300),
    },
  }
}
