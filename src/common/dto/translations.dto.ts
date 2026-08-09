import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { LANG_PATTERN } from '@/common/types/portfolio.types'

type Constructor<T> = new () => T

export function IsTranslationMap<T extends object>(
  translationType: Constructor<T>,
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isTranslationMap',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) return false

          const entries = Object.entries(value as Record<string, unknown>)
          if (entries.length === 0) return false

          return entries.every(([lang, translation]) => {
            if (!LANG_PATTERN.test(lang)) return false
            if (translation === null || typeof translation !== 'object') return false
            const instance = plainToInstance(translationType, translation)
            return (
              validateSync(instance, { whitelist: true, forbidNonWhitelisted: true }).length === 0
            )
          })
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must map language codes to valid translation objects`
        },
      },
    })
  }
}
