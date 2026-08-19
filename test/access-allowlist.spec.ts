import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AccessAllowlistGuard } from '@/common/guards/access-allowlist.guard'
import { IdentityDirectory } from '@/auth/identity.directory'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

const ALLOWED = ['Admin@mkirell.com', 'ada.lovelace@example.com']

function context(user: AuthenticatedUser | undefined, isPublic = false): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    __public: isPublic,
  } as unknown as ExecutionContext
}

function human(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'sub-1',
    username: 'Google_1',
    email: null,
    displayName: 'Someone',
    picture: null,
    roles: [],
    isMachine: false,
    ...overrides,
  }
}

function guard(emails: string[], directoryEmail: string | null, isPublic = false) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector
  const describe = jest.fn().mockResolvedValue({
    givenName: null,
    familyName: null,
    name: null,
    email: directoryEmail,
  })
  const identities = { describe } as unknown as IdentityDirectory
  const config = { getOrThrow: () => ({ accessAllowedEmails: emails }) } as unknown as ConfigService

  return { instance: new AccessAllowlistGuard(reflector, identities, config), describe }
}

describe('AccessAllowlistGuard', () => {
  it('lets everyone through when no allowlist is configured', async () => {
    const { instance, describe } = guard([], null)

    await expect(instance.canActivate(context(human()))).resolves.toBe(true)
    expect(describe).not.toHaveBeenCalled()
  })

  it('admits an allowed address, however it is cased', async () => {
    const { instance } = guard(ALLOWED, 'ADMIN@MKIRELL.COM')

    await expect(instance.canActivate(context(human()))).resolves.toBe(true)
  })

  it('refuses an address that is not on the list', async () => {
    const { instance } = guard(ALLOWED, 'someone.else@example.com')

    await expect(instance.canActivate(context(human()))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a user whose address cannot be read at all', async () => {
    const { instance } = guard(ALLOWED, null)

    await expect(instance.canActivate(context(human()))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('never asks Cognito when the token already carries the address', async () => {
    const { instance, describe } = guard(ALLOWED, null)

    await expect(
      instance.canActivate(context(human({ email: 'ada.lovelace@example.com' }))),
    ).resolves.toBe(true)
    expect(describe).not.toHaveBeenCalled()
  })

  it('leaves the public surface open', async () => {
    const { instance } = guard(ALLOWED, 'someone.else@example.com', true)

    await expect(instance.canActivate(context(undefined, true))).resolves.toBe(true)
  })

  it('leaves a machine token alone, so CI still runs', async () => {
    const { instance } = guard(ALLOWED, null)

    await expect(
      instance.canActivate(context(human({ isMachine: true, username: 'ci' }))),
    ).resolves.toBe(true)
  })
})
