import { S3Client } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import type { Provider } from '@nestjs/common'
import { S3_CLIENT } from '@/uploads/s3.token'
import type { AssetsConfig } from '@/config/configuration'

export const s3ClientProvider: Provider = {
  provide: S3_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): S3Client => {
    const assets = config.getOrThrow<AssetsConfig>('assets')
    return new S3Client({ region: assets.region })
  },
}
