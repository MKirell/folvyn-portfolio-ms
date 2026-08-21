import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Owner } from '@/owner/owner.schema'
import { normalizeSlug, slugCandidate, slugFromName, slugProblem } from '@/owner/slug'
import { toPlain } from '@/common/utils/serialize'
import { IdentityDirectory } from '@/auth/identity.directory'
import type { FederatedIdentity } from '@/auth/identity.directory'
import type { UpdateMeDto } from '@/owner/owner.dto'
import type { AuthenticatedUser } from '@/common/types/authenticated-user'

export type OwnerRecord = Owner & { id: string; updatedAt?: Date | string }

export interface SlugAvailability {
  slug: string
  available: boolean
  reason: string | null
}

const DUPLICATE_KEY = 11000
const MAX_SLUG_ATTEMPTS = 50

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === DUPLICATE_KEY
}

@Injectable()
export class OwnerService {
  constructor(
    @InjectModel(Owner.name) private readonly model: Model<Owner>,
    private readonly identities: IdentityDirectory,
  ) {}

  nobody(): OwnerRecord {
    return {
      id: new Types.ObjectId().toString(),
      sub: '',
      slug: '',
      email: null,
      displayName: null,
      status: 'draft',
      consentMode: 'measurement',
    } as unknown as OwnerRecord
  }

  async findBySub(sub: string): Promise<OwnerRecord | null> {
    const owner = await this.model.findOne({ sub }).lean<OwnerRecord>().exec()
    return owner ? toPlain(owner) : null
  }

  async findById(ownerId: string): Promise<OwnerRecord> {
    if (!Types.ObjectId.isValid(ownerId)) {
      throw new BadRequestException('Malformed owner identifier')
    }
    const owner = await this.model.findById(ownerId).lean<OwnerRecord>().exec()
    if (!owner) throw new NotFoundException('Owner not found')
    return toPlain(owner)
  }

  async findPublishedBySlug(slug: string): Promise<OwnerRecord> {
    const owner = await this.model
      .findOne({ slug: normalizeSlug(slug), status: 'published' })
      .lean<OwnerRecord>()
      .exec()
    if (!owner) throw new NotFoundException('No published portfolio lives at this address')
    return toPlain(owner)
  }

  async findPublished(): Promise<OwnerRecord[]> {
    const owners = await this.model
      .find({ status: 'published' })
      .sort({ slug: 1 })
      .lean<OwnerRecord[]>()
      .exec()

    return owners.map(toPlain)
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const existing = await this.model.exists({ slug: normalizeSlug(slug) }).exec()
    return existing !== null
  }

  async ensureForUser(user: AuthenticatedUser): Promise<OwnerRecord> {
    const existing = await this.findBySub(user.id)
    if (existing) return existing

    const identity = await this.identities.describe(user.username)
    const slug = await this.reserveSlug(user, identity)

    try {
      const created = await this.model.create({
        sub: user.id,
        slug,
        email: identity.email ?? user.email,
        displayName: identity.name ?? user.displayName,
      })
      return created.toJSON() as unknown as OwnerRecord
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      const raced = await this.findBySub(user.id)
      if (raced) return raced
      throw new ConflictException('That address has just been taken')
    }
  }

  async updateOwn(ownerId: string, dto: UpdateMeDto): Promise<OwnerRecord> {
    const owner = await this.findById(ownerId)
    const changes: Partial<Owner> = {}

    if (dto.consentMode && dto.consentMode !== owner.consentMode) {
      changes.consentMode = dto.consentMode
    }

    if (dto.slug !== undefined) {
      const wanted = normalizeSlug(dto.slug)
      if (wanted !== owner.slug) {
        const problem = slugProblem(wanted)
        if (problem) throw new BadRequestException(problem)
        if (await this.isSlugTaken(wanted)) {
          throw new ConflictException('That address is already taken')
        }
        changes.slug = wanted
      }
    }

    if (Object.keys(changes).length === 0) return owner

    try {
      const updated = await this.model
        .findByIdAndUpdate(ownerId, { $set: changes }, { new: true, runValidators: true })
        .lean<OwnerRecord>()
        .exec()
      if (!updated) throw new NotFoundException('Owner not found')
      return toPlain(updated)
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      throw new ConflictException('That address is already taken')
    }
  }

  async slugAvailability(ownerId: string, slug: string): Promise<SlugAvailability> {
    const wanted = normalizeSlug(slug)
    const problem = slugProblem(wanted)
    if (problem) return { slug: wanted, available: false, reason: problem }

    const owner = await this.findById(ownerId)
    if (wanted === owner.slug) return { slug: wanted, available: true, reason: null }

    if (await this.isSlugTaken(wanted)) {
      return { slug: wanted, available: false, reason: 'That address is already taken' }
    }
    return { slug: wanted, available: true, reason: null }
  }

  async publish(ownerId: string): Promise<OwnerRecord> {
    const owner = await this.findById(ownerId)
    if (owner.status === 'suspended') {
      throw new ConflictException('This portfolio has been suspended by the platform')
    }

    const updated = await this.model
      .findByIdAndUpdate(
        ownerId,
        { $set: { status: 'published', publishedAt: owner.publishedAt ?? new Date() } },
        { new: true, runValidators: true },
      )
      .lean<OwnerRecord>()
      .exec()
    if (!updated) throw new NotFoundException('Owner not found')
    return toPlain(updated)
  }

  async unpublish(ownerId: string): Promise<OwnerRecord> {
    const updated = await this.model
      .findByIdAndUpdate(ownerId, { $set: { status: 'draft' } }, { new: true })
      .lean<OwnerRecord>()
      .exec()
    if (!updated) throw new NotFoundException('Owner not found')
    return toPlain(updated)
  }

  async remove(ownerId: string): Promise<void> {
    const deleted = await this.model.findByIdAndDelete(ownerId).lean<OwnerRecord>().exec()
    if (!deleted) throw new NotFoundException('Owner not found')
  }

  async proposedSlugFor(user: AuthenticatedUser): Promise<string> {
    const identity = await this.identities.describe(user.username)
    return this.reserveSlug(user, identity)
  }

  private async reserveSlug(user: AuthenticatedUser, identity: FederatedIdentity): Promise<string> {
    const fromName =
      identity.givenName && identity.familyName
        ? slugFromName(identity.givenName, identity.familyName)
        : ''

    const seed =
      fromName ||
      slugCandidate(identity.name ?? '') ||
      slugCandidate(user.displayName ?? '') ||
      slugCandidate((identity.email ?? user.email)?.split('@')[0] ?? '') ||
      slugCandidate(user.username)

    return this.allocate(seed && !slugProblem(seed) ? seed : 'portfolio')
  }

  private async allocate(base: string, exceptOwnerId?: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
      if (slugProblem(candidate)) continue

      const holder = await this.model
        .findOne({ slug: candidate })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>()
        .exec()

      if (!holder || (exceptOwnerId && String(holder._id) === exceptOwnerId)) return candidate
    }

    throw new ConflictException('Could not allocate an address for this account')
  }
}
