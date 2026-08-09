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
import { VolunteeringService } from '@/portfolio/achievement/volunteering.service'
import { Volunteering } from '@/portfolio/achievement/volunteering.schema'
import {
  CreateVolunteeringDto,
  UpdateVolunteeringDto,
} from '@/portfolio/achievement/volunteering.dto'

@Controller('admin/volunteering')
export class VolunteeringController {
  constructor(private readonly service: VolunteeringService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<Volunteering[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<Volunteering> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(@OwnerId() ownerId: string, @Body() dto: CreateVolunteeringDto): Promise<Volunteering> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<Volunteering[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVolunteeringDto,
  ): Promise<Volunteering> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
