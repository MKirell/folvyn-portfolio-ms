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
import { ProjectService } from '@/portfolio/project/project.service'
import { Project } from '@/portfolio/project/project.schema'
import { CreateProjectDto, UpdateProjectDto } from '@/portfolio/project/project.dto'

@Controller('admin/projects')
export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<Project[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<Project> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(@OwnerId() ownerId: string, @Body() dto: CreateProjectDto): Promise<Project> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<Project[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
