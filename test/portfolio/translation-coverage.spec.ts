import { UnprocessableEntityException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TranslationCoverageService } from '@/portfolio/locale/translation-coverage.service'
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

const OWNER = '507f1f77bcf86cd799439021'

const LIST_SERVICES = [
  ExperienceService,
  ProjectService,
  SkillCategoryService,
  DegreeService,
  CertificationService,
  SpokenLanguageService,
  VolunteeringService,
  AwardService,
]

const FILLED = {
  title: 'Done',
  headline: 'Done',
  aboutParagraphs: ['Done'],
  subtitles: ['Done'],
  tagline: 'Done',
  role: 'Done',
  bullets: ['Done'],
  badge: 'Done',
  desc: 'Done',
}

function both(): Record<string, unknown> {
  return { en: { ...FILLED }, fr: { ...FILLED } }
}

describe('TranslationCoverageService', () => {
  let service: TranslationCoverageService
  let person: { findOptional: jest.Mock }
  let profile: { findOptional: jest.Mock }
  let experiences: { findAll: jest.Mock }

  async function build(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TranslationCoverageService,
        { provide: PersonService, useValue: person },
        { provide: ProfileService, useValue: profile },
        { provide: ExperienceService, useValue: experiences },
        ...LIST_SERVICES.filter((token) => token !== ExperienceService).map((token) => ({
          provide: token,
          useValue: { findAll: jest.fn().mockResolvedValue([]) },
        })),
      ],
    }).compile()

    service = moduleRef.get(TranslationCoverageService)
  }

  beforeEach(async () => {
    person = { findOptional: jest.fn().mockResolvedValue({ translations: both() }) }
    profile = { findOptional: jest.fn().mockResolvedValue({ translations: both() }) }
    experiences = { findAll: jest.fn().mockResolvedValue([{ translations: both() }]) }
    await build()
  })

  it('accepts a language every document already carries', async () => {
    await expect(service.missingFor(OWNER, 'fr')).resolves.toEqual([])
    await expect(service.assertReady(OWNER, 'fr')).resolves.toBeUndefined()
  })

  it('names the collections that are missing the language', async () => {
    experiences.findAll.mockResolvedValue([{ translations: { en: { title: 'Only English' } } }])

    await expect(service.missingFor(OWNER, 'fr')).resolves.toEqual(['experiences'])
  })

  it('refuses when a single document out of many is untranslated', async () => {
    experiences.findAll.mockResolvedValue([
      { translations: both() },
      { translations: both() },
      { translations: { en: { title: 'Only English' } } },
    ])

    await expect(service.assertReady(OWNER, 'fr')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    )
  })

  it('treats a blank string as untranslated, not as done', async () => {
    experiences.findAll.mockResolvedValue([{ translations: { fr: { title: '   ' } } }])

    await expect(service.missingFor(OWNER, 'fr')).resolves.toContain('experiences')
  })

  it('treats an empty list as untranslated', async () => {
    experiences.findAll.mockResolvedValue([{ translations: { fr: { bullets: [] } } }])

    await expect(service.missingFor(OWNER, 'fr')).resolves.toContain('experiences')
  })

  it('treats an empty translation object as untranslated', async () => {
    experiences.findAll.mockResolvedValue([{ translations: { fr: {} } }])

    await expect(service.missingFor(OWNER, 'fr')).resolves.toContain('experiences')
  })

  it('reads a Mongoose Map the same way as a plain object', async () => {
    experiences.findAll.mockResolvedValue([{ translations: new Map([['fr', { ...FILLED }]]) }])

    await expect(service.missingFor(OWNER, 'fr')).resolves.toEqual([])
  })

  it('ignores a singleton that has not been created yet', async () => {
    person.findOptional.mockResolvedValue(null)

    await expect(service.missingFor(OWNER, 'fr')).resolves.toEqual([])
  })

  it('carries the missing list in the error the console can render', async () => {
    profile.findOptional.mockResolvedValue({ translations: { en: { tagline: 'Only English' } } })
    experiences.findAll.mockResolvedValue([{ translations: { en: { title: 'Only English' } } }])

    try {
      await service.assertReady(OWNER, 'fr')
      throw new Error('should have refused')
    } catch (error) {
      const body = (error as UnprocessableEntityException).getResponse() as {
        details: { missing: string[] }
      }
      expect(body.details.missing).toEqual(['hero & story', 'experiences'])
    }
  })

  it('asks every collection for one owner only', async () => {
    await service.missingFor(OWNER, 'fr')

    expect(person.findOptional).toHaveBeenCalledWith(OWNER)
    expect(experiences.findAll).toHaveBeenCalledWith(OWNER)
  })
})
