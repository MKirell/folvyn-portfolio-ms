import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Profile } from '@/portfolio/profile/profile.schema'
import { ownerObjectId, withoutOwnerId } from '@/common/schemas/owned'
import { toPlain } from '@/common/utils/serialize'
import type { UpdateProfileDto, UpsertProfileDto } from '@/portfolio/profile/profile.dto'

@Injectable()
export class ProfileService {
  constructor(@InjectModel(Profile.name) private readonly model: Model<Profile>) {}

  async find(ownerId: string): Promise<Profile> {
    const profile = await this.model
      .findOne({ ownerId: ownerObjectId(ownerId) })
      .lean<Profile>()
      .exec()
    if (!profile) throw new NotFoundException('Profile has not been created yet')
    return toPlain(profile)
  }

  async findOptional(ownerId: string): Promise<Profile | null> {
    const profile = await this.model
      .findOne({ ownerId: ownerObjectId(ownerId) })
      .lean<Profile>()
      .exec()
    return profile ? toPlain(profile) : null
  }

  async upsert(ownerId: string, payload: UpsertProfileDto): Promise<Profile> {
    const owner = ownerObjectId(ownerId)
    const profile = await this.model
      .findOneAndUpdate(
        { ownerId: owner },
        { $set: { ...payload, ownerId: owner } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      )
      .lean<Profile>()
      .exec()
    return toPlain(profile)
  }

  async update(ownerId: string, payload: UpdateProfileDto): Promise<Profile> {
    const profile = await this.model
      .findOneAndUpdate(
        { ownerId: ownerObjectId(ownerId) },
        { $set: withoutOwnerId(payload) },
        { new: true, runValidators: true },
      )
      .lean<Profile>()
      .exec()
    if (!profile) throw new NotFoundException('Profile has not been created yet')
    return toPlain(profile)
  }

  async removeAllOwnedBy(ownerId: string): Promise<number> {
    const result = await this.model.deleteMany({ ownerId: ownerObjectId(ownerId) }).exec()
    return result.deletedCount ?? 0
  }
}
