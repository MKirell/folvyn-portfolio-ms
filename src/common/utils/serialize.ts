type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toPlain<T>(document: T): T {
  if (!isPlainObject(document)) return document

  const clone: Plain = { ...document }
  const id = clone._id

  if (id !== undefined && id !== null) {
    clone.id = typeof id === 'string' ? id : (id as { toString(): string }).toString()
    delete clone._id
  }
  delete clone.__v

  return clone as T
}

export function toPlainList<T>(documents: T[]): T[] {
  return documents.map((document) => toPlain(document))
}
