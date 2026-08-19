import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { ConfigModule } from '@/config/config.module'
import { DatabaseModule } from '@/database/database.module'
import { AuthModule } from '@/auth/auth.module'
import { OwnerModule } from '@/owner/owner.module'
import { PortfolioModule } from '@/portfolio/portfolio.module'
import { AnalyticsModule } from '@/analytics/analytics.module'
import { PlatformModule } from '@/platform/platform.module'
import { UploadsModule } from '@/uploads/uploads.module'
import { PrerenderModule } from '@/prerender/prerender.module'
import { PrerenderInterceptor } from '@/prerender/prerender.interceptor'
import { HealthController } from '@/health/health.controller'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { AccessAllowlistGuard } from '@/common/guards/access-allowlist.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { OwnerScopeGuard } from '@/common/guards/owner-scope.guard'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'
import { SanitizeMiddleware } from '@/common/middleware/sanitize.middleware'
import type { ThrottleConfig } from '@/config/configuration'

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttle = config.getOrThrow<ThrottleConfig>('throttle')
        return { throttlers: [{ ttl: throttle.ttl, limit: throttle.limit }] }
      },
    }),
    AuthModule,
    OwnerModule,
    PortfolioModule,
    AnalyticsModule,
    PlatformModule,
    UploadsModule,
    PrerenderModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccessAllowlistGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: OwnerScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: PrerenderInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SanitizeMiddleware).forRoutes('*')
  }
}
