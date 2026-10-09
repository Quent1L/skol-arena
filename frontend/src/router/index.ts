/// <reference types="vite/client" />
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { requireAuth, requireSettingsAccess, redirectIfAuthenticated } from './guards'
import {
  applyUpdate,
  checkVersionThrottled,
  isUpdateDeferred,
  isUpdateForcedPending,
  isUpdatePending,
  isUpdateReady,
  updatesBlocked,
} from '@/composables/pwa/pwa.update'
import { isStaleChunkError, recoverFromStaleChunk } from '@/composables/pwa/stale-chunk'
import { i18n } from '@/i18n'
import { adminRoute } from './admin-routes'

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

  adminRoute,
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
  if (isStaleChunkError(error)) void recoverFromStaleChunk(to.fullPath)
})

export default router
