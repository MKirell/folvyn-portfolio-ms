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
import { LocaleService } from '@/portfolio/locale/locale.service'
import { Locale } from '@/portfolio/locale/locale.schema'
import { CreateLocaleDto, UpdateLocaleDto } from '@/portfolio/locale/locale.dto'
import { TranslationCoverageService } from '@/portfolio/locale/translation-coverage.service'

@Controller('admin/locales')
export class LocaleController {
  constructor(
    private readonly service: LocaleService,
    private readonly coverage: TranslationCoverageService,
  ) {}

  @Get()
  findAll(@OwnerId() ownerId: string): Promise<Locale[]> {
    return this.service.findAll(ownerId)
  }

  @Get(':id')
  findOne(@OwnerId() ownerId: string, @Param('id') id: string): Promise<Locale> {
    return this.service.findOne(ownerId, id)
  }

  @Post()
  async create(@OwnerId() ownerId: string, @Body() dto: CreateLocaleDto): Promise<Locale> {
    if (dto.enabled) await this.coverage.assertReady(ownerId, dto.code)
    return this.service.create(ownerId, dto)
  }

  @Patch('reorder')
  reorder(@OwnerId() ownerId: string, @Body() dto: ReorderDto): Promise<Locale[]> {
    return this.service.reorder(ownerId, dto.entries)
  }

  @Patch(':id')
  async update(
    @OwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLocaleDto,
  ): Promise<Locale> {
    if (dto.enabled) {
      const current = await this.service.findOne(ownerId, id)
      await this.coverage.assertReady(ownerId, dto.code ?? current.code)
    }
    return this.service.update(ownerId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OwnerId() ownerId: string, @Param('id') id: string): Promise<void> {
    return this.service.remove(ownerId, id)
  }
}
