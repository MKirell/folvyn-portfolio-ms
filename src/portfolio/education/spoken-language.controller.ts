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
import { SpokenLanguageService } from '@/portfolio/education/spoken-language.service'
import { SpokenLanguage } from '@/portfolio/education/spoken-language.schema'
import {
  CreateSpokenLanguageDto,
  UpdateSpokenLanguageDto,
} from '@/portfolio/education/spoken-language.dto'

@Controller('admin/spoken-languages')
export class SpokenLanguageController {
  constructor(private readonly service: SpokenLanguageService) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<SpokenLanguage[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<SpokenLanguage> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  create(
    @OwnerId() ownerId: string,
    @Body() dto: CreateSpokenLanguageDto,
  ): Promise<SpokenLanguage> {
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<SpokenLanguage[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSpokenLanguageDto,
  ): Promise<SpokenLanguage> {
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
