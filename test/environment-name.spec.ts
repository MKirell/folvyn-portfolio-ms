import { environmentName } from '@/platform/platform.service'

const NODE_ENV = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = NODE_ENV
})

describe('environmentName', () => {
  it('names each environment from the one variable every environment sets', () => {
    expect(environmentName('local')).toBe('Local')
    expect(environmentName('dev')).toBe('Development')
    expect(environmentName('prod')).toBe('Production')
  })

  it('separates dev from prod, which both run as NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production'

    expect(environmentName('dev')).toBe('Development')
    expect(environmentName('prod')).toBe('Production')
  })

  it('does not infer the environment from a site host that the deploy never sets', () => {
    process.env.NODE_ENV = 'production'

    expect(environmentName(undefined)).not.toBe('Development')
    expect(environmentName('https://folvyn-dev.mkirell.com')).not.toBe('Development')
  })

  it('falls back to NODE_ENV when APP_ENV is missing or unknown', () => {
    process.env.NODE_ENV = 'production'
    expect(environmentName(undefined)).toBe('Production')
    expect(environmentName('staging')).toBe('Production')

    process.env.NODE_ENV = 'development'
    expect(environmentName(undefined)).toBe('Local')
  })
})
