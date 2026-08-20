import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Model, Types } from 'mongoose'
import { BaseCrudService } from '@/common/services/base-crud.service'

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

const VALID_ID = '507f1f77bcf86cd799439011'
const OWNER = '507f1f77bcf86cd799439021'
const OTHER_OWNER = '507f1f77bcf86cd799439022'

describe('BaseCrudService', () => {
  let model: {
    find: jest.Mock
    findOne: jest.Mock
    findOneAndUpdate: jest.Mock
    findOneAndDelete: jest.Mock
    countDocuments: jest.Mock
    bulkWrite: jest.Mock
    create: jest.Mock
    deleteMany: jest.Mock
    updateMany: jest.Mock
    findById: jest.Mock
  }
  let service: WidgetService

  beforeEach(() => {
    model = {
      find: jest.fn().mockReturnValue(chain([{ order: 0 }])),
      findOne: jest.fn().mockReturnValue(chain(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(chain({ order: 0, label: 'updated' })),
      findOneAndDelete: jest.fn().mockReturnValue(chain({ order: 0 })),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      bulkWrite: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((doc: Widget) => Promise.resolve({ toJSON: () => doc })),
      deleteMany: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 3 }) }),
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findById: jest.fn().mockReturnValue(chain(null)),
    }
    service = new WidgetService(model as unknown as Model<Widget>)
  })

  describe('findAll', () => {
    it('returns entries sorted by explicit order', async () => {
      await service.findAll(OWNER)

      expect(model.find).toHaveBeenCalledWith({ ownerId: new Types.ObjectId(OWNER) })
      expect(model.find.mock.results[0].value.sort).toHaveBeenCalledWith({
        order: 1,
        createdAt: 1,
      })
    })

    it('narrows a supplied filter to the owner', async () => {
      await service.findAll(OWNER, { label: 'x' })

      expect(model.find).toHaveBeenCalledWith({
        label: 'x',
        ownerId: new Types.ObjectId(OWNER),
      })
    })
  })

  describe('findOne', () => {
    it('returns the matching entry', async () => {
      model.findOne.mockReturnValue(chain({ order: 0 }))

      await expect(service.findOne(OWNER, VALID_ID)).resolves.toEqual({ order: 0 })
    })

    it('rejects a malformed id before querying', async () => {
      await expect(service.findOne(OWNER, 'nope')).rejects.toBeInstanceOf(BadRequestException)
      expect(model.findOne).not.toHaveBeenCalled()
    })

    it('reports a missing entry by resource name', async () => {
      model.findOne.mockReturnValue(chain(null))

      await expect(service.findOne(OWNER, VALID_ID)).rejects.toThrow('Widget not found')
    })
  })

  describe('create', () => {
    it('lands at order zero, so a new entry shows up first', async () => {
      await service.create(OWNER, { label: 'new' })

      expect(model.create).toHaveBeenCalledWith({
        label: 'new',
        order: 0,
        ownerId: new Types.ObjectId(OWNER),
      })
    })

    it('shifts every existing entry down to make room, within the owner only', async () => {
      await service.create(OWNER, { label: 'new' })

      expect(model.updateMany).toHaveBeenCalledWith(
        { ownerId: new Types.ObjectId(OWNER) },
        { $inc: { order: 1 } },
      )
    })

    it('never writes a negative order, which the schema forbids', async () => {
      await service.create(OWNER, { label: 'first' })
      await service.create(OWNER, { label: 'second' })

      for (const call of model.create.mock.calls) {
        expect((call[0] as { order: number }).order).toBeGreaterThanOrEqual(0)
      }
    })

    it('honours an explicitly supplied order and shifts nothing', async () => {
      await service.create(OWNER, { label: 'pinned', order: 2 })

      expect(model.create).toHaveBeenCalledWith({
        label: 'pinned',
        order: 2,
        ownerId: new Types.ObjectId(OWNER),
      })
      expect(model.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('runs schema validators on the update', async () => {
      await service.update(OWNER, VALID_ID, { label: 'updated' })

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(VALID_ID), ownerId: new Types.ObjectId(OWNER) },
        { label: 'updated' },
        { new: true, runValidators: true },
      )
    })

    it('rejects a malformed id', async () => {
      await expect(service.update(OWNER, 'nope', {})).rejects.toBeInstanceOf(BadRequestException)
    })

    it('reports a missing entry', async () => {
      model.findOneAndUpdate.mockReturnValue(chain(null))

      await expect(service.update(OWNER, VALID_ID, {})).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('remove', () => {
    it('deletes an existing entry', async () => {
      await expect(service.remove(OWNER, VALID_ID)).resolves.toBeUndefined()

      expect(model.findOneAndDelete).toHaveBeenCalledWith({
        _id: new Types.ObjectId(VALID_ID),
        ownerId: new Types.ObjectId(OWNER),
      })
    })

    it('rejects a malformed id', async () => {
      await expect(service.remove(OWNER, 'nope')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('reports a missing entry', async () => {
      model.findOneAndDelete.mockReturnValue(chain(null))

      await expect(service.remove(OWNER, VALID_ID)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('reorder', () => {
    it('writes every new position in a single batch', async () => {
      model.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(2) })
      const second = '507f1f77bcf86cd799439012'

      await service.reorder(OWNER, [
        { id: VALID_ID, order: 1 },
        { id: second, order: 0 },
      ])

      const operations = model.bulkWrite.mock.calls[0][0] as {
        updateOne: {
          filter: { _id: Types.ObjectId; ownerId: Types.ObjectId }
          update: { $set: { order: number } }
        }
      }[]

      expect(operations).toHaveLength(2)
      expect(operations[0].updateOne.update).toEqual({ $set: { order: 1 } })
      expect(String(operations[1].updateOne.filter._id)).toBe(second)
      expect(String(operations[0].updateOne.filter.ownerId)).toBe(OWNER)
    })

    it('refuses the whole batch when an id does not exist', async () => {
      model.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) })

      await expect(service.reorder(OWNER, [{ id: VALID_ID, order: 0 }])).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(model.bulkWrite).not.toHaveBeenCalled()
    })

    it('rejects a malformed id without writing anything', async () => {
      await expect(service.reorder(OWNER, [{ id: 'nope', order: 0 }])).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(model.bulkWrite).not.toHaveBeenCalled()
    })

    it('is a no-op for an empty batch', async () => {
      await service.reorder(OWNER, [])

      expect(model.bulkWrite).not.toHaveBeenCalled()
      expect(model.find).toHaveBeenCalled()
    })
  })

  describe('tenant isolation', () => {
    it.each([
      ['findAll', () => service.findAll(OWNER)],
      ['findOne', () => service.findOne(OWNER, VALID_ID)],
      ['update', () => service.update(OWNER, VALID_ID, { label: 'x' })],
      ['remove', () => service.remove(OWNER, VALID_ID)],
      ['removeAllOwnedBy', () => service.removeAllOwnedBy(OWNER)],
    ])('%s never queries without an owner filter', async (_name, run) => {
      model.findOne.mockReturnValue(chain({ order: 0 }))

      await run()

      const queries = [
        ...model.find.mock.calls,
        ...model.findOne.mock.calls,
        ...model.findOneAndUpdate.mock.calls,
        ...model.findOneAndDelete.mock.calls,
        ...model.deleteMany.mock.calls,
      ].map(([filter]) => filter as Record<string, unknown>)

      expect(queries.length).toBeGreaterThan(0)
      for (const query of queries) {
        expect(String(query.ownerId)).toBe(OWNER)
      }
    })

    it('refuses a payload that tries to reassign the owner', async () => {
      await service.update(OWNER, VALID_ID, { ownerId: OTHER_OWNER, label: 'x' })

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(VALID_ID), ownerId: new Types.ObjectId(OWNER) },
        { label: 'x' },
        { new: true, runValidators: true },
      )
    })

    it('stamps the caller as the owner even when the body claims another', async () => {
      await service.create(OWNER, { label: 'new', order: 0, ownerId: OTHER_OWNER })

      expect(model.create).toHaveBeenCalledWith({
        label: 'new',
        order: 0,
        ownerId: new Types.ObjectId(OWNER),
      })
    })

    it('rejects a malformed owner id rather than querying every tenant', async () => {
      await expect(service.findAll('not-an-id')).rejects.toBeInstanceOf(BadRequestException)
      expect(model.find).not.toHaveBeenCalled()
    })
  })
})
