import type { Request, Response } from 'express'
import { SanitizeMiddleware } from '@/common/middleware/sanitize.middleware'

function run(body: unknown, query: unknown = {}, params: unknown = {}): Request {
  const req = { body, query, params } as unknown as Request
  new SanitizeMiddleware().use(req, {} as Response, () => undefined)
  return req
}

describe('SanitizeMiddleware', () => {
  it('strips mongo operators from the body', () => {
    const req = run({ email: { $ne: null }, name: 'Owner' })

    expect(req.body).toEqual({ email: {}, name: 'Owner' })
  })

  it('strips operators nested inside arrays', () => {
    const req = run({ tags: [{ $where: 'sleep(5000)' }, { label: 'ok' }] })

    expect(req.body).toEqual({ tags: [{}, { label: 'ok' }] })
  })

  it('strips dotted keys that could reach into subdocuments', () => {
    const req = run({ 'translations.en.role': 'injected', company: 'Acme' })

    expect(req.body).toEqual({ company: 'Acme' })
  })

  it('sanitises query and route params too', () => {
    const req = run({}, { lang: { $gt: '' } }, { id: { $ne: '1' } })

    expect(req.query).toEqual({ lang: {} })
    expect(req.params).toEqual({ id: {} })
  })

  it('leaves legitimate payloads untouched', () => {
    const payload = {
      company: 'Crédit Agricole',
      tags: ['LangGraph', 'RAG'],
      translations: { en: { role: 'Engineer', bullets: ['Built things'] } },
    }
    const req = run(structuredClone(payload))

    expect(req.body).toEqual(payload)
  })

  it('does not recurse without bound on deeply nested input', () => {
    let deep: Record<string, unknown> = { $bad: 1 }
    for (let i = 0; i < 40; i += 1) deep = { nested: deep }

    expect(() => run(deep)).not.toThrow()
  })
})
