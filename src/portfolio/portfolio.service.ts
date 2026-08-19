import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PersonService } from '@/portfolio/person/person.service'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { ExperienceService } from '@/portfolio/experience/experience.service'
import { ProjectService } from '@/portfolio/project/project.service'
import { SkillCategoryService } from '@/portfolio/skill/skill-category.service'
import { DegreeService } from '@/portfolio/education/degree.service'
import { CertificationService } from '@/portfolio/education/certification.service'
import { SpokenLanguageService } from '@/portfolio/education/spoken-language.service'
import { VolunteeringService } from '@/portfolio/achievement/volunteering.service'
import { AwardService } from '@/portfolio/achievement/award.service'
import { assetPrefixFor } from '@/uploads/asset-prefix'
import type { LocaleSummary, ResolvedPortfolio } from '@/common/types/portfolio.types'

export const PORTFOLIO_PREFIX = 'fol'

type TranslationSource = Record<string, unknown> & {
  translations?: unknown
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly config: ConfigService,
    private readonly localeService: LocaleService,
    private readonly personService: PersonService,
    private readonly profileService: ProfileService,
    private readonly experienceService: ExperienceService,
    private readonly projectService: ProjectService,
    private readonly skillCategoryService: SkillCategoryService,
    private readonly degreeService: DegreeService,
    private readonly certificationService: CertificationService,
    private readonly spokenLanguageService: SpokenLanguageService,
    private readonly volunteeringService: VolunteeringService,
    private readonly awardService: AwardService,
  ) {}

  async resolve(
    ownerId: string,
    requestedLang?: string,
    slug?: string,
    consentMode = 'measurement',
  ): Promise<ResolvedPortfolio> {
    const assetPrefix = this.assetPrefix(ownerId)
    const availableLangs = await this.localeService.findEnabled(ownerId)
    if (availableLangs.length === 0) {
      throw new NotFoundException('No language has been configured yet')
    }

    const lang = this.pickLang(requestedLang, availableLangs)

    const [
      person,
      profile,
      experiences,
      projects,
      skillCategories,
      degrees,
      certifications,
      spokenLanguages,
      volunteering,
      awards,
    ] = await Promise.all([
      this.personService.find(ownerId),
      this.profileService.find(ownerId),
      this.experienceService.findAll(ownerId),
      this.projectService.findAll(ownerId),
      this.skillCategoryService.findAll(ownerId),
      this.degreeService.findAll(ownerId),
      this.certificationService.findAll(ownerId),
      this.spokenLanguageService.findAll(ownerId),
      this.volunteeringService.findAll(ownerId),
      this.awardService.findAll(ownerId),
    ])

    const resolvedPerson = this.flatten(person as unknown as TranslationSource, lang)
    const resolvedProfile = this.flatten(profile as unknown as TranslationSource, lang)
    delete resolvedProfile.id

    return {
      lang,
      consentMode,
      availableLangs,
      assetPrefix,
      person: {
        ...resolvedPerson,
        url: this.publicUrl(slug),
        resume: this.pickFromMap(person as unknown as TranslationSource, 'resumes', lang),
      },
      profile: resolvedProfile,
      experiences: this.flattenAll(experiences as unknown as TranslationSource[], lang),
      projects: this.flattenAll(projects as unknown as TranslationSource[], lang),
      skillCategories: this.flattenAll(skillCategories as unknown as TranslationSource[], lang),
      education: {
        degrees: this.flattenAll(degrees as unknown as TranslationSource[], lang),
        certifications: this.flattenAll(certifications as unknown as TranslationSource[], lang),
        spokenLanguages: this.flattenAll(spokenLanguages as unknown as TranslationSource[], lang),
      },
      achievements: {
        volunteering: this.flattenAll(volunteering as unknown as TranslationSource[], lang),
        awards: this.flattenAll(awards as unknown as TranslationSource[], lang),
      },
    }
  }

  private publicUrl(slug: string | undefined): string {
    const site = this.config.get<string>('app.siteUrl') ?? ''
    return slug ? `${site}/${PORTFOLIO_PREFIX}/${slug}` : site
  }

  private assetPrefix(ownerId: string): string {
    return assetPrefixFor(this.config.get<string>('assets.bucket'), ownerId)
  }

  private pickLang(requested: string | undefined, available: LocaleSummary[]): string {
    const codes = available.map((locale) => locale.code)
    if (requested && codes.includes(requested)) return requested
    if (requested) throw new NotFoundException(`Language "${requested}" is not available`)

    const fallback = this.config.get<string>('app.defaultLang')
    return fallback && codes.includes(fallback) ? fallback : codes[0]
  }

  private flattenAll(items: TranslationSource[], lang: string): Record<string, unknown>[] {
    return items.map((item) => this.flatten(item, lang))
  }

  private flatten(item: TranslationSource, lang: string): Record<string, unknown> {
    const base = this.stripInternals(item)
    delete base.translations
    const translation = this.readTranslation(item.translations, lang)
    return { ...base, ...translation }
  }

  private readTranslation(source: unknown, lang: string): Record<string, unknown> {
    if (source instanceof Map) {
      return (source.get(lang) as Record<string, unknown> | undefined) ?? {}
    }
    if (source && typeof source === 'object') {
      const record = source as Record<string, unknown>
      return (record[lang] as Record<string, unknown> | undefined) ?? {}
    }
    return {}
  }

  private pickFromMap(item: TranslationSource, field: string, lang: string): string | null {
    const source = item[field]
    if (source instanceof Map) return (source.get(lang) as string | undefined) ?? null
    if (source && typeof source === 'object') {
      return (source as Record<string, string>)[lang] ?? null
    }
    return null
  }

  private stripInternals(item: TranslationSource): Record<string, unknown> {
    const clone: Record<string, unknown> = { ...item }
    const id = clone._id
    if (id !== undefined && id !== null) {
      clone.id = typeof id === 'string' ? id : (id as { toString(): string }).toString()
      delete clone._id
    }
    delete clone.__v
    delete clone.createdAt
    delete clone.updatedAt
    delete clone.ownerId
    return clone
  }
}
