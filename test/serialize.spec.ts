import { Model, Types } from 'mongoose'
import { toPlain, toPlainList } from '@/common/utils/serialize'
import { BaseCrudService } from '@/common/services/base-crud.service'
import { PersonService } from '@/portfolio/person/person.service'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { Person } from '@/portfolio/person/person.schema'
import { Profile } from '@/portfolio/profile/profile.schema'

interface Widget {
  order: number
  label?: string
}

class WidgetService extends BaseCrudService<Widget> {
  constructor(model: Model<Widget>) {
    super(model, 'Widget')
  }
}

function chain<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  }
}

describe('toPlain', () => {
  it('renames _id to a string id', () => {
    const id = new Types.ObjectId()

    expect(toPlain({ _id: id, label: 'x' })).toEqual({ id: id.toHexString(), label: 'x' })
  })

  it('accepts an id that is already a string', () => {
    expect(toPlain({ _id: 'abc' })).toEqual({ id: 'abc' })
  })

  it('drops the mongo version key', () => {
    expect(toPlain({ _id: 'a', __v: 3 })).not.toHaveProperty('__v')
  })

  it('leaves a document without an _id untouched', () => {
    expect(toPlain({ label: 'x' })).toEqual({ label: 'x' })
  })

  it('passes non-objects straight through', () => {
    expect(toPlain(null)).toBeNull()
    expect(toPlain('text')).toBe('text')
    expect(toPlain(7)).toBe(7)
  })

  it('does not mutate the input', () => {
    const input = { _id: 'a', label: 'x' }
    toPlain(input)

    expect(input).toEqual({ _id: 'a', label: 'x' })
  })

  it('maps a whole list', () => {
    expect(toPlainList([{ _id: 'a' }, { _id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})

const OWNER = '507f1f77bcf86cd799439021'

describe('admin reads expose `id`, never `_id`', () => {
  const objectId = new Types.ObjectId()

  it('BaseCrudService.findAll', async () => {
    const model = {
      find: jest.fn().mockReturnValue(chain([{ _id: objectId, order: 0 }])),
    }
    const service = new WidgetService(model as unknown as Model<Widget>)

    const [first] = await service.findAll(OWNER)

    expect(first).toHaveProperty('id', objectId.toHexString())
    expect(first).not.toHaveProperty('_id')
  })

  it('BaseCrudService.findOne', async () => {
    const model = {
      findOne: jest.fn().mockReturnValue(chain({ _id: objectId, order: 0 })),
    }
    const service = new WidgetService(model as unknown as Model<Widget>)

    const found = await service.findOne(OWNER, objectId.toHexString())

    expect(found).toHaveProperty('id')
    expect(found).not.toHaveProperty('_id')
  })

  it('BaseCrudService.update', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue(chain({ _id: objectId, order: 1 })),
    }
    const service = new WidgetService(model as unknown as Model<Widget>)

    const updated = await service.update(OWNER, objectId.toHexString(), { order: 1 })

    expect(updated).toHaveProperty('id')
    expect(updated).not.toHaveProperty('_id')
  })

  it('BaseCrudService.reorder returns the normalised list', async () => {
    const model = {
      find: jest.fn().mockReturnValue(chain([{ _id: objectId, order: 0 }])),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      bulkWrite: jest.fn().mockResolvedValue({}),
    }
    const service = new WidgetService(model as unknown as Model<Widget>)

    const [first] = await service.reorder(OWNER, [{ id: objectId.toHexString(), order: 0 }])

    expect(first).toHaveProperty('id')
    expect(first).not.toHaveProperty('_id')
  })

  it('PersonService.find', async () => {
    const model = {
      findOne: jest.fn().mockReturnValue(chain({ _id: objectId, givenName: 'Owner' })),
    }
    const service = new PersonService(model as unknown as Model<Person>)

    const person = await service.find(OWNER)

    expect(person).toHaveProperty('id')
    expect(person).not.toHaveProperty('_id')
  })

  it('ProfileService.find', async () => {
    const model = {
      findOne: jest.fn().mockReturnValue(chain({ _id: objectId, highlightFocus: 'RAG' })),
    }
    const service = new ProfileService(model as unknown as Model<Profile>)

    const profile = await service.find(OWNER)

    expect(profile).toHaveProperty('id')
    expect(profile).not.toHaveProperty('_id')
  })
})
