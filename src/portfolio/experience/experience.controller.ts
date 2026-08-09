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
import { OwnerId } from '@/common/decorators/current-owner.decorator'
import { ReorderDto } from '@/common/dto/reorder.dto'
import { ExperienceService } from '@/portfolio/experience/experience.service'
import { Experience } from '@/portfolio/experience/experience.schema'
import { CreateExperienceDto, UpdateExperienceDto } from '@/portfolio/experience/experience.dto'

@Controller('admin/experiences')
export class ExperienceController {
  constructor(private readonly service: ExperienceService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<Experience[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<Experience> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(@OwnerId() ownerId: string, @Body() dto: CreateExperienceDto): Promise<Experience> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<Experience[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExperienceDto,
  ): Promise<Experience> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
