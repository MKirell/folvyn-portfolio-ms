import { UnauthorizedException } from '@nestjs/common'
import { toGroupRoles, toRoles } from '@/auth/roles'
import type { AuthenticatedUser, CognitoAccessToken } from '@/common/types/authenticated-user'

export interface ClaimsPolicy {
  resourceServer: string
  allowedClientIds: string[]
}

function scopeRoles(scope: string | undefined, resourceServer: string): string[] {
  if (!scope) return []
  const prefix = `${resourceServer}/`

  return scope
    .split(' ')
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length))
}

export function toAuthenticatedUser(
  token: CognitoAccessToken,
  policy: ClaimsPolicy,
): AuthenticatedUser {
  if (token.token_use !== 'access') {
    throw new UnauthorizedException('Invalid token type')
  }
  if (!token.sub) {
    throw new UnauthorizedException('Token carries no subject')
  }
  if (policy.allowedClientIds.length > 0) {
    if (!token.client_id || !policy.allowedClientIds.includes(token.client_id)) {
      throw new UnauthorizedException('Token was not issued for this service')
    }
  }

  const email = token.email?.toLowerCase() ?? null
  const username = token.username ?? token.sub
  const isMachineToken = !token.username

  return {
    id: token.sub,
    username,
    email,
    displayName: token.name ?? email ?? username,
    picture: token.picture ?? null,
    roles: isMachineToken
      ? toRoles(scopeRoles(token.scope, policy.resourceServer))
      : toGroupRoles(token['cognito:groups'] ?? []),
    isMachine: isMachineToken,
  }
}
