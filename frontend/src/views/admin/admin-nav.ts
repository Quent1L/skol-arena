import type { NavigationMenuItem } from '@nuxt/ui'

export interface AdminSection {
  to: string
  /** Short label, under `adminNav.*`. */
  navKey: string
  icon: string
}

export interface AdminSectionGroup {
  /** Group heading, under `adminNav.groups.*`. */
  key: string
  sections: AdminSection[]
}

/** Single source for the sidebar and the dashboard. */
export const ADMIN_SECTION_GROUPS: AdminSectionGroup[] = [
  {
    key: 'competition',
    sections: [
      { to: '/admin/tournaments', navKey: 'tournaments', icon: 'i-fa7-solid:trophy' },
      { to: '/admin/disciplines', navKey: 'disciplines', icon: 'i-fa7-solid:gamepad' },
      { to: '/admin/ranked', navKey: 'ranked', icon: 'i-fa7-solid:ranking-star' },
      { to: '/admin/rules', navKey: 'rules', icon: 'i-fa7-solid:scroll' },
      { to: '/admin/rules-engine', navKey: 'rulesEngine', icon: 'i-fa7-solid:wand-magic-sparkles' },
    ],
  },
  {
    key: 'members',
    sections: [
      { to: '/admin/users', navKey: 'users', icon: 'i-fa7-solid:user' },
      { to: '/admin/organizations', navKey: 'organizations', icon: 'i-fa7-solid:users' },
      { to: '/admin/invitations', navKey: 'invitations', icon: 'i-fa7-solid:ticket' },
    ],
  },
  {
    key: 'system',
    sections: [
      { to: '/admin/maintenance', navKey: 'maintenance', icon: 'i-fa7-solid:screwdriver-wrench' },
    ],
  },
]

/**
 * `active` is computed from the path rather than left to the router: admin routes are
 * flat siblings, so `/admin/tournaments/:id/edit` is not a child of `/admin/tournaments`
 * and the router would not light the section up.
 */
export function buildAdminNavItems(
  t: (key: string) => string,
  currentPath: string,
): NavigationMenuItem[][] {
  const dashboard: NavigationMenuItem = {
    label: t('adminNav.dashboard'),
    icon: 'i-fa7-solid:gauge',
    to: '/admin',
    active: currentPath === '/admin',
  }
  const groups = ADMIN_SECTION_GROUPS.map((group) => [
    { label: t(`adminNav.groups.${group.key}`), type: 'label' as const },
    ...group.sections.map((section) => ({
      label: t(`adminNav.${section.navKey}`),
      icon: section.icon,
      to: section.to,
      active: currentPath === section.to || currentPath.startsWith(`${section.to}/`),
    })),
  ])
  return [[dashboard], ...groups]
}
