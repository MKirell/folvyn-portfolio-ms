export function assetPrefixFor(bucket: string | undefined, ownerId: string): string {
  return bucket ? ownerId : ''
}
