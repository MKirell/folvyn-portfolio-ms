import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as jwt from 'jsonwebtoken'

export interface AuthMaterial {
  privateKey: string
  issuer: string
  clientId: string
  baseUrl: string
}

export function material(): AuthMaterial {
  const path = resolve(__dirname, '.auth.json')
  return JSON.parse(readFileSync(path, 'utf8')) as AuthMaterial
}

function sign(claims: Record<string, unknown>, subject: string): string {
  const { privateKey, issuer, clientId } = material()

  return jwt.sign({ token_use: 'access', client_id: clientId, ...claims }, privateKey, {
    algorithm: 'RS256',
    subject,
    issuer,
    expiresIn: '5m',
  })
}

export function adminToken(): string {
  return sign(
    { username: 'owner', scope: 'openid profile', 'cognito:groups': ['admin'] },
    'a3f1c0de-0000-4000-8000-000000000001',
  )
}

export function platformToken(): string {
  return sign(
    { username: 'platform', scope: 'openid profile', 'cognito:groups': ['folvyn-platform'] },
    'a3f1c0de-0000-4000-8000-000000000004',
  )
}

export function guestToken(): string {
  return sign(
    { username: 'guest', scope: 'openid profile' },
    'a3f1c0de-0000-4000-8000-000000000002',
  )
}

export function scopedUserToken(): string {
  return sign(
    { username: 'scoped', scope: 'openid folvyn-portfolio-ms/admin' },
    'a3f1c0de-0000-4000-8000-000000000003',
  )
}

export function machineToken(): string {
  return sign({ scope: 'openid folvyn-portfolio-ms/admin' }, 'a3f1c0de-0000-4000-8000-000000000009')
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}
