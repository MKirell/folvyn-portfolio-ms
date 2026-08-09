import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FilterQuery, Model, Types } from 'mongoose'
import type { OrderedEntity, ReorderEntry } from '@/common/types/portfolio.types'
import { ownerObjectId, withoutOwnerId } from '@/common/schemas/owned'
import { toPlain, toPlainList } from '@/common/utils/serialize'

export abstract class BaseCrudService<T extends OrderedEntity> {
  protected constructor(
    protected readonly model: Model<T>,
    protected readonly resourceName: string,
  ) {}

  async findAll(ownerId: string, filter: FilterQuery<T> = {}): Promise<T[]> {
    const found = await this.model
      .find(this.scoped(ownerId, filter))
      .sort({ order: 1, createdAt: 1 })
      .lean<T[]>()
      .exec()
    return toPlainList(found)
  }

  async findOne(ownerId: string, id: string): Promise<T> {
    this.assertObjectId(id)
    const found = await this.model
      .findOne(this.scoped(ownerId, { _id: new Types.ObjectId(id) }))
      .lean<T>()
      .exec()
    if (!found) throw new NotFoundException(`${this.resourceName} not found`)
    return toPlain(found)
  }

  async create(ownerId: string, payload: object): Promise<T> {
    const requested = (payload as Partial<OrderedEntity>).order
    if (requested === undefined) await this.shiftDown(ownerId)

    const created = await this.model.create({
      ...payload,
      ownerId: this.asOwnerId(ownerId),
      order: requested ?? 0,
    })

    await this.normalizeOrder(ownerId)
    const settled = await this.model.findById(created._id).lean<T>().exec()
    return toPlain((settled ?? created.toJSON()) as T)
  }

  async update(ownerId: string, id: string, payload: object): Promise<T> {
    this.assertObjectId(id)
    const updated = await this.model
      .findOneAndUpdate(
        this.scoped(ownerId, { _id: new Types.ObjectId(id) }),
        withoutOwnerId(payload),
        { new: true, runValidators: true },
      )
      .lean<T>()
      .exec()
    if (!updated) throw new NotFoundException(`${this.resourceName} not found`)
    return toPlain(updated)
  }

  async remove(ownerId: string, id: string): Promise<void> {
    this.assertObjectId(id)
    const deleted = await this.model
      .findOneAndDelete(this.scoped(ownerId, { _id: new Types.ObjectId(id) }))
      .lean<T>()
      .exec()
    if (!deleted) throw new NotFoundException(`${this.resourceName} not found`)
    await this.normalizeOrder(ownerId)
  }

  async reorder(ownerId: string, entries: ReorderEntry[]): Promise<T[]> {
    if (entries.length === 0) return this.findAll(ownerId)

    const ids = entries.map((entry) => {
      this.assertObjectId(entry.id)
      return new Types.ObjectId(entry.id)
    })

    const existing = await this.model
      .countDocuments(this.scoped(ownerId, { _id: { $in: ids } }))
      .exec()
    if (existing !== entries.length) {
      throw new NotFoundException(`One or more ${this.resourceName} entries do not exist`)
    }

    const operations = entries.map((entry) => ({
      updateOne: {
        filter: this.scoped(ownerId, { _id: new Types.ObjectId(entry.id) }),
        update: { $set: { order: entry.order } },
      },
    }))
    await this.model.bulkWrite(operations as Parameters<Model<T>['bulkWrite']>[0])
    return this.findAll(ownerId)
  }

  async removeAllOwnedBy(ownerId: string): Promise<number> {
    const result = await this.model.deleteMany(this.scoped(ownerId)).exec()
    return result.deletedCount ?? 0
  }

  protected async shiftDown(ownerId: string): Promise<void> {
    await this.model.updateMany(this.scoped(ownerId), { $inc: { order: 1 } }).exec()
  }

  protected async normalizeOrder(ownerId: string): Promise<void> {
    const entries = await this.model
      .find(this.scoped(ownerId))
      .sort({ order: 1, createdAt: 1 })
      .select('_id order')
      .lean<{ _id: Types.ObjectId; order?: number }[]>()
      .exec()

    const operations = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => entry.order !== index)
      .map(({ entry, index }) => ({
        updateOne: {
          filter: this.scoped(ownerId, { _id: entry._id }),
          update: { $set: { order: index } },
        },
      }))

    if (operations.length > 0) {
      await this.model.bulkWrite(operations as Parameters<Model<T>['bulkWrite']>[0])
    }
  }

  protected scoped(ownerId: string, filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, ownerId: this.asOwnerId(ownerId) }
  }

  protected asOwnerId(ownerId: string): Types.ObjectId {
    return ownerObjectId(ownerId)
  }

  protected assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Malformed ${this.resourceName} identifier`)
    }
  }
}
