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
import { AwardService } from '@/portfolio/achievement/award.service'
import { Award } from '@/portfolio/achievement/award.schema'
import { CreateAwardDto, UpdateAwardDto } from '@/portfolio/achievement/award.dto'

@Controller('admin/awards')
export class AwardController {
  constructor(private readonly service: AwardService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<Award[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<Award> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(@OwnerId() ownerId: string, @Body() dto: CreateAwardDto): Promise<Award> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<Award[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAwardDto,
  ): Promise<Award> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
