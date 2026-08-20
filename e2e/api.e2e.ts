import { expect, test } from '@playwright/test'
import {
  adminToken,
  bearer,
  guestToken,
  machineToken,
  platformToken,
  scopedUserToken,
} from './auth'

const API = '/api/v1'
const SLUG = 'mohamed-khalil-zrelly'

const certification = {
  icon: 'Cloud',
  title: 'DP-900',
  issuer: 'Microsoft',
  doc: 'certificate-azure-dp900.pdf',
  date: '2024-05',
}

test.describe('public surface', () => {
  test('answers the health probe', async ({ request }) => {
    const response = await request.get(`${API}/health`)

    expect(response.status()).toBe(200)
    const health = await response.json()
    expect(health).toEqual({ status: 'ok' })
    expect(health).not.toHaveProperty('database')
  })

  test('resolves the whole portfolio for the default locale', async ({ request }) => {
    const body = await (await request.get(`${API}/portfolio/${SLUG}`)).json()

    expect(body.lang).toBe('en')
    expect(body.person.givenName).toBe('Mohamed Khalil')
    expect(body.person.familyName).toBe('ZRELLY')
    expect(body.person).not.toHaveProperty('name')
    expect(body.person).not.toHaveProperty('phoneDisplay')
    expect(body.person).not.toHaveProperty('linkedinHandle')
    expect(body).not.toHaveProperty('ui')
    expect(body.person.aboutParagraphs.length).toBeGreaterThan(0)
    expect(body.availableLangs.map((l: { code: string }) => l.code)).toEqual(['en', 'fr'])
    expect(body.education.certifications.length).toBeGreaterThan(0)
  })

  test('stores bare filenames, never URLs', async ({ request }) => {
    const body = await (await request.get(`${API}/portfolio/${SLUG}`)).json()

    expect(body.person.photo).toBe('off-image.jpeg')
    expect(body.education.certifications[0].doc).not.toContain('http')
  })

  test('lists only enabled languages', async ({ request }) => {
    const body = await (await request.get(`${API}/portfolio/${SLUG}/languages`)).json()

    expect(body).toHaveLength(2)
  })

  test('serves a portfolio at its own address', async ({ request }) => {
    const response = await request.get(`${API}/portfolio/${SLUG}?lang=fr`)

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.lang).toBe('fr')
    expect(body.person.givenName).toBe('Mohamed Khalil')
  })

  test('never leaks the owner id to a visitor', async ({ request }) => {
    const body = await (await request.get(`${API}/portfolio/${SLUG}`)).json()

    expect(JSON.stringify(body)).not.toContain('ownerId')
  })

  test('reports whether an address is published', async ({ request }) => {
    const body = await (await request.get(`${API}/portfolio/${SLUG}/meta`)).json()

    expect(body).toMatchObject({ slug: SLUG, published: true })
  })

  test('is a 404 for an address nobody has published', async ({ request }) => {
    expect((await request.get(`${API}/portfolio/nobody-lives-here`)).status()).toBe(404)
  })

  test('rejects an address that could never be valid', async ({ request }) => {
    expect((await request.get(`${API}/portfolio/xy`)).status()).toBe(400)
  })

  test('sets the hardened response headers', async ({ request }) => {
    const headers = (await request.get(`${API}/health`)).headers()

    expect(headers['content-security-policy']).toContain("default-src 'none'")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['x-powered-by']).toBeUndefined()
  })
})

test.describe('admin authorization', () => {
  test('refuses an anonymous caller', async ({ request }) => {
    expect((await request.get(`${API}/admin/certifications`)).status()).toBe(401)
  })

  test('gives a signed-in user in no group their own empty portfolio', async ({ request }) => {
    const response = await request.get(`${API}/admin/certifications`, {
      headers: bearer(guestToken()),
    })

    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual([])
  })

  test('treats a user token carrying the admin scope the same way', async ({ request }) => {
    const response = await request.get(`${API}/admin/certifications`, {
      headers: bearer(scopedUserToken()),
    })

    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual([])
  })

  test('refuses a machine token, which belongs to no portfolio', async ({ request }) => {
    const response = await request.get(`${API}/admin/certifications`, {
      headers: bearer(machineToken()),
    })

    expect(response.status()).toBe(403)
  })

  test('accepts a human token carrying the admin group', async ({ request }) => {
    const response = await request.get(`${API}/admin/certifications`, {
      headers: bearer(adminToken()),
    })

    expect(response.status()).toBe(200)
  })

  test('refuses a token that was not issued for this service', async ({ request }) => {
    const response = await request.get(`${API}/admin/certifications`, {
      headers: { Authorization: 'Bearer not-a-token' },
    })

    expect(response.status()).toBe(401)
  })
})

