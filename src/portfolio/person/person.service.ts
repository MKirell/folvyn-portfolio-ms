import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Person } from '@/portfolio/person/person.schema'
import { ownerObjectId, withoutOwnerId } from '@/common/schemas/owned'
import { toPlain } from '@/common/utils/serialize'
import type { UpdatePersonDto, UpsertPersonDto } from '@/portfolio/person/person.dto'

@Injectable()
export class PersonService {
  constructor(@InjectModel(Person.name) private readonly model: Model<Person>) {}

  async find(ownerId: string): Promise<Person> {
    const person = await this.model
      .findOne({ ownerId: ownerObjectId(ownerId) })
      .lean<Person>()
      .exec()
    if (!person) throw new NotFoundException('Person profile has not been created yet')
    return toPlain(person)
  }

  async findOptional(ownerId: string): Promise<Person | null> {
    const person = await this.model
      .findOne({ ownerId: ownerObjectId(ownerId) })
      .lean<Person>()
      .exec()
    return person ? toPlain(person) : null
  }

  async upsert(ownerId: string, payload: UpsertPersonDto): Promise<Person> {
    const owner = ownerObjectId(ownerId)
    const person = await this.model
      .findOneAndUpdate(
        { ownerId: owner },
        { $set: { ...payload, ownerId: owner } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      )
      .lean<Person>()
      .exec()
    return toPlain(person)
  }

  async update(ownerId: string, payload: UpdatePersonDto): Promise<Person> {
    const person = await this.model
      .findOneAndUpdate(
        { ownerId: ownerObjectId(ownerId) },
        { $set: withoutOwnerId(payload) },
        { new: true, runValidators: true },
      )
      .lean<Person>()
      .exec()
    if (!person) throw new NotFoundException('Person profile has not been created yet')
    return toPlain(person)
  }

  async removeAllOwnedBy(ownerId: string): Promise<number> {
    const result = await this.model.deleteMany({ ownerId: ownerObjectId(ownerId) }).exec()
    return result.deletedCount ?? 0
  }
}
