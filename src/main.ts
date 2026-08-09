import 'reflect-metadata'
import { Logger, LogLevel } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from '@/app.module'
import { applyAppConfig } from '@/bootstrap'
import type { AppConfig } from '@/config/configuration'

const LOG_LEVELS: Record<string, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })

  const config = app.get(ConfigService)
  const appConfig = config.getOrThrow<AppConfig>('app')

  app.useLogger(LOG_LEVELS[appConfig.logLevel] ?? LOG_LEVELS.log)
  applyAppConfig(app, appConfig)

  await app.listen(appConfig.port)
  Logger.log(
    `folvyn-portfolio-ms [${appConfig.appEnv}] listening on port ${appConfig.port} under /${appConfig.apiPrefix}`,
    'Bootstrap',
  )
}

void bootstrap()
