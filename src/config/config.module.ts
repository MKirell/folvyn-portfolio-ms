import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { configuration } from './configuration'
import { validationSchema } from './validation.schema'

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      envFilePath: [
        `.env.${process.env.APP_ENV ?? 'local'}.local`,
        `.env.${process.env.APP_ENV ?? 'local'}`,
      ],
    }),
  ],
})
export class ConfigModule {}
