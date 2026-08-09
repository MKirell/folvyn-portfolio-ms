import 'reflect-metadata'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { SecretOrKeyProvider } from 'passport-jwt'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '@/app.module'
import { applyAppConfig } from '@/bootstrap'
import { JWT_KEY_PROVIDER } from '@/auth/jwks.token'
import type { AppConfig } from '@/config/configuration'
import { IdentityDirectory } from '@/auth/identity.directory'
import { OWNER_SLUG, seed } from './seed'

const REGION = 'eu-west-3'
const USER_POOL_ID = 'eu-west-3_Ab12Cd34E'
const CLIENT_ID = '2q7hbf0folvynconsole0001'
const PORT = Number(process.env.E2E_API_PORT ?? 3100)

export const AUTH_FILE = resolve(__dirname, '.auth.json')

export interface AuthMaterial {
  privateKey: string
  issuer: string
  clientId: string
  baseUrl: string
}

function stubIdentityDirectory(): IdentityDirectory {
  return {
    describe: (username: string | null) =>
      Promise.resolve({
        givenName: username,
        familyName: username ? 'e2e' : null,
        name: username ? `${username} e2e` : null,
        email: username ? `${username}@example.com` : null,
      }),
    remove: () => Promise.resolve(true),
  } as unknown as IdentityDirectory
}

async function main(): Promise<void> {
  const mongo = await MongoMemoryServer.create()
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: String(PORT),
    API_PREFIX: 'api/v1',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'folvyn_portfolio_e2e',
    CORS_ORIGINS: 'http://localhost:5174',
    COGNITO_REGION: REGION,
    COGNITO_USER_POOL_ID: USER_POOL_ID,
    COGNITO_ALLOWED_CLIENT_IDS: CLIENT_ID,
    COGNITO_RESOURCE_SERVER: 'folvyn-portfolio-ms',
    ASSETS_BUCKET: '',
    THROTTLE_LIMIT: '1000',
    DEFAULT_PORTFOLIO_SLUG: OWNER_SLUG,
    LOG_LEVEL: 'error',
  })

  const staticKeyProvider: SecretOrKeyProvider = (_request, _token, done) => {
    done(null, keys.publicKey)
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JWT_KEY_PROVIDER)
    .useValue(staticKeyProvider)
    .overrideProvider(IdentityDirectory)
    .useValue(stubIdentityDirectory())
    .compile()

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] })
  applyAppConfig(app, app.get(ConfigService).getOrThrow<AppConfig>('app'))

  await app.init()
  await seed(app)
  await app.listen(PORT)

  const material: AuthMaterial = {
    privateKey: keys.privateKey,
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    clientId: CLIENT_ID,
    baseUrl: `http://127.0.0.1:${PORT}`,
  }
  writeFileSync(AUTH_FILE, JSON.stringify(material), 'utf8')

  process.stdout.write(`e2e api listening on ${material.baseUrl}\n`)

  const shutdown = async (): Promise<void> => {
    await app.close()
    await mongo.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

void main()
