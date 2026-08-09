import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Public } from '@/common/decorators/public.decorator'
import { PortfolioService } from '@/portfolio/portfolio.service'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { OwnerService } from '@/owner/owner.service'
import { LangQueryDto } from '@/portfolio/portfolio.dto'
import { SlugParamDto } from '@/owner/owner.dto'
import type { LocaleSummary, ResolvedPortfolio } from '@/common/types/portfolio.types'

export interface PortfolioMeta {
  slug: string
  published: boolean
  publishedAt: string | null
}

@Public()
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly config: ConfigService,
    private readonly portfolioService: PortfolioService,
    private readonly localeService: LocaleService,
    private readonly owners: OwnerService,
  ) {}

  @Get()
  async findDefault(@Query() query: LangQueryDto): Promise<ResolvedPortfolio> {
    const owner = await this.defaultOwner()
    return this.portfolioService.resolve(owner.id, query.lang, owner.slug, owner.consentMode)
  }

  @Get('languages')
  async defaultLanguages(): Promise<LocaleSummary[]> {
    return this.localeService.findEnabled((await this.defaultOwner()).id)
  }

  @Get(':slug')
  async findBySlug(
    @Param() params: SlugParamDto,
    @Query() query: LangQueryDto,
  ): Promise<ResolvedPortfolio> {
    const owner = await this.owners.findPublishedBySlug(params.slug)
    return this.portfolioService.resolve(owner.id, query.lang, owner.slug, owner.consentMode)
  }

  @Get(':slug/languages')
  async languages(@Param() params: SlugParamDto): Promise<LocaleSummary[]> {
    const owner = await this.owners.findPublishedBySlug(params.slug)
    return this.localeService.findEnabled(owner.id)
  }

  @Get(':slug/meta')
  async meta(@Param() params: SlugParamDto): Promise<PortfolioMeta> {
    const owner = await this.owners.findPublishedBySlug(params.slug)
    return {
      slug: owner.slug,
      published: owner.status === 'published',
      publishedAt: owner.publishedAt ? new Date(owner.publishedAt).toISOString() : null,
    }
  }

  private async defaultOwner() {
    const slug = this.config.get<string>('app.defaultSlug')
    if (!slug) {
      throw new NotFoundException(
        'This deployment serves portfolios by address, as /portfolio/:slug',
      )
    }
    return this.owners.findPublishedBySlug(slug)
  }
}
