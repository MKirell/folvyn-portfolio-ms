import { generateKeyPairSync } from 'node:crypto'
import * as jwt from 'jsonwebtoken'
import type { SecretOrKeyProvider } from 'passport-jwt'
import type { CognitoAccessToken } from '@/common/types/authenticated-user'

export const REGION = 'eu-west-3'
export const USER_POOL_ID = 'eu-west-3_Ab12Cd34E'
export const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`
export const RESOURCE_SERVER = 'folvyn-portfolio-ms'
export const ADMIN_SCOPE = `${RESOURCE_SERVER}/admin`
export const PLATFORM_GROUP = 'folvyn-platform'
export const CONSOLE_CLIENT_ID = '2q7hbf0folvynconsole0001'
export const CI_CLIENT_ID = '5r8jdg1folvynautomation2'

export const poolKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

export const foreignKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

export const staticKeyProvider: SecretOrKeyProvider = (_request, _rawToken, done) => {
  done(null, poolKeys.publicKey)
}

export const cognitoConfig = {
  region: REGION,
  userPoolId: USER_POOL_ID,
  issuerUrl: ISSUER,
  jwksUri: `${ISSUER}/.well-known/jwks.json`,
  resourceServer: RESOURCE_SERVER,
  allowedClientIds: [CONSOLE_CLIENT_ID, CI_CLIENT_ID],
  frontendClientId: CONSOLE_CLIENT_ID,
  hostedUiDomain: 'https://auth.mkirell.com',
  algorithms: ['RS256'] as const,
  jwksCacheMaxAge: 600_000,
  jwksRequestsPerMinute: 10,
  jwksTimeout: 5000,
}

export function accessToken(
  claims: Partial<CognitoAccessToken> = {},
  options: { privateKey?: string; issuer?: string; expiresIn?: string } = {},
): string {
  const { sub, ...rest } = claims

  return jwt.sign(
    {
      token_use: 'access',
      client_id: CONSOLE_CLIENT_ID,
      username: 'owner',
      ...rest,
    },
    options.privateKey ?? poolKeys.privateKey,
    {
      algorithm: 'RS256',
      subject: sub ?? 'a3f1c0de-0000-4000-8000-000000000001',
      issuer: options.issuer ?? ISSUER,
      expiresIn: (options.expiresIn ?? '5m') as jwt.SignOptions['expiresIn'],
    },
  )
}

export function ownerToken(overrides: Partial<CognitoAccessToken> = {}): string {
  return accessToken({ scope: 'openid profile', ...overrides })
}

export function platformToken(overrides: Partial<CognitoAccessToken> = {}): string {
  return accessToken({
    sub: 'a3f1c0de-0000-4000-8000-000000000004',
    username: 'platform',
    scope: 'openid profile',
    'cognito:groups': [PLATFORM_GROUP],
    ...overrides,
  })
}

export function machineToken(overrides: Partial<CognitoAccessToken> = {}): string {
  return accessToken({
    sub: 'a3f1c0de-0000-4000-8000-000000000009',
    client_id: CI_CLIENT_ID,
    username: undefined,
    scope: `openid ${ADMIN_SCOPE}`,
    ...overrides,
  })
}

export function scopedUserToken(overrides: Partial<CognitoAccessToken> = {}): string {
  return accessToken({
    sub: 'a3f1c0de-0000-4000-8000-000000000003',
    username: 'scoped',
    scope: `openid profile ${ADMIN_SCOPE}`,
    ...overrides,
  })
}

export function guestToken(overrides: Partial<CognitoAccessToken> = {}): string {
  return accessToken({
    sub: 'a3f1c0de-0000-4000-8000-000000000002',
    username: 'guest',
    scope: 'openid profile',
    ...overrides,
  })
}
