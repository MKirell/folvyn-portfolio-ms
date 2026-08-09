import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import type { DatabaseConfig } from '@/config/configuration'

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = config.getOrThrow<DatabaseConfig>('database')
        return {
          uri: database.uri,
          dbName: database.dbName,
          autoIndex: config.get<string>('app.env') !== 'production',
        }
      },
    }),
  ],
})
export class DatabaseModule {}
