import * as Joi from 'joi'
import { SIGNING_ALGORITHMS } from '@/config/configuration'

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  APP_ENV: Joi.string().valid('local', 'dev', 'prod').default('local'),
  ACCESS_ALLOWED_EMAILS: Joi.string().allow('').default(''),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  MONGODB_DB_NAME: Joi.string().required(),

  CORS_ORIGINS: Joi.string().required(),

  COGNITO_REGION: Joi.string()
    .pattern(/^[a-z]{2}(-gov)?-[a-z]+-\d$/)
    .required(),
  COGNITO_USER_POOL_ID: Joi.string()
    .pattern(/^[a-z]{2}(-gov)?-[a-z]+-\d_[A-Za-z0-9]+$/)
    .required(),
  COGNITO_RESOURCE_SERVER: Joi.string().default('folvyn-portfolio-ms'),
  COGNITO_ALLOWED_CLIENT_IDS: Joi.string().required(),
  COGNITO_FRONTEND_CLIENT_ID: Joi.string().allow('').default(''),
  COGNITO_HOSTED_UI_DOMAIN: Joi.string().uri({ scheme: ['https'] }),
  COGNITO_JWKS_URI: Joi.string().uri({ scheme: ['https'] }),
  COGNITO_ALGORITHMS: Joi.string()
    .default('RS256')
    .custom((value: string, helpers) => {
      const unsupported = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .filter((item) => !SIGNING_ALGORITHMS.includes(item as never))

      return unsupported.length > 0
        ? helpers.message({
            custom: `COGNITO_ALGORITHMS must be asymmetric: ${unsupported.join(', ')} is not allowed`,
          })
        : value
    }),
  COGNITO_JWKS_CACHE_TTL: Joi.number().min(0).default(600000),
  COGNITO_JWKS_RATE_LIMIT: Joi.number().min(1).default(10),
  COGNITO_JWKS_TIMEOUT: Joi.number().min(100).default(5000),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(120),

  ASSETS_BUCKET: Joi.string().allow('').default(''),
  ASSETS_REGION: Joi.string().pattern(/^[a-z]{2}(-gov)?-[a-z]+-\d$/),
  ASSETS_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  ASSETS_URL_TTL: Joi.number().min(60).max(3600).default(300),

  DEFAULT_LANG: Joi.string().default('en'),
  DEFAULT_PORTFOLIO_SLUG: Joi.string().allow('').default(''),
  SITE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('https://folvyn.mkirell.com'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'log', 'debug', 'verbose').default('log'),
})
