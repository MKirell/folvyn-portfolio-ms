import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Model, Types } from 'mongoose'
import { OwnerService } from '@/owner/owner.service'
import { Owner } from '@/owner/owner.schema'
import { RESERVED_SLUGS, slugCandidate, slugFromName, slugProblem } from '@/owner/slug'
import type { IdentityDirectory } from '@/auth/identity.directory'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

const OWNER = '507f1f77bcf86cd799439021'

function chain<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  }
}

function human(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'sub-1',
    username: 'google_1105',
    email: 'mohamed.khalil.zrelly@gmail.com',
    displayName: 'Mohamed Khalil ZRELLY',
    picture: null,
    roles: [],
    isMachine: false,
    ...overrides,
  }
}

describe('slug rules', () => {
  it('builds the address from the given and family name', () => {
    expect(slugFromName('Mohamed Khalil', 'ZRELLY')).toBe('mohamed-khalil-zrelly')
  })

  it('folds accents rather than dropping the letter', () => {
    expect(slugFromName('Amélie', 'Poulain')).toBe('amelie-poulain')
  })

  it('collapses punctuation and spacing into single hyphens', () => {
    expect(slugFromName("Jean-Luc  d'Arc", 'De  La Tour')).toBe('jean-luc-d-arc-de-la-tour')
  })

  it('never ends on a hyphen after truncation', () => {
    const slug = slugCandidate('a'.repeat(38) + ' bcdefgh')
    expect(slug).not.toMatch(/-$/)
    expect(slug.length).toBeLessThanOrEqual(40)
  })

  it('refuses a name that leaves nothing usable', () => {
    expect(slugCandidate('...')).toBe('')
    expect(slugCandidate('X')).toBe('')
  })

  it.each([...RESERVED_SLUGS])('refuses the reserved address %s', (slug) => {
    expect(slugProblem(slug)).toMatch(/reserved/)
  })

  it.each([
    ['ab', /between 3 and 40/],
    ['a'.repeat(41), /between 3 and 40/],
    ['Mohamed', /lowercase/],
    ['double--hyphen', /lowercase/],
    ['-leading', /lowercase/],
    ['trailing-', /lowercase/],
    ['has space', /lowercase/],
  ])('refuses %s', (slug, message) => {
    expect(slugProblem(slug)).toMatch(message)
  })

  it('accepts an ordinary derived address', () => {
    expect(slugProblem('mohamed-khalil-zrelly')).toBeNull()
  })
})

