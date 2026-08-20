import { IdentityDirectory } from '@/auth/identity.directory'

const POOL = 'eu-west-3_TESTPOOL'

function build(send: jest.Mock) {
  const config = { getOrThrow: () => ({ userPoolId: POOL }) }
  return new IdentityDirectory({ send } as never, config as never)
}

function attributes(pairs: Record<string, string>) {
  return Object.entries(pairs).map(([Name, Value]) => ({ Name, Value }))
}

describe('IdentityDirectory.describe', () => {
  it('reads the federated profile a slug is derived from', async () => {
    const send = jest.fn().mockResolvedValue({
      UserAttributes: attributes({
        given_name: 'Ada',
        family_name: 'Lovelace',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
    })

    await expect(build(send).describe('Google_1')).resolves.toEqual({
      givenName: 'Ada',
      familyName: 'Lovelace',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('asks Cognito once and serves the rest from cache', async () => {
    const send = jest.fn().mockResolvedValue({ UserAttributes: attributes({ email: 'a@b.test' }) })
    const directory = build(send)

    await directory.describe('Google_1')
    await directory.describe('Google_1')

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('answers empty for no username without calling Cognito at all', async () => {
    const send = jest.fn()

    await expect(build(send).describe(null)).resolves.toEqual({
      givenName: null,
      familyName: null,
      name: null,
      email: null,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('reports every attribute it did not get as null rather than undefined', async () => {
    const send = jest.fn().mockResolvedValue({})

    await expect(build(send).describe('Google_1')).resolves.toEqual({
      givenName: null,
      familyName: null,
      name: null,
      email: null,
    })
  })

  it('degrades to empty rather than failing the request when Cognito refuses', async () => {
    const send = jest.fn().mockRejectedValue(new Error('AccessDenied'))

    await expect(build(send).describe('Google_1')).resolves.toEqual({
      givenName: null,
      familyName: null,
      name: null,
      email: null,
    })
  })
})

describe('IdentityDirectory.usernameForSub', () => {
  it('finds the one user carrying that subject', async () => {
    const send = jest.fn().mockResolvedValue({ Users: [{ Username: 'Google_1' }] })

    await expect(build(send).usernameForSub('sub-1')).resolves.toBe('Google_1')
  })

  it('answers null when the pool holds nobody with that subject', async () => {
    const send = jest.fn().mockResolvedValue({ Users: [] })

    await expect(build(send).usernameForSub('sub-1')).resolves.toBeNull()
  })
})

describe('IdentityDirectory.remove', () => {
  it('deletes the user and forgets what it cached about them', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ UserAttributes: attributes({ email: 'a@b.test' }) })
      .mockResolvedValueOnce({ Users: [{ Username: 'Google_1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ UserAttributes: attributes({ email: 'second@b.test' }) })

    const directory = build(send)

    await directory.describe('Google_1')
    await expect(directory.remove('sub-1')).resolves.toBe(true)

    const after = await directory.describe('Google_1')
    expect(after.email).toBe('second@b.test')
  })

  it('reports nothing to delete rather than throwing when the user is already gone', async () => {
    const send = jest.fn().mockResolvedValue({ Users: [] })

    await expect(build(send).remove('sub-1')).resolves.toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
