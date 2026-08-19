import { Global, Module } from '@nestjs/common'
import { lambdaClientProvider } from '@/prerender/lambda.provider'
import { PrerenderService } from '@/prerender/prerender.service'

@Global()
@Module({
  providers: [lambdaClientProvider, PrerenderService],
  exports: [PrerenderService],
})
export class PrerenderModule {}
