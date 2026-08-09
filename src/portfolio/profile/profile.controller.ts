import { Body, Controller, Get, Patch, Put } from '@nestjs/common'
import { OwnerId } from '@/common/decorators/current-owner.decorator'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { Profile } from '@/portfolio/profile/profile.schema'
import { UpdateProfileDto, UpsertProfileDto } from '@/portfolio/profile/profile.dto'

@Controller('admin/profile')
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  @Get()
  find(@OwnerId() ownerId: string): Promise<Profile> {
    return this.service.find(ownerId)
  }

  @Put()
  upsert(@OwnerId() ownerId: string, @Body() dto: UpsertProfileDto): Promise<Profile> {
    return this.service.upsert(ownerId, dto)
  }

  @Patch()
  update(@OwnerId() ownerId: string, @Body() dto: UpdateProfileDto): Promise<Profile> {
    return this.service.update(ownerId, dto)
  }
}
