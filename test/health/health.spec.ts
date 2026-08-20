import { ServiceUnavailableException } from '@nestjs/common'
import { ConnectionStates } from 'mongoose'
import { HealthController } from '@/health/health.controller'

function connection(readyState: number, settle?: () => Promise<unknown>) {
  return {
    readyState,
    asPromise: settle ?? (() => Promise.resolve()),
  } as never
}

describe('the health probe', () => {
  it('is ok once the database is connected', async () => {
    const controller = new HealthController(connection(ConnectionStates.connected))

    await expect(controller.check()).resolves.toEqual({ status: 'ok' })
  })

  it('is unavailable when the database is disconnected', async () => {
    const controller = new HealthController(connection(ConnectionStates.disconnected))

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('waits for a connection still being made rather than calling it down', async () => {
    const state = { readyState: ConnectionStates.connecting }
    const controller = new HealthController({
      get readyState() {
        return state.readyState
      },
      asPromise: async () => {
        state.readyState = ConnectionStates.connected
      },
    } as never)

    await expect(controller.check()).resolves.toEqual({ status: 'ok' })
  })

  it('is unavailable when the connection being made fails', async () => {
    const controller = new HealthController(
      connection(ConnectionStates.connecting, () => Promise.reject(new Error('no route'))),
    )

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
