import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

export const ASSET_KEY_PATTERN = /^[a-z0-9_-]+\.[a-z]{3,4}$/

export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
] as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export class PresignUploadDto {
  @IsString()
  @MaxLength(255)
  @Matches(ASSET_KEY_PATTERN, {
    message: 'filename must be lowercase, carry no folder, and end in a 3 or 4 letter extension',
  })
  filename: string

  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType: string

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size: number
}

export class AssetKeyParamDto {
  @IsString()
  @MaxLength(255)
  @Matches(ASSET_KEY_PATTERN)
  key: string
}
