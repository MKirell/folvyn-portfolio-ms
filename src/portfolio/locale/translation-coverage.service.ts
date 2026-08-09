import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { PersonService } from '@/portfolio/person/person.service'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { ExperienceService } from '@/portfolio/experience/experience.service'
import { ProjectService } from '@/portfolio/project/project.service'
import { SkillCategoryService } from '@/portfolio/skill/skill-category.service'
import { DegreeService } from '@/portfolio/education/degree.service'
import { CertificationService } from '@/portfolio/education/certification.service'
import { SpokenLanguageService } from '@/portfolio/education/spoken-language.service'
import { VolunteeringService } from '@/portfolio/achievement/volunteering.service'
import { AwardService } from '@/portfolio/achievement/award.service'

type Translated = { translations?: unknown }

interface Source {
  label: string
  read: (ownerId: string) => Promise<Translated[]>
}

function readTranslation(source: unknown, code: string): Record<string, unknown> | null {
  if (source instanceof Map) {
    return (source.get(code) as Record<string, unknown> | undefined) ?? null
  }
  if (source && typeof source === 'object') {
    return (
      ((source as Record<string, unknown>)[code] as Record<string, unknown> | undefined) ?? null
    )
  }
  return null
}

function isFilledValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0 && value.every(isFilledValue)
  if (typeof value === 'number' || typeof value === 'boolean') return true
  return false
}

function isFilled(entry: Record<string, unknown> | null): boolean {
  if (!entry) return false

  const values = Object.values(entry)
  return values.length > 0 && values.every(isFilledValue)
}

@Injectable()
export class TranslationCoverageService {
  private readonly sources: Source[]

  constructor(
    personService: PersonService,
    profileService: ProfileService,
    experienceService: ExperienceService,
    projectService: ProjectService,
    skillCategoryService: SkillCategoryService,
    degreeService: DegreeService,
    certificationService: CertificationService,
    spokenLanguageService: SpokenLanguageService,
    volunteeringService: VolunteeringService,
    awardService: AwardService,
  ) {
    const one = (label: string, read: (ownerId: string) => Promise<Translated | null>): Source => ({
      label,
      read: async (ownerId) => {
        const found = await read(ownerId)
        return found ? [found] : []
      },
    })

    const many = (label: string, read: (ownerId: string) => Promise<Translated[]>): Source => ({
      label,
      read,
    })

    this.sources = [
      one('person', (ownerId) => personService.findOptional(ownerId)),
      one('hero & story', (ownerId) => profileService.findOptional(ownerId)),
      many('experiences', (ownerId) => experienceService.findAll(ownerId)),
      many('projects', (ownerId) => projectService.findAll(ownerId)),
      many('skill categories', (ownerId) => skillCategoryService.findAll(ownerId)),
      many('degrees', (ownerId) => degreeService.findAll(ownerId)),
      many('certifications', (ownerId) => certificationService.findAll(ownerId)),
      many('spoken languages', (ownerId) => spokenLanguageService.findAll(ownerId)),
      many('volunteering', (ownerId) => volunteeringService.findAll(ownerId)),
      many('awards', (ownerId) => awardService.findAll(ownerId)),
    ]
  }

  async missingFor(ownerId: string, code: string): Promise<string[]> {
    const results = await Promise.all(
      this.sources.map(async (source) => {
        const documents = await source.read(ownerId)
        const incomplete = documents.filter(
          (document) => !isFilled(readTranslation(document.translations, code)),
        )
        return incomplete.length > 0 ? source.label : null
      }),
    )

    return results.filter((label): label is string => label !== null)
  }

  async assertReady(ownerId: string, code: string): Promise<void> {
    const missing = await this.missingFor(ownerId, code)
    if (missing.length === 0) return

    throw new UnprocessableEntityException({
      message: `"${code}" is not translated everywhere yet, so visitors cannot be offered it`,
      details: { missing },
    })
  }
}