test.describe('content lifecycle', () => {
  test('creates, reads, patches, reorders and deletes an entry', async ({ request }) => {
    const headers = bearer(adminToken())

    const created = await request.post(`${API}/admin/certifications`, {
      headers,
      data: certification,
    })
    expect(created.status()).toBe(201)
    const entry = await created.json()
    expect(entry.id).toBeTruthy()

    const read = await request.get(`${API}/admin/certifications/${entry.id}`, { headers })
    expect((await read.json()).title).toBe('DP-900')

    const patched = await request.patch(`${API}/admin/certifications/${entry.id}`, {
      headers,
      data: { title: 'DP-900 renewed' },
    })
    expect((await patched.json()).title).toBe('DP-900 renewed')

    const all = await (await request.get(`${API}/admin/certifications`, { headers })).json()
    const entries = all.map((doc: { id: string }, index: number) => ({
      id: doc.id,
      order: all.length - 1 - index,
    }))

    const reordered = await request.patch(`${API}/admin/certifications/reorder`, {
      headers,
      data: { entries },
    })
    expect(reordered.status()).toBe(200)
    const ids = (await reordered.json()).map((doc: { id: string }) => doc.id)
    expect(ids).toEqual([...all].reverse().map((doc: { id: string }) => doc.id))

    const removed = await request.delete(`${API}/admin/certifications/${entry.id}`, { headers })
    expect(removed.status()).toBe(204)

    const gone = await request.get(`${API}/admin/certifications/${entry.id}`, { headers })
    expect(gone.status()).toBe(404)
  })

  test('rejects an unknown property instead of silently storing it', async ({ request }) => {
    const response = await request.post(`${API}/admin/certifications`, {
      headers: bearer(adminToken()),
      data: { ...certification, sneaky: 'value' },
    })

    expect(response.status()).toBe(400)
    expect(JSON.stringify(await response.json())).toContain('sneaky')
  })

  test('rejects a translation keyed by something that is not a language', async ({ request }) => {
    const response = await request.post(`${API}/admin/certifications`, {
      headers: bearer(adminToken()),
      data: { ...certification, translations: { english: { date: 'May 2024' } } },
    })

    expect(response.status()).toBe(400)
  })

  test('rejects an entry with no translations at all', async ({ request }) => {
    const response = await request.post(`${API}/admin/certifications`, {
      headers: bearer(adminToken()),
      data: { ...certification, translations: {} },
    })

    expect(response.status()).toBe(400)
  })

  test('rejects a malformed identifier', async ({ request }) => {
    const response = await request.get(`${API}/admin/certifications/not-an-id`, {
      headers: bearer(adminToken()),
    })

    expect(response.status()).toBe(400)
  })

  test('patches the person singleton without touching the rest', async ({ request }) => {
    const headers = bearer(adminToken())

    const before = await (await request.get(`${API}/admin/person`, { headers })).json()
    const patched = await request.patch(`${API}/admin/person`, {
      headers,
      data: { affiliation: 'Independent' },
    })

    const after = await patched.json()
    expect(after.affiliation).toBe('Independent')
    expect(after.givenName).toBe(before.givenName)

    await request.patch(`${API}/admin/person`, {
      headers,
      data: { affiliation: before.affiliation },
    })
  })
})

