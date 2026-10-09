import type { RouteRecordRaw } from 'vue-router'
import { requireAdmin } from './guards'
import { i18n } from '@/i18n'

const t = (key: string) => i18n.global.t(key)

/**
 * Every admin screen renders inside AdminLayout (sidebar + page header). The guard
 * and the auth requirement live on the layout route, so they cover every child.
 * Route names, paths and `meta.parent` (breadcrumb chain) are unchanged.
 */
const children: RouteRecordRaw[] = [
  {
    path: '',
    name: 'admin',
    component: () => import('@/views/admin/AdminView.vue'),
    meta: {
      breadcrumb: t('routes.admin'),
      title: t('routes.admin'),
      hideBreadcrumb: true,
    },
  },
  {
    path: 'tournaments',
    name: 'admin-tournaments',
    component: () => import('@/views/admin/TournamentList.vue'),
    meta: {
      breadcrumb: t('routes.adminTournaments'),
      title: t('routes.adminTournaments'),
      parent: 'admin',
    },
  },
  {
    path: 'tournaments/new',
    name: 'admin-tournament-new',
    component: () => import('@/views/admin/TournamentFormView.vue'),
    meta: {
      breadcrumb: t('routes.editBreadcrumb'),
      title: t('routes.adminTournamentEdit'),
      parent: 'admin-tournaments',
    },
  },
  {
    path: 'tournaments/:id/edit',
    name: 'admin-tournament-edit',
    component: () => import('@/views/admin/TournamentFormView.vue'),
    meta: {
      breadcrumb: t('routes.editBreadcrumb'),
      title: t('routes.adminTournamentEdit'),
      parent: 'admin-tournaments',
    },
  },
  {
    path: 'disciplines',
    name: 'admin-disciplines',
    component: () => import('@/views/admin/DisciplineList.vue'),
    meta: {
      breadcrumb: t('routes.adminDisciplines'),
      title: t('routes.adminDisciplines'),
      parent: 'admin',
    },
  },
  {
    path: 'disciplines/:id',
    name: 'admin-discipline-edit',
    component: () => import('@/views/admin/DisciplineFormView.vue'),
    meta: {
      breadcrumb: t('routes.editBreadcrumb'),
      title: t('routes.adminDisciplineEdit'),
      parent: 'admin-disciplines',
    },
  },
  {
    path: 'rules-engine',
    name: 'admin-rules-engine',
    component: () => import('@/views/admin/RulesEngineList.vue'),
    meta: {
      breadcrumb: t('routes.adminRulesEngine'),
      title: t('routes.adminRulesEngine'),
      parent: 'admin',
    },
  },
  {
    path: 'rules-engine/stats',
    name: 'admin-rules-engine-overview',
    component: () => import('@/views/admin/RulesEngineOverviewView.vue'),
    meta: {
      breadcrumb: t('routes.adminRulesEngineOverview'),
      title: t('routes.adminRulesEngineOverview'),
      parent: 'admin-rules-engine',
    },
  },
  {
    path: 'rules-engine/new',
    name: 'admin-rules-engine-new',
    component: () => import('@/views/admin/RulesEngineFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminRulesEngineNew'),
      title: t('routes.adminRulesEngineNew'),
      parent: 'admin-rules-engine',
    },
  },
  {
    path: 'rules-engine/:id/edit',
    name: 'admin-rules-engine-edit',
    component: () => import('@/views/admin/RulesEngineFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminRulesEngineEdit'),
      title: t('routes.adminRulesEngineEdit'),
      parent: 'admin-rules-engine',
    },
  },
  {
    path: 'rules-engine/:id/stats',
    name: 'admin-rules-engine-stats',
    component: () => import('@/views/admin/RulesEngineStatsView.vue'),
    meta: {
      breadcrumb: t('routes.adminRulesEngineStats'),
      title: t('routes.adminRulesEngineStats'),
      parent: 'admin-rules-engine',
    },
  },
  {
    path: 'invitations',
    name: 'admin-invitations',
    component: () => import('@/views/admin/AdminInvitationsView.vue'),
    meta: {
      breadcrumb: t('routes.adminInvitationsBreadcrumb'),
      title: t('routes.adminInvitations'),
      parent: 'admin',
    },
  },
  {
    path: 'organizations',
    name: 'admin-organizations',
    component: () => import('@/views/admin/OrganizationsView.vue'),
    meta: {
      breadcrumb: t('routes.adminOrganizationsBreadcrumb'),
      title: t('routes.adminOrganizations'),
      parent: 'admin',
    },
  },
  {
    path: 'maintenance',
    name: 'admin-maintenance',
    component: () => import('@/views/admin/MaintenanceView.vue'),
    meta: {
      breadcrumb: t('routes.adminMaintenanceBreadcrumb'),
      title: t('routes.adminMaintenance'),
      parent: 'admin',
    },
  },
  {
    path: 'users',
    name: 'admin-users',
    component: () => import('@/views/admin/UsersList.vue'),
    meta: {
      breadcrumb: t('routes.adminUsersBreadcrumb'),
      title: t('routes.adminUsers'),
      parent: 'admin',
    },
  },
  {
    path: 'users/:id/edit',
    name: 'admin-users-edit',
    component: () => import('@/views/admin/UserFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminUsersEdit'),
      title: t('routes.adminUsersEdit'),
      parent: 'admin-users',
    },
  },
  {
    path: 'rules',
    name: 'admin-rules',
    component: () => import('@/views/admin/GameRulesList.vue'),
    meta: {
      breadcrumb: t('routes.adminGameRulesBreadcrumb'),
      title: t('routes.adminGameRules'),
      parent: 'admin',
    },
  },
  {
    path: 'rules/new',
    name: 'admin-rules-new',
    component: () => import('@/views/admin/GameRulesFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminGameRulesNew'),
      title: t('routes.adminGameRulesNew'),
      parent: 'admin-rules',
    },
  },
  {
    path: 'rules/:id/edit',
    name: 'admin-rules-edit',
    component: () => import('@/views/admin/GameRulesFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminGameRulesEdit'),
      title: t('routes.adminGameRulesEdit'),
      parent: 'admin-rules',
    },
  },
  {
    path: 'ranked',
    name: 'admin-ranked',
    component: () => import('@/views/admin/RankedSeasonsList.vue'),
    meta: {
      breadcrumb: t('routes.adminRankedBreadcrumb'),
      title: t('routes.adminRanked'),
      parent: 'admin',
    },
  },
  {
    path: 'ranked/new',
    name: 'admin-ranked-new',
    component: () => import('@/views/admin/RankedSeasonFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminRankedNewBreadcrumb'),
      title: t('routes.adminRankedNew'),
      parent: 'admin-ranked',
    },
  },
  {
    path: 'ranked/:id/edit',
    name: 'admin-ranked-edit',
    component: () => import('@/views/admin/RankedSeasonFormView.vue'),
    meta: {
      breadcrumb: t('routes.adminRankedEditBreadcrumb'),
      title: t('routes.adminRankedEdit'),
      parent: 'admin-ranked',
    },
  },
  {
    path: 'ranked/:id/tiers',
    name: 'admin-ranked-tiers',
    component: () => import('@/views/admin/RankedTiersView.vue'),
    meta: {
      breadcrumb: t('routes.adminRankedTiersBreadcrumb'),
      title: t('routes.adminRankedTiers'),
      parent: 'admin-ranked',
    },
  },
]

export const adminRoute: RouteRecordRaw = {
  path: '/admin',
  component: () => import('@/views/admin/AdminLayout.vue'),
  beforeEnter: requireAdmin,
  // The layout draws its own breadcrumb and page title.
  meta: { requiresAuth: true, hideBreadcrumb: true },
  children,
}
