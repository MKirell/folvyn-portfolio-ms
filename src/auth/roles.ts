export enum Role {
  Platform = 'platform',
}

const KNOWN_ROLES = new Set<string>(Object.values(Role))
const GROUP_PREFIX = 'folvyn-'

export function toRoles(claimed: readonly string[]): Role[] {
  return [...new Set(claimed)].filter((role): role is Role => KNOWN_ROLES.has(role))
}

export function toGroupRoles(groups: readonly string[]): Role[] {
  return toRoles(
    groups
      .filter((group) => group.startsWith(GROUP_PREFIX))
      .map((group) => group.slice(GROUP_PREFIX.length)),
  )
}