test.describe('tenant isolation', () => {
  test('one owner never sees, reads, edits or deletes another owner entry', async ({ request }) => {
    const mine = bearer(adminToken())
    const theirs = bearer(guestToken())

    const created = await request.post(`${API}/admin/certifications`, {
      headers: mine,
      data: { ...certification, title: 'Private to me' },
    })
    const entry = await created.json()

    const theirList = await (
      await request.get(`${API}/admin/certifications`, { headers: theirs })
    ).json()
    expect(theirList.map((doc: { id: string }) => doc.id)).not.toContain(entry.id)

    const read = await request.get(`${API}/admin/certifications/${entry.id}`, { headers: theirs })
    expect(read.status()).toBe(404)

    const patched = await request.patch(`${API}/admin/certifications/${entry.id}`, {
      headers: theirs,
      data: { title: 'Stolen' },
    })
    expect(patched.status()).toBe(404)

    const deleted = await request.delete(`${API}/admin/certifications/${entry.id}`, {
      headers: theirs,
    })
    expect(deleted.status()).toBe(404)

    const stillMine = await request.get(`${API}/admin/certifications/${entry.id}`, {
      headers: mine,
    })
    expect((await stillMine.json()).title).toBe('Private to me')

    await request.delete(`${API}/admin/certifications/${entry.id}`, { headers: mine })
  })

  test('an owner cannot reorder entries they do not own', async ({ request }) => {
    const mine = bearer(adminToken())
    const all = await (await request.get(`${API}/admin/certifications`, { headers: mine })).json()

    const response = await request.patch(`${API}/admin/certifications/reorder`, {
      headers: bearer(guestToken()),
      data: { entries: all.map((doc: { id: string }) => ({ id: doc.id, order: 0 })) },
    })

    expect(response.status()).toBe(404)
  })

  test('a body cannot smuggle another owner id into a write', async ({ request }) => {
    const mine = await (await request.get(`${API}/me`, { headers: bearer(adminToken()) })).json()

    const created = await request.post(`${API}/admin/certifications`, {
      headers: bearer(guestToken()),
      data: { ...certification, ownerId: mine.id },
    })

    expect(created.status()).toBe(400)
  })

  test('each person keeps their own person document', async ({ request }) => {
    const theirs = await request.get(`${API}/admin/person`, { headers: bearer(guestToken()) })
    expect(theirs.status()).toBe(404)

    const mine = await request.get(`${API}/admin/person`, { headers: bearer(adminToken()) })
    expect((await mine.json()).givenName).toBe('Mohamed Khalil')
  })
})

