import { LambdaClient } from '@aws-sdk/client-lambda'
import { ConfigService } from '@nestjs/config'
import type { Provider } from '@nestjs/common'
import { LAMBDA_CLIENT } from '@/prerender/lambda.token'
import type { PrerenderConfig } from '@/config/configuration'

export const lambdaClientProvider: Provider = {
  provide: LAMBDA_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): LambdaClient => {
    const prerender = config.getOrThrow<PrerenderConfig>('prerender')
    return new LambdaClient({ region: prerender.region })
  },
}
