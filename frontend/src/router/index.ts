/// <reference types="vite/client" />
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { requireAdmin, requireAuth, requireSettingsAccess, redirectIfAuthenticated } from './guards'
import {
  applyUpdate,
  checkVersionThrottled,
  isUpdateDeferred,
  isUpdateForcedPending,
  isUpdatePending,
  isUpdateReady,
  updatesBlocked,
} from '@/composables/pwa/pwa.update'
import { markLeaving } from '@/utils/app-lifecycle'
import { i18n } from '@/i18n'

const t = (key: string) => i18n.global.t(key)

declare module 'vue-router' {
  interface RouteMeta {
    breadcrumb?: string
    title?: string
    hideBreadcrumb?: boolean
    parent?: string
    requiresAuth?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/public',
    name: 'home',
    component: () => import('@/views/PublicHomeView.vue'),
    meta: {
      breadcrumb: t('routes.home'),
      title: t('routes.home'),
      hideBreadcrumb: true,
    },
  },

  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    beforeEnter: redirectIfAuthenticated,
    meta: {
      breadcrumb: t('routes.login'),
      title: t('routes.login'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('@/views/SignupView.vue'),
    beforeEnter: redirectIfAuthenticated,
    meta: {
      breadcrumb: t('routes.signup'),
      title: t('routes.signup'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    beforeEnter: redirectIfAuthenticated,
    meta: {
      breadcrumb: t('routes.signup'),
      title: t('routes.signup'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/submit-invitation',
    name: 'submit-invitation',
    component: () => import('@/views/SubmitInvitationView.vue'),
    meta: {
      breadcrumb: t('routes.invitationCode'),
      title: t('routes.invitationCode'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    beforeEnter: redirectIfAuthenticated,
    meta: {
      breadcrumb: t('routes.forgotPassword'),
      title: t('routes.forgotPassword'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    beforeEnter: redirectIfAuthenticated,
    meta: {
      breadcrumb: t('routes.resetPassword'),
      title: t('routes.resetPassword'),
      hideBreadcrumb: true,
    },
  },

  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/admin/AdminView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.admin'),
      title: t('routes.admin'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },

  {
    path: '/admin/tournaments',
    name: 'admin-tournaments',
    component: () => import('@/views/admin/TournamentList.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminTournaments'),
      title: t('routes.adminTournaments'),
      requiresAuth: true,
      parent: 'admin',
    },
  },

  {
    path: '/admin/tournaments/new',
    name: 'admin-tournament-new',
    component: () => import('@/views/admin/TournamentFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.editBreadcrumb'),
      title: t('routes.adminTournamentEdit'),
      requiresAuth: true,
      parent: 'admin-tournaments',
    },
  },
  {
    path: '/admin/tournaments/:id/edit',
    name: 'admin-tournament-edit',
    component: () => import('@/views/admin/TournamentFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.editBreadcrumb'),
      title: t('routes.adminTournamentEdit'),
      requiresAuth: true,
      parent: 'admin-tournaments',
    },
  },
  {
    path: '/admin/disciplines',
    name: 'admin-disciplines',
    component: () => import('@/views/admin/DisciplineList.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminDisciplines'),
      title: t('routes.adminDisciplines'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/disciplines/:id',
    name: 'admin-discipline-edit',
    component: () => import('@/views/admin/DisciplineFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.editBreadcrumb'),
      title: t('routes.adminDisciplineEdit'),
      requiresAuth: true,
      parent: 'admin-disciplines',
    },
  },
  {
    path: '/admin/rules-engine',
    name: 'admin-rules-engine',
    component: () => import('@/views/admin/RulesEngineList.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRulesEngine'),
      title: t('routes.adminRulesEngine'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/rules-engine/new',
    name: 'admin-rules-engine-new',
    component: () => import('@/views/admin/RulesEngineFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRulesEngineNew'),
      title: t('routes.adminRulesEngineNew'),
      requiresAuth: true,
      parent: 'admin-rules-engine',
    },
  },
  {
    path: '/admin/rules-engine/:id/edit',
    name: 'admin-rules-engine-edit',
    component: () => import('@/views/admin/RulesEngineFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRulesEngineEdit'),
      title: t('routes.adminRulesEngineEdit'),
      requiresAuth: true,
      parent: 'admin-rules-engine',
    },
  },
  {
    path: '/admin/rules-engine/:id/stats',
    name: 'admin-rules-engine-stats',
    component: () => import('@/views/admin/RulesEngineStatsView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRulesEngineStats'),
      title: t('routes.adminRulesEngineStats'),
      requiresAuth: true,
      parent: 'admin-rules-engine',
    },
  },
  {
    path: '/admin/invitations',
    name: 'admin-invitations',
    component: () => import('@/views/admin/AdminInvitationsView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminInvitationsBreadcrumb'),
      title: t('routes.adminInvitations'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/organizations',
    name: 'admin-organizations',
    component: () => import('@/views/admin/OrganizationsView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminOrganizationsBreadcrumb'),
      title: t('routes.adminOrganizations'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/maintenance',
    name: 'admin-maintenance',
    component: () => import('@/views/admin/MaintenanceView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminMaintenanceBreadcrumb'),
      title: t('routes.adminMaintenance'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/admin/UsersList.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminUsersBreadcrumb'),
      title: t('routes.adminUsers'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/users/:id/edit',
    name: 'admin-users-edit',
    component: () => import('@/views/admin/UserFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminUsersEdit'),
      title: t('routes.adminUsersEdit'),
      requiresAuth: true,
      parent: 'admin-users',
    },
  },
  {
    path: '/admin/rules',
    name: 'admin-rules',
    component: () => import('@/views/admin/GameRulesList.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminGameRulesBreadcrumb'),
      title: t('routes.adminGameRules'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/rules/new',
    name: 'admin-rules-new',
    component: () => import('@/views/admin/GameRulesFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminGameRulesNew'),
      title: t('routes.adminGameRulesNew'),
      requiresAuth: true,
      parent: 'admin-rules',
    },
  },
  {
    path: '/admin/rules/:id/edit',
    name: 'admin-rules-edit',
    component: () => import('@/views/admin/GameRulesFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminGameRulesEdit'),
      title: t('routes.adminGameRulesEdit'),
      requiresAuth: true,
      parent: 'admin-rules',
    },
  },
  {
    path: '/admin/ranked',
    name: 'admin-ranked',
    component: () => import('@/views/admin/RankedSeasonsList.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRankedBreadcrumb'),
      title: t('routes.adminRanked'),
      requiresAuth: true,
      parent: 'admin',
    },
  },
  {
    path: '/admin/ranked/new',
    name: 'admin-ranked-new',
    component: () => import('@/views/admin/RankedSeasonFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRankedNewBreadcrumb'),
      title: t('routes.adminRankedNew'),
      requiresAuth: true,
      parent: 'admin-ranked',
    },
  },
  {
    path: '/admin/ranked/:id/edit',
    name: 'admin-ranked-edit',
    component: () => import('@/views/admin/RankedSeasonFormView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRankedEditBreadcrumb'),
      title: t('routes.adminRankedEdit'),
      requiresAuth: true,
      parent: 'admin-ranked',
    },
  },
  {
    path: '/admin/ranked/:id/tiers',
    name: 'admin-ranked-tiers',
    component: () => import('@/views/admin/RankedTiersView.vue'),
    beforeEnter: requireAdmin,
    meta: {
      breadcrumb: t('routes.adminRankedTiersBreadcrumb'),
      title: t('routes.adminRankedTiers'),
      requiresAuth: true,
      parent: 'admin-ranked',
    },
  },
  {
    path: '/ranked/:id',
    redirect: (to) => ({ path: `/tournaments/${to.params.id}` }),
  },
  {
    path: '/rewinds',
    name: 'rewinds',
    component: () => import('@/views/RewindArchiveView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.rewinds'),
      requiresAuth: true,
      hideBreadcrumb: true,
    },
  },
  {
    path: '/',
    name: 'tournaments',
    component: () => import('@/views/TournamentsView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.tournaments'),
      requiresAuth: true,
      hideBreadcrumb: true,
    },
  },
  {
    path: '/tournaments/:id',
    component: () => import('@/views/TournamentDetailView.vue'),
    beforeEnter: requireAuth,
    meta: {
      breadcrumb: t('routes.tournamentDetail'),
      title: t('routes.tournamentDetail'),
      requiresAuth: true,
      parent: 'tournaments',
      hideBreadcrumb: true,
    },
    children: [
      {
        path: '',
        name: 'tournament-detail',
        component: () => import('@/views/tournament/tabs/TournamentTabView.vue'),
      },
      {
        path: ':tab',
        name: 'tournament-tab',
        component: () => import('@/views/tournament/tabs/TournamentTabView.vue'),
        meta: { hideBreadcrumb: true },
      },
    ],
  },
  {
    path: '/tournaments/:tournamentId/create-match',
    name: 'create-match',
    component: () => import('@/views/CreateMatchView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.createMatch'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },
  {
    path: '/matches/:id',
    name: 'match-detail',
    component: () => import('@/views/MatchDetailView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.matchDetail'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },
  {
    path: '/players/compare',
    name: 'player-compare',
    component: () => import('@/views/PlayerComparisonView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.playerCompare'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },
  {
    path: '/players/:id',
    name: 'player-detail',
    component: () => import('@/views/PlayerDetailView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.playerDetail'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },
  {
    path: '/tournaments/:id/rules',
    name: 'tournament-rules',
    component: () => import('@/views/TournamentRulesView.vue'),
    meta: {
      title: t('routes.rules'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/rules/:id',
    name: 'rules-detail',
    component: () => import('@/views/RulesView.vue'),
    meta: {
      title: t('routes.rules'),
      hideBreadcrumb: true,
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    beforeEnter: requireSettingsAccess,
    meta: {
      title: t('routes.settings'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/views/NotificationsView.vue'),
    beforeEnter: requireAuth,
    meta: {
      title: t('routes.notifications'),
      hideBreadcrumb: true,
      requiresAuth: true,
    },
  },
  {
    path: '/offline',
    name: 'offline',
    component: () => import('@/views/OfflineView.vue'),
    meta: { title: t('routes.offline'), hideBreadcrumb: true },
  },
  {
    path: '/debug',
    name: 'debug',
    component: () => import('@/views/DragDropDebugView.vue'),
    meta: { title: 'Debug DnD', hideBreadcrumb: true },
  },
  /** all ERROR */
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: {
      title: t('routes.notFound'),
      hideBreadcrumb: true,
    },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  if (to.name === 'offline') return true
  if (!navigator.onLine) {
    return { name: 'offline', query: { redirect: to.fullPath } }
  }

  // Switching screens is the one moment where reloading costs the user nothing:
  // they were leaving the view anyway. Cancel the vue-router navigation, since
  // applyUpdate reloads straight onto the destination.
  if (isUpdatePending() && !updatesBlocked()) {
    // A mandatory update interrupts even when the bundle is still downloading: the
    // user waits it out in front of the real progress. A routine one only interrupts
    // once applying costs nothing but a reload — otherwise let them navigate, this
    // guard runs again on the next move, by which time the worker is usually ready.
    // Deferred is the exception either way: they asked to keep browsing (or the
    // download failed), so nothing happens until the new bundle is actually there.
    const shouldApply = isUpdateForcedPending() ? !isUpdateDeferred() : isUpdateReady()
    if (shouldApply) {
      void applyUpdate(to.fullPath)
      return false
    }
  }

  void checkVersionThrottled()
})

// A lazy view import can fail when the served chunks have changed
// (prod redeploy, vite dev server dep re-optimization):
// we reload the page directly to the destination.
router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module')
  ) {
    markLeaving()
    window.location.href = to.fullPath
  }
})

export default router
