import { INestApplication, Type, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'

import { PersonController } from '@/portfolio/person/person.controller'
import { PersonService } from '@/portfolio/person/person.service'
import { LocaleController } from '@/portfolio/locale/locale.controller'
import { LocaleService } from '@/portfolio/locale/locale.service'
import { TranslationCoverageService } from '@/portfolio/locale/translation-coverage.service'
import { ProfileController } from '@/portfolio/profile/profile.controller'
import { ProfileService } from '@/portfolio/profile/profile.service'
import { ExperienceController } from '@/portfolio/experience/experience.controller'
import { ExperienceService } from '@/portfolio/experience/experience.service'
import { ProjectController } from '@/portfolio/project/project.controller'
import { ProjectService } from '@/portfolio/project/project.service'
import { SkillCategoryController } from '@/portfolio/skill/skill-category.controller'
import { SkillCategoryService } from '@/portfolio/skill/skill-category.service'
import { DegreeController } from '@/portfolio/education/degree.controller'
import { DegreeService } from '@/portfolio/education/degree.service'
import { CertificationController } from '@/portfolio/education/certification.controller'
import { CertificationService } from '@/portfolio/education/certification.service'
import { SpokenLanguageController } from '@/portfolio/education/spoken-language.controller'
import { SpokenLanguageService } from '@/portfolio/education/spoken-language.service'
import { VolunteeringController } from '@/portfolio/achievement/volunteering.controller'
import { VolunteeringService } from '@/portfolio/achievement/volunteering.service'
import { AwardController } from '@/portfolio/achievement/award.controller'
import { AwardService } from '@/portfolio/achievement/award.service'

const ID = '507f1f77bcf86cd799439011'
const OWNER = '507f1f77bcf86cd799439021'

function crudStub() {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: ID }),
    create: jest.fn().mockImplementation((dto: unknown) => Promise.resolve(dto)),
    update: jest.fn().mockResolvedValue({ id: ID }),
    remove: jest.fn().mockResolvedValue(undefined),
    reorder: jest.fn().mockResolvedValue([]),
  }
}

interface EntityCase {
  name: string
  route: string
  token: Type<unknown>
  valid: Record<string, unknown>
  invalid: Record<string, unknown>
}

const cases: EntityCase[] = [
  {
    name: 'experiences',
    route: 'experiences',
    token: ExperienceService,
    valid: {
      company: 'Crédit Agricole',
      startDate: '2025-09',
      country: 'FR',
      tags: ['LangGraph'],
      link: 'https://www.linkedin.com/company/ca/',
      translations: { en: { role: 'Engineer', bullets: ['Did work'] } },
    },
    invalid: { company: 'Acme', startDate: 'September 2025' },
  },
  {
    name: 'projects',
    route: 'projects',
    token: ProjectService,
    valid: {
      title: 'CVision',
      tags: ['RAG'],
      translations: { en: { period: '2025', badge: 'Hybrid RAG', desc: 'A thing' } },
    },
    invalid: { title: 'CVision', translations: { en: { period: '2025' } } },
  },
  {
    name: 'skill categories',
    route: 'skill-categories',
    token: SkillCategoryService,
    valid: {
      icon: 'Bot',
      tags: ['LangChain'],
      translations: { en: { title: 'Generative AI' } },
    },
    invalid: { icon: 'Bot' },
  },
  {
    name: 'degrees',
    route: 'degrees',
    token: DegreeService,
    valid: {
      years: '2024 — 2027',
      translations: { en: { title: 'Engineering Degree', school: 'Sup Galilée' } },
    },
    invalid: { years: '2024 — 2027' },
  },
  {
    name: 'certifications',
    route: 'certifications',
    token: CertificationService,
    valid: {
      icon: 'Award',
      title: 'Build Multimodal GenAI',
      issuer: 'IBM',
      translations: { en: { date: 'Mar 2025' } },
    },
    invalid: { icon: 'Award', title: 'X', issuer: 'IBM' },
  },
  {
    name: 'spoken languages',
    route: 'spoken-languages',
    token: SpokenLanguageService,
    valid: {
      flagCode: 'gb',
      pct: 80,
      translations: { en: { name: 'English', level: 'B2' } },
    },
    invalid: {
      flagCode: 'gb',
      pct: 140,
      translations: { en: { name: 'English', level: 'B2' } },
    },
  },
  {
    name: 'volunteering',
    route: 'volunteering',
    token: VolunteeringService,
    valid: {
      org: 'Enactus',
      translations: { en: { role: 'Member', period: '2023', desc: 'Helped out' } },
    },
    invalid: { org: 'Enactus', translations: {} },
  },
  {
    name: 'awards',
    route: 'awards',
    token: AwardService,
    valid: {
      icon: 'Trophy',
      flagCode: 'nl',
      images: ['a.jpg'],
      translations: { en: { title: 'Vice Champions', place: 'Netherlands' } },
    },
    invalid: { icon: 'Trophy', flagCode: 'NETHERLANDS', translations: { en: { title: 'X' } } },
  },
]

