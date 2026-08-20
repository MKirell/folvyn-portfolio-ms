import { Controller, Get, Param, Query } from '@nestjs/common'
import { Public } from '@/common/decorators/public.decorator'
import { PortfolioService } from '@/portfolio/portfolio.service'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { OwnerService } from '@/owner/owner.service'
import { LangQueryDto } from '@/portfolio/portfolio.dto'
import { SlugParamDto } from '@/owner/owner.dto'
import type { LocaleSummary, ResolvedPortfolio } from '@/common/types/portfolio.types'

export interface PublishedPortfolio {
  slug: string
  langs: string[]
  updatedAt: string | null
}

export interface PortfolioMeta {
  slug: string
  published: boolean
  publishedAt: string | null
}

@Public()
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly localeService: LocaleService,
    private readonly owners: OwnerService,
  ) {}

  @Get('published')
  async published(): Promise<PublishedPortfolio[]> {
    const owners = await this.owners.findPublished()

    return Promise.all(
      owners.map(async (owner) => ({
        slug: owner.slug,
        langs: (await this.localeService.findEnabled(owner.id)).map((locale) => locale.code),
        updatedAt: owner.updatedAt ? new Date(owner.updatedAt).toISOString() : null,
      })),
    )
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
}