describe('OwnerService', () => {
  let model: {
    findOne: jest.Mock
    findById: jest.Mock
    findByIdAndUpdate: jest.Mock
    findByIdAndDelete: jest.Mock
    exists: jest.Mock
    create: jest.Mock
  }
  let identities: { describe: jest.Mock }
  let service: OwnerService

  beforeEach(() => {
    model = {
      findOne: jest.fn().mockReturnValue(chain(null)),
      findById: jest.fn().mockReturnValue(chain({ _id: OWNER, slug: 'someone', status: 'draft' })),
      findByIdAndUpdate: jest.fn().mockReturnValue(chain({ _id: OWNER, slug: 'someone' })),
      findByIdAndDelete: jest.fn().mockReturnValue(chain({ _id: OWNER })),
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest
        .fn()
        .mockImplementation((doc: object) => Promise.resolve({ toJSON: () => ({ ...doc }) })),
    }
    identities = {
      describe: jest.fn().mockResolvedValue({
        givenName: 'Mohamed Khalil',
        familyName: 'ZRELLY',
        name: 'Mohamed Khalil ZRELLY',
        email: 'mohamed.khalil.zrelly@gmail.com',
      }),
    }
    service = new OwnerService(
      model as unknown as Model<Owner>,
      identities as unknown as IdentityDirectory,
    )
  })

  describe('sign-up', () => {
    it('derives the address from the federated given and family name', async () => {
      const created = await service.ensureForUser(human())

      expect(identities.describe).toHaveBeenCalledWith('google_1105')
      expect(created.slug).toBe('mohamed-khalil-zrelly')
      expect(created.status).toBeUndefined()
    })

    it('never reads the name from the request, only from Cognito', async () => {
      identities.describe.mockResolvedValue({
        givenName: 'Someone',
        familyName: 'Else',
        name: null,
        email: null,
      })

      const created = await service.ensureForUser(human({ displayName: 'Mohamed Khalil ZRELLY' }))

      expect(created.slug).toBe('someone-else')
    })

    it('falls back to the full name when the provider sends no structured name', async () => {
      identities.describe.mockResolvedValue({
        givenName: null,
        familyName: null,
        name: 'Ada Lovelace',
        email: null,
      })

      await expect(service.ensureForUser(human())).resolves.toMatchObject({
        slug: 'ada-lovelace',
      })
    })

    it('falls back to the email local part when there is no name at all', async () => {
      identities.describe.mockResolvedValue({
        givenName: null,
        familyName: null,
        name: null,
        email: 'ada.lovelace@example.com',
      })

      await expect(service.ensureForUser(human({ displayName: null }))).resolves.toMatchObject({
        slug: 'ada-lovelace',
      })
    })

    it('sidesteps an address that is already taken', async () => {
      model.findOne
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain({ _id: new Types.ObjectId() }))
        .mockReturnValueOnce(chain(null))

      const created = await service.ensureForUser(human())

      expect(created.slug).toBe('mohamed-khalil-zrelly-2')
    })

    it('returns the existing owner instead of minting a second address', async () => {
      model.findOne.mockReturnValue(chain({ _id: OWNER, slug: 'taken', sub: 'sub-1' }))

      const owner = await service.ensureForUser(human())

      expect(owner.slug).toBe('taken')
      expect(model.create).not.toHaveBeenCalled()
      expect(identities.describe).not.toHaveBeenCalled()
    })

    it('survives losing the race for the same subject', async () => {
      model.findOne
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain({ _id: OWNER, slug: 'mohamed-khalil-zrelly' }))
      model.create.mockRejectedValue({ code: 11000 })

      await expect(service.ensureForUser(human())).resolves.toMatchObject({
        slug: 'mohamed-khalil-zrelly',
      })
    })

    it('carries on with a provisional address when Cognito cannot be read', async () => {
      identities.describe.mockResolvedValue({
        givenName: null,
        familyName: null,
        name: null,
        email: null,
      })

      const created = await service.ensureForUser(
        human({ displayName: null, email: null, username: 'x' }),
      )

      expect(created.slug).toBe('portfolio')
    })
  })

  describe('the address changes only when the owner asks', () => {
    it('never follows the person record', () => {
      expect(service).not.toHaveProperty('syncSlugFromName')
    })

    it('ignores everything but the consent mode on update', async () => {
      await service.updateOwn(OWNER, { consentMode: 'enhanced' })

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        OWNER,
        { $set: { consentMode: 'enhanced' } },
        { new: true, runValidators: true },
      )
    })

    it('writes nothing when the consent mode has not moved', async () => {
      model.findById.mockReturnValue(chain({ _id: OWNER, consentMode: 'measurement' }))

      await service.updateOwn(OWNER, { consentMode: 'measurement' })

      expect(model.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })

  describe('publishing', () => {
    it('stamps publishedAt the first time and keeps it afterwards', async () => {
      const first = new Date('2026-01-01T00:00:00.000Z')
      model.findById.mockReturnValue(chain({ _id: OWNER, status: 'draft', publishedAt: first }))

      await service.publish(OWNER)

      const [, update] = model.findByIdAndUpdate.mock.calls[0] as [string, { $set: Owner }]
      expect(update.$set.publishedAt).toBe(first)
      expect(update.$set.status).toBe('published')
    })

    it('refuses to publish a suspended portfolio', async () => {
      model.findById.mockReturnValue(chain({ _id: OWNER, status: 'suspended' }))

      await expect(service.publish(OWNER)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('public lookup', () => {
    it('finds only a published portfolio, by a normalised address', async () => {
      model.findOne.mockReturnValue(chain({ _id: OWNER, slug: 'someone' }))

      await service.findPublishedBySlug('  SomeOne  ')

      expect(model.findOne).toHaveBeenCalledWith({ slug: 'someone', status: 'published' })
    })

    it('is a 404, never a 403, for a draft or unknown address', async () => {
      model.findOne.mockReturnValue(chain(null))

      await expect(service.findPublishedBySlug('nobody')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('erasure', () => {
    it('rejects a malformed owner id before touching the collection', async () => {
      await expect(service.findById('nope')).rejects.toBeInstanceOf(BadRequestException)
      expect(model.findById).not.toHaveBeenCalled()
    })

    it('reports an owner that is already gone', async () => {
      model.findByIdAndDelete.mockReturnValue(chain(null))

      await expect(service.remove(OWNER)).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
