import { Body, Controller, Get, Patch, Put } from '@nestjs/common'
import { OwnerId } from '@/common/decorators/current-owner.decorator'
import { PersonService } from '@/portfolio/person/person.service'
import { Person } from '@/portfolio/person/person.schema'
import { UpdatePersonDto, UpsertPersonDto } from '@/portfolio/person/person.dto'

@Controller('admin/person')
export class PersonController {
  constructor(private readonly service: PersonService) {}

  @Get()
  find(@OwnerId() ownerId: string): Promise<Person> {
    return this.service.find(ownerId)
  }

  @Put()
  upsert(@OwnerId() ownerId: string, @Body() dto: UpsertPersonDto): Promise<Person> {
    return this.service.upsert(ownerId, dto)
  }

  @Patch()
  update(@OwnerId() ownerId: string, @Body() dto: UpdatePersonDto): Promise<Person> {
    return this.service.update(ownerId, dto)
  }
}
