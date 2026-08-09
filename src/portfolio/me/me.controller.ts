import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { CurrentOwner, OwnerId } from '@/common/decorators/current-owner.decorator'
import { OwnerService } from '@/owner/owner.service'
import { OwnerLifecycleService } from '@/portfolio/me/owner-lifecycle.service'
import { SlugParamDto, UpdateMeDto } from '@/owner/owner.dto'
import type { OwnerRecord, SlugAvailability } from '@/owner/owner.service'
import type { OwnerExport } from '@/portfolio/me/owner-lifecycle.service'

@Controller('me')
export class MeController {
  constructor(
    private readonly owners: OwnerService,
    private readonly lifecycle: OwnerLifecycleService,
  ) {}

  @Get()
  find(@CurrentOwner() owner: OwnerRecord): OwnerRecord {
    return owner
  }

  @Patch()
  update(@OwnerId() ownerId: string, @Body() dto: UpdateMeDto): Promise<OwnerRecord> {
    return this.owners.updateOwn(ownerId, dto)
  }

  @Post('publish')
  publish(@OwnerId() ownerId: string): Promise<OwnerRecord> {
    return this.lifecycle.publish(ownerId)
  }

  @Post('unpublish')
  unpublish(@OwnerId() ownerId: string): Promise<OwnerRecord> {
    return this.owners.unpublish(ownerId)
  }

  @Get('slug/:slug')
  slugAvailability(
    @OwnerId() ownerId: string,
    @Param() params: SlugParamDto,
  ): Promise<SlugAvailability> {
    return this.owners.slugAvailability(ownerId, params.slug)
  }

  @Get('export')
  exportAll(@OwnerId() ownerId: string): Promise<OwnerExport> {
    return this.lifecycle.exportAll(ownerId)
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  erase(@OwnerId() ownerId: string): Promise<void> {
    return this.lifecycle.erase(ownerId)
  }
}