test.describe('the owner record', () => {
  test('describes the portfolio behind the token', async ({ request }) => {
    const body = await (await request.get(`${API}/me`, { headers: bearer(adminToken()) })).json()

    expect(body).toMatchObject({ slug: SLUG, status: 'published' })
  })

  test('derives an address at sign-up from the federated name', async ({ request }) => {
    const body = await (await request.get(`${API}/me`, { headers: bearer(guestToken()) })).json()

    expect(body.slug).toBe('guest-e2e')
  })

  test('changes the address on request, and breaks the old one', async ({ request }) => {
    const headers = bearer(adminToken())

    const moved = await request.patch(`${API}/me`, { headers, data: { slug: 'something-else' } })
    expect(moved.status()).toBe(200)
    expect((await moved.json()).slug).toBe('something-else')

    expect((await request.get(`${API}/portfolio/something-else`)).status()).toBe(200)
    expect((await request.get(`${API}/portfolio/${SLUG}`)).status()).toBe(404)

    const restored = await request.patch(`${API}/me`, { headers, data: { slug: SLUG } })
    expect(restored.status()).toBe(200)
    expect((await restored.json()).slug).toBe(SLUG)
  })

  test('refuses an address that is malformed or reserved', async ({ request }) => {
    const headers = bearer(adminToken())

    for (const slug of ['Not Lowercase', 'a', 'double--hyphen', 'admin']) {
      expect((await request.patch(`${API}/me`, { headers, data: { slug } })).status()).toBe(400)
    }

    const body = await (await request.get(`${API}/me`, { headers })).json()
    expect(body.slug).toBe(SLUG)
  })

  test('accepts a change of consent mode', async ({ request }) => {
    const headers = bearer(adminToken())

    const updated = await request.patch(`${API}/me`, {
      headers,
      data: { consentMode: 'enhanced' },
    })
    expect((await updated.json()).consentMode).toBe('enhanced')

    await request.patch(`${API}/me`, { headers, data: { consentMode: 'measurement' } })
  })

  test('refuses to publish a portfolio with nothing in it', async ({ request }) => {
    const response = await request.post(`${API}/me/publish`, { headers: bearer(guestToken()) })

    expect(response.status()).toBe(422)
    expect((await response.json()).details.missing).toContain('person')
  })

  test('exports everything the portfolio holds', async ({ request }) => {
    const body = await (
      await request.get(`${API}/me/export`, { headers: bearer(adminToken()) })
    ).json()

    expect(body.owner.slug).toBe(SLUG)
    expect(body.person.givenName).toBe('Mohamed Khalil')
    expect(body.locales).toHaveLength(2)
    expect(body.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('erases an account and everything under it', async ({ request }) => {
    const headers = bearer(scopedUserToken())

    await request.post(`${API}/admin/certifications`, { headers, data: certification })
    expect(
      (await (await request.get(`${API}/admin/certifications`, { headers })).json()).length,
    ).toBe(1)

    const erased = await request.delete(`${API}/me`, { headers })
    expect(erased.status()).toBe(204)

    const after = await (await request.get(`${API}/admin/certifications`, { headers })).json()
    expect(after).toEqual([])
  })

  test('leaves no owner-scoped endpoint open to an anonymous caller', async ({ request }) => {
    expect((await request.get(`${API}/me`)).status()).toBe(401)
    expect((await request.get(`${API}/me/export`)).status()).toBe(401)
    expect((await request.post(`${API}/me/publish`)).status()).toBe(401)
    expect((await request.delete(`${API}/me`)).status()).toBe(401)
  })
})

test.describe('a locale nobody has finished translating', () => {
  test('cannot be enabled straight through the API', async ({ request }) => {
    const headers = bearer(adminToken())

    const created = await request.post(`${API}/admin/locales`, {
      headers,
      data: { code: 'de', flagCode: 'de', enabled: false },
    })
    expect(created.status()).toBe(201)
    const locale = await created.json()

    const enabled = await request.patch(`${API}/admin/locales/${locale.id}`, {
      headers,
      data: { enabled: true },
    })

    expect(enabled.status()).toBe(422)
    expect((await enabled.json()).details.missing.length).toBeGreaterThan(0)

    const languages = await (await request.get(`${API}/portfolio/${SLUG}/languages`)).json()
    expect(languages.map((l: { code: string }) => l.code)).not.toContain('de')

    await request.delete(`${API}/admin/locales/${locale.id}`, { headers })
  })

  test('cannot be created already enabled', async ({ request }) => {
    const response = await request.post(`${API}/admin/locales`, {
      headers: bearer(adminToken()),
      data: { code: 'it', flagCode: 'it', enabled: true },
    })

    expect(response.status()).toBe(422)
  })

  test('stays available to disable', async ({ request }) => {
    const headers = bearer(adminToken())
    const all = await (await request.get(`${API}/admin/locales`, { headers })).json()
    const french = all.find((l: { code: string }) => l.code === 'fr')

    const off = await request.patch(`${API}/admin/locales/${french.id}`, {
      headers,
      data: { enabled: false },
    })
    expect(off.status()).toBe(200)

    await request.patch(`${API}/admin/locales/${french.id}`, {
      headers,
      data: { enabled: false },
    })
  })
})

test.describe('analytics ingest', () => {
  test('accepts a same-origin beacon outside the api prefix', async ({ request }) => {
    const response = await request.post('/collect', {
      data: {
        slug: SLUG,
        sessionId: 'e2e-session-1',
        events: [
          { type: 'session', lang: 'en', referrer: 'https://www.linkedin.com/feed' },
          { type: 'section', target: 'projects' },
          { type: 'doc', target: 'resume_en_mkzrelly.pdf' },
        ],
      },
      headers: { 'CloudFront-Viewer-Country': 'TN' },
    })

    expect(response.status()).toBe(204)
  })

  test('rolls the beacon into the daily summary an admin can read', async ({ request }) => {
    const summary = await (
      await request.get(`${API}/admin/analytics/summary?days=7`, { headers: bearer(adminToken()) })
    ).json()

    expect(summary.totals.sessions).toBeGreaterThan(0)
    expect(summary.referrers.map((r: { key: string }) => r.key)).toContain('linkedin_com')
    expect(summary.sections.map((s: { key: string }) => s.key)).toContain('projects')
    expect(summary.trend).toHaveLength(7)
  })

  test('counts one visitor per day however many sessions the same browser opens', async ({
    request,
  }) => {
    const headers = bearer(adminToken())
    const viewer = { 'CloudFront-Viewer-Country': 'FR', 'Accept-Language': 'fr-FR' }

    const before = await (
      await request.get(`${API}/admin/analytics/summary?days=1`, { headers })
    ).json()

    for (const sessionId of ['e2e-session-2', 'e2e-session-3']) {
      await request.post('/collect', {
        data: { slug: SLUG, sessionId, events: [{ type: 'session', lang: 'fr' }] },
        headers: viewer,
      })
    }

    const after = await (
      await request.get(`${API}/admin/analytics/summary?days=1`, { headers })
    ).json()

    expect(after.totals.sessions).toBe(before.totals.sessions + 2)
    expect(after.totals.visitors).toBe(before.totals.visitors + 1)
  })

  test('separates visitors whose country differs', async ({ request }) => {
    const headers = bearer(adminToken())
    const before = await (
      await request.get(`${API}/admin/analytics/summary?days=1`, { headers })
    ).json()

    await request.post('/collect', {
      data: { slug: SLUG, sessionId: 'e2e-session-4', events: [{ type: 'session', lang: 'en' }] },
      headers: { 'CloudFront-Viewer-Country': 'DE', 'Accept-Language': 'de-DE' },
    })

    const after = await (
      await request.get(`${API}/admin/analytics/summary?days=1`, { headers })
    ).json()

    expect(after.totals.visitors).toBe(before.totals.visitors + 1)
  })

  test('rejects an unknown event type', async ({ request }) => {
    const response = await request.post('/collect', {
      data: { slug: SLUG, sessionId: 'e2e-session-3', events: [{ type: 'exfiltrate' }] },
    })

    expect(response.status()).toBe(400)
  })

  test('rejects a batch above the cap', async ({ request }) => {
    const response = await request.post('/collect', {
      data: {
        slug: SLUG,
        sessionId: 'e2e-session-4',
        events: Array.from({ length: 21 }, () => ({ type: 'section', target: 'hero' })),
      },
    })

    expect(response.status()).toBe(400)
  })

  test('gives every owner their own insights, and the operator none', async ({ request }) => {
    expect((await request.get(`${API}/admin/analytics/summary`)).status()).toBe(401)
    expect(
      (
        await request.get(`${API}/admin/analytics/summary`, { headers: bearer(guestToken()) })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.get(`${API}/admin/analytics/summary`, { headers: bearer(platformToken()) })
      ).status(),
    ).toBe(403)
  })
})

test.describe('uploads', () => {
  test('reports the feature unavailable while no bucket is configured', async ({ request }) => {
    const response = await request.post(`${API}/admin/uploads/presign`, {
      headers: bearer(adminToken()),
      data: { filename: 'a.pdf', contentType: 'application/pdf', size: 1024 },
    })

    expect(response.status()).toBe(503)
  })

  test('validates the key before it ever reaches S3', async ({ request }) => {
    const response = await request.post(`${API}/admin/uploads/presign`, {
      headers: bearer(adminToken()),
      data: { filename: '../escape.pdf', contentType: 'application/pdf', size: 1024 },
    })

    expect(response.status()).toBe(400)
  })

  test('refuses the operator, who owns no portfolio', async ({ request }) => {
    const response = await request.get(`${API}/admin/uploads`, {
      headers: bearer(platformToken()),
    })

    expect(response.status()).toBe(403)
  })
})
