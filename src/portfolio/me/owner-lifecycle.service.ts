import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common'
import { OwnerService } from '@/owner/owner.service'
import { IdentityDirectory } from '@/auth/identity.directory'
import { AnalyticsService } from '@/analytics/analytics.service'
import { UploadsService } from '@/uploads/uploads.service'
import { PersonService } from '@/portfolio/person/person.service'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { ExperienceService } from '@/portfolio/experience/experience.service'
import { ProjectService } from '@/portfolio/project/project.service'
import { SkillCategoryService } from '@/portfolio/skill/skill-category.service'
import { DegreeService } from '@/portfolio/education/degree.service'
import { CertificationService } from '@/portfolio/education/certification.service'
import { SpokenLanguageService } from '@/portfolio/education/spoken-language.service'
import { VolunteeringService } from '@/portfolio/achievement/volunteering.service'
import { AwardService } from '@/portfolio/achievement/award.service'
import type { OwnerRecord } from '@/owner/owner.service'

export interface OwnerExport {
  exportedAt: string
  owner: OwnerRecord
  person: unknown
  profile: unknown
  locales: unknown[]
  experiences: unknown[]
  projects: unknown[]
  skillCategories: unknown[]
  degrees: unknown[]
  certifications: unknown[]
  spokenLanguages: unknown[]
  volunteering: unknown[]
  awards: unknown[]
}

@Injectable()
export class OwnerLifecycleService {
  private readonly logger = new Logger(OwnerLifecycleService.name)

  constructor(
    private readonly owners: OwnerService,
    private readonly identities: IdentityDirectory,
    private readonly analytics: AnalyticsService,
    private readonly uploads: UploadsService,
    private readonly personService: PersonService,
    private readonly profileService: ProfileService,
    private readonly localeService: LocaleService,
    private readonly experienceService: ExperienceService,
    private readonly projectService: ProjectService,
    private readonly skillCategoryService: SkillCategoryService,
    private readonly degreeService: DegreeService,
    private readonly certificationService: CertificationService,
    private readonly spokenLanguageService: SpokenLanguageService,
    private readonly volunteeringService: VolunteeringService,
    private readonly awardService: AwardService,
  ) {}

  async publish(ownerId: string): Promise<OwnerRecord> {
    const missing = await this.completenessProblems(ownerId)
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        message: 'This portfolio is not ready to be published',
        details: { missing },
      })
    }
    return this.owners.publish(ownerId)
  }

  async exportAll(ownerId: string): Promise<OwnerExport> {
    const [
      owner,
      person,
      profile,
      locales,
      experiences,
      projects,
      skillCategories,
      degrees,
      certifications,
      spokenLanguages,
      volunteering,
      awards,
    ] = await Promise.all([
      this.owners.findById(ownerId),
      this.personService.findOptional(ownerId),
      this.profileService.findOptional(ownerId),
      this.localeService.findAll(ownerId),
      this.experienceService.findAll(ownerId),
      this.projectService.findAll(ownerId),
      this.skillCategoryService.findAll(ownerId),
      this.degreeService.findAll(ownerId),
      this.certificationService.findAll(ownerId),
      this.spokenLanguageService.findAll(ownerId),
      this.volunteeringService.findAll(ownerId),
      this.awardService.findAll(ownerId),
    ])

    return {
      exportedAt: new Date().toISOString(),
      owner,
      person,
      profile,
      locales,
      experiences,
      projects,
      skillCategories,
      degrees,
      certifications,
      spokenLanguages,
      volunteering,
      awards,
    }
  }

  async erase(ownerId: string): Promise<void> {
    const owner = await this.owners.findById(ownerId)

    await Promise.all([
      this.personService.removeAllOwnedBy(ownerId),
      this.profileService.removeAllOwnedBy(ownerId),
      this.localeService.removeAllOwnedBy(ownerId),
      this.experienceService.removeAllOwnedBy(ownerId),
      this.projectService.removeAllOwnedBy(ownerId),
      this.skillCategoryService.removeAllOwnedBy(ownerId),
      this.degreeService.removeAllOwnedBy(ownerId),
      this.certificationService.removeAllOwnedBy(ownerId),
      this.spokenLanguageService.removeAllOwnedBy(ownerId),
      this.volunteeringService.removeAllOwnedBy(ownerId),
      this.awardService.removeAllOwnedBy(ownerId),
    ])

    await this.analytics.removeAllOwnedBy(ownerId)
    await this.uploads.removeAllOwnedBy(ownerId)
    await this.identities.remove(owner.sub)

    await this.owners.remove(ownerId)
    this.logger.log(`Erased every store for ${owner.slug}`)
  }

  private said(source: unknown, lang: string): Record<string, unknown> {
    if (source instanceof Map) {
      return (source.get(lang) as Record<string, unknown> | undefined) ?? {}
    }
    if (source && typeof source === 'object') {
      const record = source as Record<string, unknown>
      return (record[lang] as Record<string, unknown> | undefined) ?? {}
    }
    return {}
  }

  private async completenessProblems(ownerId: string): Promise<string[]> {
    const [person, profile, locales, ...body] = await Promise.all([
      this.personService.findOptional(ownerId),
      this.profileService.findOptional(ownerId),
      this.localeService.findEnabled(ownerId),
      this.experienceService.findAll(ownerId),
      this.projectService.findAll(ownerId),
      this.degreeService.findAll(ownerId),
      this.certificationService.findAll(ownerId),
      this.skillCategoryService.findAll(ownerId),
      this.volunteeringService.findAll(ownerId),
      this.awardService.findAll(ownerId),
    ])

    const missing: string[] = []
    if (!person) missing.push('person')
    if (!profile) missing.push('profile')
    if (locales.length === 0) missing.push('locale')
    if (body.every((entries) => entries.length === 0)) missing.push('section')

    const first = locales[0]?.code
    if (first) {
      const introduces = this.said(person?.translations, first)
      const greets = this.said(profile?.translations, first)

      if (person && !(person.givenName && person.familyName && introduces.headline)) {
        missing.push('person-translation')
      }
      if (profile && !greets.tagline) missing.push('profile-translation')
    }

    return missing
  }
}
