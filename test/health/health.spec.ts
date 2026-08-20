import { ServiceUnavailableException } from '@nestjs/common'
import { ConnectionStates } from 'mongoose'
import { HealthController, READY_TIMEOUT_MS } from '@/health/health.controller'

function connection(state: { readyState: number }) {
  return {
    get readyState() {
      return state.readyState
    },
  } as never
}

describe('the health probe', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('is ok once the database is connected', async () => {
    const controller = new HealthController(connection({ readyState: ConnectionStates.connected }))

    await expect(controller.check()).resolves.toEqual({ status: 'ok' })
  })

  it('waits for a connection still being made rather than calling it down', async () => {
    const state = { readyState: ConnectionStates.connecting }
    const controller = new HealthController(connection(state))

    const answered = controller.check()
    state.readyState = ConnectionStates.connected
    await jest.advanceTimersByTimeAsync(200)

    await expect(answered).resolves.toEqual({ status: 'ok' })
  })

  it('waits for a connection that has not started yet, not only one in progress', async () => {
    const state = { readyState: ConnectionStates.disconnected }
    const controller = new HealthController(connection(state))

    const answered = controller.check()
    await jest.advanceTimersByTimeAsync(300)
    state.readyState = ConnectionStates.connected
    await jest.advanceTimersByTimeAsync(200)

    await expect(answered).resolves.toEqual({ status: 'ok' })
  })

  it('is unavailable when the connection never settles', async () => {
    const controller = new HealthController(
      connection({ readyState: ConnectionStates.disconnected }),
    )

    const answered = expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException)
    await jest.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 200)

    await answered
  })
})
