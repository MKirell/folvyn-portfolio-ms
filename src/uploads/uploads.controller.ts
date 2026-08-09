import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { OwnerId } from '@/common/decorators/current-owner.decorator'
import { UploadsService } from '@/uploads/uploads.service'
import type { AssetObject, PresignedUpload } from '@/uploads/uploads.service'
import { AssetKeyParamDto, PresignUploadDto } from '@/uploads/uploads.dto'

@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Get()
  list(@OwnerId() ownerId: string): Promise<AssetObject[]> {
    return this.service.list(ownerId)
  }

  @Post('presign')
  @HttpCode(HttpStatus.OK)
  presign(@OwnerId() ownerId: string, @Body() dto: PresignUploadDto): Promise<PresignedUpload> {
    return this.service.presign(ownerId, dto)
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param() params: AssetKeyParamDto): Promise<void> {
    return this.service.remove(ownerId, params.key)
  }
}
