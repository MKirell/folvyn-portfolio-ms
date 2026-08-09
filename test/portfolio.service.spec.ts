import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { PortfolioService } from '@/portfolio/portfolio.service'
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

const person = {
  _id: 'person-id',
  givenName: 'Mohamed Khalil',
  familyName: 'ZRELLY',
  resumes: { en: 'resume_en.pdf', fr: 'resume_fr.pdf' },
  createdAt: new Date(),
  updatedAt: new Date(),
  translations: {
    en: { headline: 'Generative AI Engineer Apprentice', description: 'English bio' },
    fr: { headline: 'Apprenti Ingénieur IA Générative', description: 'Bio française' },
  },
}

const profile = {
  _id: 'profile-id',
  highlights: ['LangGraph', 'RAG'],
  highlightFocus: 'RAG',
  translations: {
    en: {
      subtitles: ['Generative AI Engineer'],
      tagline: 'English tagline',
      aboutParagraphs: ['First paragraph', 'Second paragraph'],
      contactDesc: 'Get in touch',
    },
    fr: {
      subtitles: ['Ingénieur IA Générative'],
      tagline: 'Accroche française',
      aboutParagraphs: ['Premier paragraphe'],
      contactDesc: 'Écrivez-moi',
    },
  },
}

const experiences = [
  {
    _id: 'exp-1',
    order: 0,
    current: true,
    startDate: '2025-09',
    endDate: null,
    country: 'FR',
    company: 'Crédit Agricole',
    tags: ['LangGraph'],
    doc: null,
    link: 'https://linkedin.com/company/ca',
    translations: {
      en: { role: 'GenAI Engineer', bullets: ['Built things'] },
      fr: { role: 'Ingénieur IA', bullets: ['Développé'] },
    },
  },
]

const awards = [
  {
    _id: 'award-1',
    order: 0,
    icon: 'Trophy',
    flagCode: 'nl',
    images: ['a.jpg'],
    doc: null,
    translations: {
      en: { title: 'Vice Champions', place: 'Netherlands', date: 'Oct 2023' },
      fr: { title: 'Vice-Champions', place: 'Pays-Bas', date: 'Oct. 2023' },
    },
  },
]

const OWNER = '507f1f77bcf86cd799439021'

function listStub(items: unknown[]) {
  return { findAll: jest.fn().mockResolvedValue(items) }
}

describe('PortfolioService', () => {
  let service: PortfolioService
  let localeService: { findEnabled: jest.Mock }
  let personService: { find: jest.Mock }
  let profileService: { find: jest.Mock }
  let experienceService: { findAll: jest.Mock }
  let awardService: { findAll: jest.Mock }

  beforeEach(async () => {
    personService = { find: jest.fn().mockResolvedValue(person) }
    profileService = { find: jest.fn().mockResolvedValue(profile) }
    experienceService = listStub(experiences)
    awardService = listStub(awards)
    localeService = {
      findEnabled: jest.fn().mockResolvedValue([
        { code: 'en', label: 'EN', flagCode: 'gb' },
        { code: 'fr', label: 'FR', flagCode: 'fr' },
      ]),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('en') } },
        { provide: LocaleService, useValue: localeService },
        { provide: PersonService, useValue: personService },
        { provide: ProfileService, useValue: profileService },
        { provide: ExperienceService, useValue: experienceService },
        { provide: ProjectService, useValue: listStub([]) },
        { provide: SkillCategoryService, useValue: listStub([]) },
        { provide: DegreeService, useValue: listStub([]) },
        { provide: CertificationService, useValue: listStub([]) },
        { provide: SpokenLanguageService, useValue: listStub([]) },
        { provide: VolunteeringService, useValue: listStub([]) },
        { provide: AwardService, useValue: awardService },
      ],
    }).compile()

    service = moduleRef.get(PortfolioService)
  })

  it('flattens the requested translation onto each entity', async () => {
    const result = await service.resolve(OWNER, 'fr')

    expect(result.lang).toBe('fr')
    expect(result.experiences[0]).toMatchObject({
      company: 'Crédit Agricole',
      role: 'Ingénieur IA',
      startDate: '2025-09',
      current: true,
    })
    expect(result.achievements.awards[0]).toMatchObject({
      icon: 'Trophy',
      title: 'Vice-Champions',
      place: 'Pays-Bas',
    })
  })

  it('never leaks the raw translation map to consumers', async () => {
    const result = await service.resolve(OWNER, 'en')

    expect(result.experiences[0]).not.toHaveProperty('translations')
    expect(result.person).not.toHaveProperty('translations')
    expect(result.achievements.awards[0]).not.toHaveProperty('translations')
  })

  it('strips mongo bookkeeping and exposes a plain id', async () => {
    const result = await service.resolve(OWNER, 'en')

    expect(result.experiences[0].id).toBe('exp-1')
    expect(result.experiences[0]).not.toHaveProperty('_id')
    expect(result.person).not.toHaveProperty('createdAt')
    expect(result.person).not.toHaveProperty('updatedAt')
    expect(result.person).not.toHaveProperty('key')
  })

  it('resolves the resume for the requested language', async () => {
    await expect(service.resolve(OWNER, 'fr')).resolves.toMatchObject({
      person: { resume: 'resume_fr.pdf' },
    })
    await expect(service.resolve(OWNER, 'en')).resolves.toMatchObject({
      person: { resume: 'resume_en.pdf' },
    })
  })

  it('flattens the profile narrative for the requested language', async () => {
    const result = await service.resolve(OWNER, 'en')

    expect(result.profile.aboutParagraphs).toEqual(['First paragraph', 'Second paragraph'])
    expect(result.profile.tagline).toBe('English tagline')
    expect(result.profile.highlightFocus).toBe('RAG')
    expect(result.profile).not.toHaveProperty('translations')
  })

  it('carries no generic interface copy in the payload', async () => {
    const result = await service.resolve(OWNER, 'en')

    expect(result).not.toHaveProperty('ui')
    expect(result).not.toHaveProperty('about')
  })

  it('falls back to the configured default language when none is requested', async () => {
    const result = await service.resolve(OWNER)

    expect(result.lang).toBe('en')
  })

  it('rejects a language that is not enabled', async () => {
    await expect(service.resolve(OWNER, 'de')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('reports every enabled language alongside the payload', async () => {
    const result = await service.resolve(OWNER, 'en')

    expect(result.availableLangs).toEqual([
      { code: 'en', label: 'EN', flagCode: 'gb' },
      { code: 'fr', label: 'FR', flagCode: 'fr' },
    ])
  })

  it('fails clearly when no language has been configured', async () => {
    localeService.findEnabled.mockResolvedValue([])

    await expect(service.resolve(OWNER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('asks every collection for one owner and no other', async () => {
    await service.resolve(OWNER, 'en')

    expect(localeService.findEnabled).toHaveBeenCalledWith(OWNER)
    expect(personService.find).toHaveBeenCalledWith(OWNER)
    expect(profileService.find).toHaveBeenCalledWith(OWNER)
    expect(experienceService.findAll).toHaveBeenCalledWith(OWNER)
    expect(awardService.findAll).toHaveBeenCalledWith(OWNER)
  })

  it('never leaks the owner id into the public payload', async () => {
    experienceService.findAll.mockResolvedValue([{ ...experiences[0], ownerId: OWNER }])

    const result = await service.resolve(OWNER, 'en')

    expect(result.person).not.toHaveProperty('ownerId')
    expect(result.profile).not.toHaveProperty('ownerId')
    expect(result.experiences[0]).not.toHaveProperty('ownerId')
  })
})