describe('admin controllers', () => {
  let app: INestApplication
  const services = new Map<Type<unknown>, ReturnType<typeof crudStub>>()
  let personService: { find: jest.Mock; upsert: jest.Mock; update: jest.Mock }
  let profileService: { find: jest.Mock; upsert: jest.Mock; update: jest.Mock }

  beforeAll(async () => {
    for (const entity of cases) services.set(entity.token, crudStub())
    const localeStub = crudStub()

    personService = {
      find: jest.fn().mockResolvedValue({ givenName: 'Owner' }),
      upsert: jest.fn().mockImplementation((dto: unknown) => Promise.resolve(dto)),
      update: jest.fn().mockResolvedValue({ givenName: 'Owner' }),
    }
    profileService = {
      find: jest.fn().mockResolvedValue({ highlightFocus: ['RAG'] }),
      upsert: jest.fn().mockImplementation((dto: unknown) => Promise.resolve(dto)),
      update: jest.fn().mockResolvedValue({ highlightFocus: ['RAG'] }),
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [
        PersonController,
        LocaleController,
        ProfileController,
        ExperienceController,
        ProjectController,
        SkillCategoryController,
        DegreeController,
        CertificationController,
        SpokenLanguageController,
        VolunteeringController,
        AwardController,
      ],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(false) } },
        { provide: PersonService, useValue: personService },
        { provide: ProfileService, useValue: profileService },
        { provide: LocaleService, useValue: localeStub },
        {
          provide: TranslationCoverageService,
          useValue: { assertReady: jest.fn().mockResolvedValue(undefined) },
        },
        ...cases.map((entity) => ({
          provide: entity.token,
          useValue: services.get(entity.token),
        })),
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.use((request: Record<string, unknown>, _response: unknown, next: () => void) => {
      request.owner = { id: OWNER }
      next()
    })
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        transform: true,
      }),
    )
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe.each(cases)('$name', (entity) => {
    const base = `/admin/${entity.route}`

    it('lists entries', async () => {
      await request(app.getHttpServer()).get(base).expect(200)
      expect(services.get(entity.token)?.findAll).toHaveBeenCalled()
    })

    it('reads one entry', async () => {
      await request(app.getHttpServer()).get(`${base}/${ID}`).expect(200)
      expect(services.get(entity.token)?.findOne).toHaveBeenCalledWith(OWNER, ID)
    })

    it('creates from a valid payload', async () => {
      await request(app.getHttpServer()).post(base).send(entity.valid).expect(201)
      expect(services.get(entity.token)?.create).toHaveBeenCalled()
    })

    it('rejects an invalid payload before reaching the service', async () => {
      const service = services.get(entity.token)
      const before = service?.create.mock.calls.length ?? 0

      await request(app.getHttpServer()).post(base).send(entity.invalid).expect(400)

      expect(service?.create.mock.calls.length).toBe(before)
    })

    it('rejects unknown properties', async () => {
      await request(app.getHttpServer())
        .post(base)
        .send({ ...entity.valid, injected: 'value' })
        .expect(400)
    })

    it('rejects a translation keyed by something that is not a language code', async () => {
      await request(app.getHttpServer())
        .post(base)
        .send({
          ...entity.valid,
          translations: { EN_US: Object.values(entity.valid.translations as object)[0] },
        })
        .expect(400)
    })

    it('rejects an empty translation map', async () => {
      await request(app.getHttpServer())
        .post(base)
        .send({ ...entity.valid, translations: {} })
        .expect(400)
    })

    it('updates an entry', async () => {
      await request(app.getHttpServer()).patch(`${base}/${ID}`).send({}).expect(200)
      expect(services.get(entity.token)?.update).toHaveBeenCalled()
    })

    it('deletes an entry with no content', async () => {
      await request(app.getHttpServer()).delete(`${base}/${ID}`).expect(204)
      expect(services.get(entity.token)?.remove).toHaveBeenCalledWith(OWNER, ID)
    })

    it('reorders entries', async () => {
      await request(app.getHttpServer())
        .patch(`${base}/reorder`)
        .send({ entries: [{ id: ID, order: 0 }] })
        .expect(200)
      expect(services.get(entity.token)?.reorder).toHaveBeenCalled()
    })

    it('rejects a reorder batch with a non-mongo id', async () => {
      await request(app.getHttpServer())
        .patch(`${base}/reorder`)
        .send({ entries: [{ id: 'nope', order: 0 }] })
        .expect(400)
    })

    it('rejects a reorder batch with a negative order', async () => {
      await request(app.getHttpServer())
        .patch(`${base}/reorder`)
        .send({ entries: [{ id: ID, order: -1 }] })
        .expect(400)
    })
  })

  describe('person', () => {
    const valid = {
      givenName: 'Mohamed Khalil',
      familyName: 'ZRELLY',
      email: 'owner@example.com',
      phone: '+33758215856',
      linkedin: 'https://www.linkedin.com/in/x/',
      github: 'https://github.com/MKirell',
      affiliation: 'Crédit Agricole',
      city: 'Paris',
      country: 'FR',
      photo: 'off-image.jpeg',
      resumes: { en: 'resume_en.pdf' },
      translations: {
        en: {
          headline: 'Engineer',
          aboutParagraphs: ['A paragraph'],
          contactDesc: 'Say hello',
        },
      },
    }

    it('accepts three about paragraphs and refuses a fourth', async () => {
      const paragraphs = ['One', 'Two', 'Three']
      const body = (list: string[]) => ({
        ...valid,
        translations: { en: { ...valid.translations.en, aboutParagraphs: list } },
      })

      await request(app.getHttpServer()).put('/admin/person').send(body(paragraphs)).expect(200)
      await request(app.getHttpServer())
        .put('/admin/person')
        .send(body([...paragraphs, 'Four']))
        .expect(400)
    })

    it('reads the profile', async () => {
      await request(app.getHttpServer()).get('/admin/person').expect(200)
      expect(personService.find).toHaveBeenCalled()
    })

    it('replaces the profile', async () => {
      await request(app.getHttpServer()).put('/admin/person').send(valid).expect(200)
      expect(personService.upsert).toHaveBeenCalled()
    })

    it('patches the profile', async () => {
      await request(app.getHttpServer())
        .patch('/admin/person')
        .send({ affiliation: 'MKirell' })
        .expect(200)
      expect(personService.update).toHaveBeenCalled()
    })

    it('rejects a malformed professional email', async () => {
      await request(app.getHttpServer())
        .put('/admin/person')
        .send({ ...valid, email: 'not-an-email' })
        .expect(400)
    })

    it('stores the contact address under the calling owner', async () => {
      await request(app.getHttpServer()).put('/admin/person').send(valid).expect(200)

      const [owner, body] = personService.upsert.mock.calls.at(-1) as [
        string,
        Record<string, unknown>,
      ]

      expect(owner).toBe(OWNER)
      expect(body.email).toBe('owner@example.com')
    })

    it('rejects a phone that is not E.164', async () => {
      await request(app.getHttpServer())
        .put('/admin/person')
        .send({ ...valid, phone: '07 58 21 58 56' })
        .expect(400)
    })

    it('rejects a non-https profile url', async () => {
      await request(app.getHttpServer())
        .put('/admin/person')
        .send({ ...valid, github: 'http://github.com/MKirell' })
        .expect(400)
    })

    it('rejects a country code that is not two uppercase letters', async () => {
      await request(app.getHttpServer())
        .put('/admin/person')
        .send({ ...valid, country: 'France' })
        .expect(400)
    })
  })

  describe('profile', () => {
    const valid = {
      highlights: ['LangGraph', 'RAG'],
      highlightFocus: ['RAG'],
      translations: {
        en: {
          subtitles: ['Generative AI Engineer'],
          tagline: 'Building agents that reason',
        },
      },
    }

    it('reads the narrative', async () => {
      await request(app.getHttpServer()).get('/admin/profile').expect(200)
      expect(profileService.find).toHaveBeenCalled()
    })

    it('accepts four subtitles and refuses a fifth', async () => {
      const subtitles = ['One', 'Two', 'Three', 'Four']
      const body = (list: string[]) => ({
        ...valid,
        translations: { en: { ...valid.translations.en, subtitles: list } },
      })

      await request(app.getHttpServer()).put('/admin/profile').send(body(subtitles)).expect(200)
      await request(app.getHttpServer())
        .put('/admin/profile')
        .send(body([...subtitles, 'Five']))
        .expect(400)
    })

    it('replaces the narrative', async () => {
      await request(app.getHttpServer()).put('/admin/profile').send(valid).expect(200)
      expect(profileService.upsert).toHaveBeenCalled()
    })

    it('patches the narrative', async () => {
      await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ highlightFocus: ['RAG'] })
        .expect(200)
      expect(profileService.update).toHaveBeenCalled()
    })

    it('rejects a translation keyed by something that is not a language', async () => {
      await request(app.getHttpServer())
        .put('/admin/profile')
        .send({ ...valid, translations: { english: valid.translations.en } })
        .expect(400)
    })

    it('rejects generic interface copy that no longer belongs to the database', async () => {
      await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ nav: { about: 'About' } })
        .expect(400)
    })
  })
})
