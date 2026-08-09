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
import { SkillCategoryService } from '@/portfolio/skill/skill-category.service'
import { SkillCategory } from '@/portfolio/skill/skill-category.schema'
import {
  CreateSkillCategoryDto,
  UpdateSkillCategoryDto,
} from '@/portfolio/skill/skill-category.dto'

@Controller('admin/skill-categories')
export class SkillCategoryController {
  constructor(private readonly service: SkillCategoryService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<SkillCategory[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<SkillCategory> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(@OwnerId() ownerId: string, @Body() dto: CreateSkillCategoryDto): Promise<SkillCategory> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<SkillCategory[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSkillCategoryDto,
  ): Promise<SkillCategory> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
