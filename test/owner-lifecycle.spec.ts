import { UnprocessableEntityException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { OwnerLifecycleService } from '@/portfolio/me/owner-lifecycle.service'
import { OwnerService } from '@/owner/owner.service'
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
import { IdentityDirectory } from '@/auth/identity.directory'
import { AnalyticsService } from '@/analytics/analytics.service'
import { UploadsService } from '@/uploads/uploads.service'

const OWNER = '507f1f77bcf86cd799439021'

const CONTENT_SERVICES = [
  ExperienceService,
  ProjectService,
  SkillCategoryService,
  DegreeService,
  CertificationService,
  SpokenLanguageService,
  VolunteeringService,
  AwardService,
]

function listStub() {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findEnabled: jest.fn().mockResolvedValue([{ code: 'en' }]),
    removeAllOwnedBy: jest.fn().mockResolvedValue(0),
  }
}

describe('OwnerLifecycleService', () => {
  let service: OwnerLifecycleService
  let owners: { findById: jest.Mock; publish: jest.Mock; remove: jest.Mock }
  let personService: ReturnType<typeof listStub> & { findOptional: jest.Mock }
  let profileService: ReturnType<typeof listStub> & { findOptional: jest.Mock }
  let localeService: ReturnType<typeof listStub>
  let content: Map<unknown, ReturnType<typeof listStub>>
  let identities: { remove: jest.Mock }
  let analytics: { removeAllOwnedBy: jest.Mock }
  let uploads: { removeAllOwnedBy: jest.Mock }

  beforeEach(async () => {
    owners = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: OWNER, sub: 'cognito-sub', slug: 'someone', status: 'draft' }),
      publish: jest.fn().mockResolvedValue({ id: OWNER, status: 'published' }),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    identities = { remove: jest.fn().mockResolvedValue(true) }
    analytics = { removeAllOwnedBy: jest.fn().mockResolvedValue(3) }
    uploads = { removeAllOwnedBy: jest.fn().mockResolvedValue(2) }
    personService = { ...listStub(), findOptional: jest.fn().mockResolvedValue({ id: 'p' }) }
    profileService = { ...listStub(), findOptional: jest.fn().mockResolvedValue({ id: 'f' }) }
    localeService = listStub()
    content = new Map(CONTENT_SERVICES.map((token) => [token, listStub()]))
    content.get(ProjectService)!.findAll.mockResolvedValue([{ id: 'one' }])

    const moduleRef = await Test.createTestingModule({
      providers: [
        OwnerLifecycleService,
        { provide: OwnerService, useValue: owners },
        { provide: IdentityDirectory, useValue: identities },
        { provide: AnalyticsService, useValue: analytics },
        { provide: UploadsService, useValue: uploads },
        { provide: PersonService, useValue: personService },
        { provide: ProfileService, useValue: profileService },
        { provide: LocaleService, useValue: localeService },
        ...CONTENT_SERVICES.map((token) => ({ provide: token, useValue: content.get(token) })),
      ],
    }).compile()

    service = moduleRef.get(OwnerLifecycleService)
  })

  describe('publish', () => {
    it('publishes a portfolio that has a person, a profile, a language and one section', async () => {
      await expect(service.publish(OWNER)).resolves.toMatchObject({ status: 'published' })
      expect(owners.publish).toHaveBeenCalledWith(OWNER)
    })

    it('names everything that is missing rather than failing vaguely', async () => {
      personService.findOptional.mockResolvedValue(null)
      profileService.findOptional.mockResolvedValue(null)
      localeService.findEnabled.mockResolvedValue([])

      await expect(service.publish(OWNER)).rejects.toBeInstanceOf(UnprocessableEntityException)

      try {
        await service.publish(OWNER)
      } catch (error) {
        const response = (error as UnprocessableEntityException).getResponse() as {
          details: { missing: string[] }
        }
        expect(response.details.missing).toEqual(['person', 'profile', 'locale'])
      }
    })

    it('refuses a portfolio whose sections are all empty', async () => {
      content.get(ProjectService)!.findAll.mockResolvedValue([])

      try {
        await service.publish(OWNER)
        throw new Error('publish should have been refused')
      } catch (error) {
        const response = (error as UnprocessableEntityException).getResponse() as {
          details: { missing: string[] }
        }
        expect(response.details.missing).toEqual(['section'])
      }

      expect(owners.publish).not.toHaveBeenCalled()
    })

    it('accepts any single section as enough substance to publish', async () => {
      content.get(ProjectService)!.findAll.mockResolvedValue([])
      content.get(AwardService)!.findAll.mockResolvedValue([{ id: 'award' }])

      await expect(service.publish(OWNER)).resolves.toMatchObject({ status: 'published' })
    })

    it('does not publish when the completeness check fails', async () => {
      localeService.findEnabled.mockResolvedValue([])

      await expect(service.publish(OWNER)).rejects.toBeInstanceOf(UnprocessableEntityException)
      expect(owners.publish).not.toHaveBeenCalled()
    })
  })

  describe('export', () => {
    it('reads every collection for the one owner', async () => {
      const result = await service.exportAll(OWNER)

      expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(localeService.findAll).toHaveBeenCalledWith(OWNER)
      for (const token of CONTENT_SERVICES) {
        expect(content.get(token)?.findAll).toHaveBeenCalledWith(OWNER)
      }
    })

    it('carries every collection the portfolio can hold', async () => {
      const result = await service.exportAll(OWNER)

      expect(Object.keys(result).sort()).toEqual(
        [
          'awards',
          'certifications',
          'degrees',
          'experiences',
          'exportedAt',
          'locales',
          'owner',
          'person',
          'profile',
          'projects',
          'skillCategories',
          'spokenLanguages',
          'volunteering',
        ].sort(),
      )
    })
  })

  describe('erasure', () => {
    it('empties every collection before removing the owner', async () => {
      await service.erase(OWNER)

      expect(personService.removeAllOwnedBy).toHaveBeenCalledWith(OWNER)
      expect(profileService.removeAllOwnedBy).toHaveBeenCalledWith(OWNER)
      expect(localeService.removeAllOwnedBy).toHaveBeenCalledWith(OWNER)
      for (const token of CONTENT_SERVICES) {
        expect(content.get(token)?.removeAllOwnedBy).toHaveBeenCalledWith(OWNER)
      }
      expect(owners.remove).toHaveBeenCalledWith(OWNER)
    })

    it('purges the analytics rows for that portfolio', async () => {
      await service.erase(OWNER)
      expect(analytics.removeAllOwnedBy).toHaveBeenCalledWith(OWNER)
    })

    it('deletes the uploaded assets for that portfolio', async () => {
      await service.erase(OWNER)
      expect(uploads.removeAllOwnedBy).toHaveBeenCalledWith(OWNER)
    })

    it('deletes the Cognito user, so signing in again cannot resurrect the account', async () => {
      await service.erase(OWNER)
      expect(identities.remove).toHaveBeenCalledWith('cognito-sub')
    })

    it('refuses to erase an owner that does not exist', async () => {
      owners.findById.mockRejectedValue(new Error('Owner not found'))

      await expect(service.erase(OWNER)).rejects.toThrow('Owner not found')
      expect(personService.removeAllOwnedBy).not.toHaveBeenCalled()
      expect(analytics.removeAllOwnedBy).not.toHaveBeenCalled()
      expect(uploads.removeAllOwnedBy).not.toHaveBeenCalled()
      expect(identities.remove).not.toHaveBeenCalled()
      expect(owners.remove).not.toHaveBeenCalled()
    })

    it('keeps the owner record when the Cognito delete fails, so erasure can be retried', async () => {
      identities.remove.mockRejectedValue(new Error('cognito unreachable'))

      await expect(service.erase(OWNER)).rejects.toThrow('cognito unreachable')
      expect(owners.remove).not.toHaveBeenCalled()
    })

    it('leaves the owner record in place if a collection fails to empty', async () => {
      content.get(AwardService)?.removeAllOwnedBy.mockRejectedValue(new Error('mongo down'))

      await expect(service.erase(OWNER)).rejects.toThrow('mongo down')
      expect(owners.remove).not.toHaveBeenCalled()
    })
  })
})
