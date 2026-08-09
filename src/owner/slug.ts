export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 40

const COMBINING_MARKS = /[̀-ͯ]/g

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'about',
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'collect',
  'console',
  'files',
  'flags',
  'fol',
  'imgs',
  'legal',
  'login',
  'pricing',
  'privacy',
  'signup',
  'terms',
  'www',
])

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}

export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `Address must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters`
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'Address may use lowercase letters, digits and single hyphens between them'
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is reserved by the platform`
  }
  return null
}

export function slugFromName(givenName: string, familyName: string): string {
  return slugCandidate(`${givenName} ${familyName}`)
}

export function slugCandidate(source: string): string {
  const stripped = source
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')

  return stripped.length >= SLUG_MIN_LENGTH ? stripped : ''
}
