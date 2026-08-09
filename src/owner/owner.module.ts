import { Global, Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '@/auth/auth.module'
import { Owner, OwnerSchema } from '@/owner/owner.schema'
import { OwnerService } from '@/owner/owner.service'

@Global()
@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: Owner.name, schema: OwnerSchema }])],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
