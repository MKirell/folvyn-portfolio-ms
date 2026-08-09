import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3_CLIENT } from '@/uploads/s3.token'
import type { AssetsConfig } from '@/config/configuration'
import { ownerObjectId } from '@/common/schemas/owned'
import type { PresignUploadDto } from '@/uploads/uploads.dto'

export interface PresignedUpload {
  url: string
  key: string
  expiresIn: number
}

export interface AssetObject {
  key: string
  size: number
  lastModified: string
}

export const ASSET_FOLDERS = ['imgs', 'files'] as const

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'])

export function folderForContentType(contentType: string): string {
  return contentType.startsWith('image/') ? 'imgs' : 'files'
}

export function folderForKey(key: string): string {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return IMAGE_EXTENSIONS.has(extension) ? 'imgs' : 'files'
}

@Injectable()
export class UploadsService {
  private readonly assets: AssetsConfig

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    config: ConfigService,
  ) {
    this.assets = config.getOrThrow<AssetsConfig>('assets')
  }

  private assertConfigured(): string {
    if (!this.assets.bucket) {
      throw new ServiceUnavailableException('The asset bucket is not configured')
    }
    return this.assets.bucket
  }

  async presign(ownerId: string, dto: PresignUploadDto): Promise<PresignedUpload> {
    const bucket = this.assertConfigured()
    const key = this.scoped(ownerId, dto.filename, folderForContentType(dto.contentType))

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: dto.contentType,
      ContentLength: dto.size,
      CacheControl: 'public, max-age=31536000, immutable',
    })

    const url = await getSignedUrl(this.client, command, { expiresIn: this.assets.urlTtl })
    return { url, key: dto.filename, expiresIn: this.assets.urlTtl }
  }

  async list(ownerId: string): Promise<AssetObject[]> {
    const bucket = this.assertConfigured()
    const objects: AssetObject[] = []

    for (const folder of ASSET_FOLDERS) {
      const prefix = `${folder}/${this.prefixFor(ownerId)}/`
      let token: string | undefined

      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
            MaxKeys: 1000,
          }),
        )

        for (const item of page.Contents ?? []) {
          if (!item.Key || item.Key.endsWith('/')) continue
          objects.push({
            key: item.Key.slice(prefix.length),
            size: item.Size ?? 0,
            lastModified: (item.LastModified ?? new Date()).toISOString(),
          })
        }

        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
    }

    return objects.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
  }

  async remove(ownerId: string, key: string): Promise<void> {
    const bucket = this.assertConfigured()
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: this.scoped(ownerId, key, folderForKey(key)),
      }),
    )
  }

  async removeAllOwnedBy(ownerId: string): Promise<number> {
    if (!this.assets.bucket) return 0

    const keys = await this.list(ownerId)
    await Promise.all(keys.map((asset) => this.remove(ownerId, asset.key)))
    return keys.length
  }

  private prefixFor(ownerId: string): string {
    return String(ownerObjectId(ownerId))
  }

  private scoped(ownerId: string, key: string, folder: string): string {
    return `${folder}/${this.prefixFor(ownerId)}/${key}`
  }
}
