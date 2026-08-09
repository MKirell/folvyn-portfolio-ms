import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { COGNITO_IDP_CLIENT } from '@/auth/cognito-idp.token'
import type { CognitoConfig } from '@/config/configuration'

export interface FederatedIdentity {
  givenName: string | null
  familyName: string | null
  name: string | null
  email: string | null
}

const EMPTY: FederatedIdentity = { givenName: null, familyName: null, name: null, email: null }

const CACHE_TTL_MS = 5 * 60 * 1000

@Injectable()
export class IdentityDirectory {
  private readonly logger = new Logger(IdentityDirectory.name)
  private readonly userPoolId: string
  private readonly cache = new Map<string, { identity: FederatedIdentity; expiresAt: number }>()

  constructor(
    @Inject(COGNITO_IDP_CLIENT) private readonly client: CognitoIdentityProviderClient,
    config: ConfigService,
  ) {
    this.userPoolId = config.getOrThrow<CognitoConfig>('cognito').userPoolId
  }

  async describe(username: string | null): Promise<FederatedIdentity> {
    if (!username) return EMPTY

    const cached = this.cache.get(username)
    if (cached && cached.expiresAt > Date.now()) return cached.identity

    try {
      const response = await this.client.send(
        new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: username }),
      )
      const attributes = new Map(
        (response.UserAttributes ?? []).map((attribute) => [attribute.Name, attribute.Value]),
      )

      const identity: FederatedIdentity = {
        givenName: attributes.get('given_name') ?? null,
        familyName: attributes.get('family_name') ?? null,
        name: attributes.get('name') ?? null,
        email: attributes.get('email') ?? null,
      }

      this.cache.set(username, { identity, expiresAt: Date.now() + CACHE_TTL_MS })
      return identity
    } catch (error) {
      this.logger.error(
        `Could not read the federated profile for ${username}; the address will fall back to the username: ${(error as Error).message}`,
      )
      return EMPTY
    }
  }

  async usernameForSub(sub: string): Promise<string | null> {
    const response = await this.client.send(
      new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Filter: `sub = "${sub}"`,
        Limit: 1,
      }),
    )

    return response.Users?.[0]?.Username ?? null
  }

  async remove(sub: string): Promise<boolean> {
    const username = await this.usernameForSub(sub)
    if (!username) {
      this.logger.warn(`No Cognito user carries sub ${sub}; nothing to delete`)
      return false
    }

    await this.client.send(
      new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: username }),
    )
    this.cache.delete(username)
    return true
  }
}
