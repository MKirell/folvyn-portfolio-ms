import type { Role } from '@/auth/roles'

export interface AuthenticatedUser {
  id: string
  username: string
  email: string | null
  displayName: string | null
  picture: string | null
  roles: Role[]
  isMachine: boolean
}

export interface CognitoAccessToken {
  sub: string
  iss: string
  token_use: string
  client_id?: string
  username?: string
  scope?: string
  'cognito:groups'?: string[]
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}
