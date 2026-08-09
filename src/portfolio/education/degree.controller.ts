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
import { DegreeService } from '@/portfolio/education/degree.service'
import { Degree } from '@/portfolio/education/degree.schema'
import { CreateDegreeDto, UpdateDegreeDto } from '@/portfolio/education/degree.dto'

@Controller('admin/degrees')
export class DegreeController {
  constructor(private readonly service: DegreeService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<Degree[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<Degree> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(@OwnerId() ownerId: string, @Body() dto: CreateDegreeDto): Promise<Degree> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<Degree[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDegreeDto,
  ): Promise<Degree> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
