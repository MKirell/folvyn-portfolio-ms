import { getModelToken } from '@nestjs/mongoose'
import type { INestApplication } from '@nestjs/common'
import type { Model, Types } from 'mongoose'
import { Owner } from '@/owner/owner.schema'
import { Person } from '@/portfolio/person/person.schema'
import { Locale } from '@/portfolio/locale/locale.schema'
import { Profile } from '@/portfolio/profile/profile.schema'
import { Certification } from '@/portfolio/education/certification.schema'

export const OWNER_SUB = 'a3f1c0de-0000-4000-8000-000000000001'
export const OWNER_SLUG = 'mohamed-khalil-zrelly'

export const PERSON = {
  givenName: 'Mohamed Khalil',
  familyName: 'ZRELLY',
  email: 'hello@mkirell.com',
  phone: '+21612345678',
  linkedin: 'https://www.linkedin.com/in/mkirell',
  github: 'https://github.com/MKirell',
  affiliation: 'Freelance',
  city: 'Tunis',
  country: 'TN',
  photo: 'off-image.jpeg',
  resumes: { en: 'resume_en_mkzrelly.pdf' },
  translations: {
    en: {
      headline: 'Data engineer',
      aboutParagraphs: ['Builds data platforms.'],
      contactDesc: 'Say hello.',
    },
  },
}

const PROFILE = {
  highlights: ['Python', 'Airflow'],
  highlightFocus: ['Python'],
  translations: {
    en: {
      subtitles: ['Data engineer'],
      tagline: 'Builds data platforms.',
    },
  },
}

export async function seed(app: INestApplication): Promise<Types.ObjectId> {
  const owner = app.get<Model<Owner>>(getModelToken(Owner.name))
  const person = app.get<Model<Person>>(getModelToken(Person.name))
  const locale = app.get<Model<Locale>>(getModelToken(Locale.name))
  const profile = app.get<Model<Profile>>(getModelToken(Profile.name))
  const certification = app.get<Model<Certification>>(getModelToken(Certification.name))

  await Promise.all([
    owner.deleteMany({}),
    person.deleteMany({}),
    locale.deleteMany({}),
    profile.deleteMany({}),
    certification.deleteMany({}),
  ])

  const created = await owner.create({
    sub: OWNER_SUB,
    slug: OWNER_SLUG,
    email: 'hello@mkirell.com',
    displayName: 'Mohamed Khalil ZRELLY',
    status: 'published',
    publishedAt: new Date(),
  })
  const ownerId = created._id

  await person.create({ ...PERSON, ownerId })
  await locale.create([
    { ownerId, code: 'en', label: 'English', flagCode: 'gb', enabled: true, order: 0 },
    { ownerId, code: 'fr', label: 'Français', flagCode: 'fr', enabled: true, order: 1 },
  ])
  await profile.create({ ...PROFILE, ownerId })
  await certification.create({
    ownerId,
    order: 0,
    icon: 'Zap',
    title: 'AI-900',
    issuer: 'Microsoft',
    doc: 'certificate-azure-ai900.pdf',
    translations: { en: { date: 'June 2024' } },
  })

  return ownerId
}
