import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Model, Types } from 'mongoose'
import { PersonService } from '@/portfolio/person/person.service'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { Person } from '@/portfolio/person/person.schema'
import { Profile } from '@/portfolio/profile/profile.schema'
import { Locale } from '@/portfolio/locale/locale.schema'
import type { UpsertPersonDto } from '@/portfolio/person/person.dto'
import type { UpsertProfileDto } from '@/portfolio/profile/profile.dto'

const OWNER = '507f1f77bcf86cd799439021'
const OTHER_OWNER = '507f1f77bcf86cd799439022'

function chain<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  }
}

describe('PersonService', () => {
  let model: {
    findOne: jest.Mock
    findOneAndUpdate: jest.Mock
    deleteMany: jest.Mock
  }
  let service: PersonService

  beforeEach(() => {
    model = {
      findOne: jest.fn().mockReturnValue(chain({ givenName: 'Owner' })),
      findOneAndUpdate: jest.fn().mockReturnValue(chain({ givenName: 'Owner' })),
      deleteMany: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) }),
    }
    service = new PersonService(model as unknown as Model<Person>)
  })

  it('reads the one document belonging to this owner', async () => {
    await service.find(OWNER)

    expect(model.findOne).toHaveBeenCalledWith({ ownerId: new Types.ObjectId(OWNER) })
  })

  it('explains that the profile has not been created when it is missing', async () => {
    model.findOne.mockReturnValue(chain(null))

    await expect(service.find(OWNER)).rejects.toThrow(/has not been created/)
  })

  it('returns null rather than throwing when the caller can cope', async () => {
    model.findOne.mockReturnValue(chain(null))

    await expect(service.findOptional(OWNER)).resolves.toBeNull()
  })

  it('creates the document on first upsert and stamps the owner', async () => {
    await service.upsert(OWNER, { givenName: 'Owner' } as UpsertPersonDto)

    const [filter, update, options] = model.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
      Record<string, unknown>,
    ]

    expect(filter).toEqual({ ownerId: new Types.ObjectId(OWNER) })
    expect(String(update.$set.ownerId)).toBe(OWNER)
    expect(options.upsert).toBe(true)
    expect(options.runValidators).toBe(true)
  })

  it('never creates a second document on a partial update', async () => {
    await service.update(OWNER, { affiliation: 'MKirell' })

    const options = model.findOneAndUpdate.mock.calls[0][2] as Record<string, unknown>
    expect(options.upsert).toBeUndefined()
  })

  it('reports a missing document on partial update', async () => {
    model.findOneAndUpdate.mockReturnValue(chain(null))

    await expect(service.update(OWNER, { affiliation: 'MKirell' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('ignores an owner supplied in the body', async () => {
    await service.update(OWNER, { ownerId: OTHER_OWNER, affiliation: 'MKirell' } as never)

    const [filter, update] = model.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ]

    expect(String(filter.ownerId)).toBe(OWNER)
    expect(update.$set.ownerId).toBeUndefined()
  })

  it('pins the caller as the owner on upsert even when the body claims another', async () => {
    await service.upsert(OWNER, { ownerId: OTHER_OWNER } as unknown as UpsertPersonDto)

    const update = model.findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(String(update.$set.ownerId)).toBe(OWNER)
  })

  it('rejects a malformed owner id rather than reading every tenant', async () => {
    await expect(service.find('nope')).rejects.toBeInstanceOf(BadRequestException)
    expect(model.findOne).not.toHaveBeenCalled()
  })
})

describe('ProfileService', () => {
  let model: {
    findOne: jest.Mock
    findOneAndUpdate: jest.Mock
    deleteMany: jest.Mock
  }
  let service: ProfileService

  beforeEach(() => {
    model = {
      findOne: jest.fn().mockReturnValue(chain({ highlightFocus: 'RAG' })),
      findOneAndUpdate: jest.fn().mockReturnValue(chain({ highlightFocus: 'RAG' })),
      deleteMany: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) }),
    }
    service = new ProfileService(model as unknown as Model<Profile>)
  })

  it('reads the one document belonging to this owner', async () => {
    await service.find(OWNER)

    expect(model.findOne).toHaveBeenCalledWith({ ownerId: new Types.ObjectId(OWNER) })
  })

  it('reports a missing profile', async () => {
    model.findOne.mockReturnValue(chain(null))

    await expect(service.find(OWNER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('pins the owner on upsert so the body cannot spoof it', async () => {
    await service.upsert(OWNER, { ownerId: OTHER_OWNER } as unknown as UpsertProfileDto)

    const update = model.findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(String(update.$set.ownerId)).toBe(OWNER)
  })

  it('reports a missing profile on partial update', async () => {
    model.findOneAndUpdate.mockReturnValue(chain(null))

    await expect(service.update(OWNER, { highlightFocus: ['RAG'] })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('erases only this owner documents', async () => {
    await service.removeAllOwnedBy(OWNER)

    expect(model.deleteMany).toHaveBeenCalledWith({ ownerId: new Types.ObjectId(OWNER) })
  })
})

describe('LocaleService', () => {
  let model: {
    find: jest.Mock
    exists: jest.Mock
  }
  let service: LocaleService

  beforeEach(() => {
    model = {
      find: jest.fn().mockReturnValue(
        chain([
          { code: 'en', label: 'EN', flagCode: 'gb', order: 0 },
          { code: 'fr', label: 'FR', flagCode: 'fr', order: 1 },
        ]),
      ),
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'x' }) }),
    }
    service = new LocaleService(model as unknown as Model<Locale>)
  })

  it('returns only enabled languages, ordered, without internal fields', async () => {
    const result = await service.findEnabled(OWNER)

    expect(model.find).toHaveBeenCalledWith({
      enabled: true,
      ownerId: new Types.ObjectId(OWNER),
    })
    expect(result).toEqual([
      { code: 'en', label: 'EN', flagCode: 'gb' },
      { code: 'fr', label: 'FR', flagCode: 'fr' },
    ])
  })

  it('confirms a supported language for this owner', async () => {
    await expect(service.isSupported(OWNER, 'en')).resolves.toBe(true)
    expect(model.exists).toHaveBeenCalledWith({
      code: 'en',
      enabled: true,
      ownerId: new Types.ObjectId(OWNER),
    })
  })

  it('rejects a disabled or unknown language', async () => {
    model.exists.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })

    await expect(service.isSupported(OWNER, 'de')).resolves.toBe(false)
  })
})
