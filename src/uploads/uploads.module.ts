import { Module } from '@nestjs/common'
import { UploadsController } from '@/uploads/uploads.controller'
import { UploadsService } from '@/uploads/uploads.service'
import { s3ClientProvider } from '@/uploads/s3.provider'

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, s3ClientProvider],
  exports: [UploadsService],
})
export class UploadsModule {}
