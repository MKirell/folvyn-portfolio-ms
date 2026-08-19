import { ConfigService } from '@nestjs/config'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { PrerenderService } from '@/prerender/prerender.service'

function build(functionName = 'folvyn-prerender-dev', debounceMs = 10) {
  const send = jest.fn().mockResolvedValue({})
  const client = { send } as unknown as LambdaClient
  const config = {
    getOrThrow: () => ({ functionName, region: 'eu-west-3', debounceMs }),
  } as unknown as ConfigService

  return { service: new PrerenderService(client, config), send }
}

function settled(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('PrerenderService', () => {
  it('does nothing at all when no renderer is configured', async () => {
    const { service, send } = build('')

    service.schedule('someone')
    await settled()

    expect(service.enabled).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('asks the renderer once for a burst of edits to the same portfolio', async () => {
    const { service, send } = build()

    service.schedule('someone')
    service.schedule('someone')
    service.schedule('someone')
    await settled()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('keeps portfolios apart', async () => {
    const { service, send } = build()

    service.schedule('one')
    service.schedule('two')
    await settled()

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('invokes asynchronously, so a save never waits on a render', async () => {
    const { service, send } = build()

    service.schedule('someone')
    await settled()

    const [command] = send.mock.calls[0] as [{ input: Record<string, unknown> }]
    expect(command.input.InvocationType).toBe('Event')
    expect(JSON.parse(String(command.input.Payload))).toEqual({ slug: 'someone', removed: false })
  })

  it('tells the renderer to take a portfolio down when it is unpublished', async () => {
    const { service, send } = build()

    service.schedule('someone', { removed: true })
    await settled()

    const [command] = send.mock.calls[0] as [{ input: Record<string, unknown> }]
    expect(JSON.parse(String(command.input.Payload)).removed).toBe(true)
  })

  it('records a failure instead of throwing into the request', async () => {
    const { service, send } = build()
    send.mockRejectedValue(new Error('lambda is not reachable'))

    service.schedule('someone')
    await settled()

    const [attempt] = service.recent()
    expect(attempt.succeeded).toBe(false)
    expect(attempt.detail).toMatch(/not reachable/)
  })

  it('reports what it last tried', async () => {
    const { service } = build()

    service.schedule('someone')
    await settled()

    expect(service.recent()).toEqual([
      expect.objectContaining({ slug: 'someone', succeeded: true, detail: null }),
    ])
  })

  it('drops pending work when the module goes down', async () => {
    const { service, send } = build('folvyn-prerender-dev', 1000)

    service.schedule('someone')
    service.onModuleDestroy()
    await settled()

    expect(send).not.toHaveBeenCalled()
  })
})
