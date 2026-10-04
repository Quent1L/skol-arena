<template>
  <header class="shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <RouterLink to="/" class="flex items-center gap-2 cursor-pointer">
          <!-- No manual nudge: the row already centres both children. The old
               logo carried uneven internal padding and `mt-2` compensated for
               it, which now just pushes the chevron off the line. -->
          <i v-if="showBackButton" class="fa fa-chevron-left text-lg text-gray-400"></i>
          <!-- ARENA and its two rules land at ~7px of cap height and ~1.4px of
               rule here: noise that shimmers with DPI rather than anything
               legible. The header keeps the monogram and SKOL at every width,
               just narrower on phones. -->
          <SkolLogo :variant="'compact'" :width="isMobile ? 104 : 132" />
        </RouterLink>

        <div class="flex items-center gap-3">
          <div v-if="!isAuthenticated" class="flex items-center gap-3">
            <Button :label="t('appHeader.signIn')" text @click="handleLoginTap" />
            <Button
              :label="t('appHeader.signUp')"
              @click="router.push('/signup')"
              class="text-sm"
            />
          </div>

          <div v-else class="flex items-center gap-3">
            <NotificationBell @toggle="toggleNotifications" />
            <NotificationDropdown ref="notifDropdown" />

            <Menu ref="menu" :model="menuItems" :popup="true">
              <template #start>
                <div class="px-4 py-3 border-b border-gray-200">
                  <p class="text-sm font-medium">
                    {{ appUser?.displayName }}
                  </p>
                  <p class="text-xs text-gray-500 mt-0.5">{{ appUser?.betterAuth?.email }}</p>
                </div>
              </template>
              <template #itemicon="{ item }">
                <span class="relative inline-flex">
                  <i :class="item.icon"></i>
                  <span
                    v-if="item.key === 'whats-new' && whatsNew.hasUnseen.value"
                    class="unseen-dot -top-1 -right-1.5"
                    data-testid="whats-new-dot"
                  ></span>
                </span>
              </template>
              <template #end>
                <div
                  class="app-version w-full flex justify-center text-xs text-gray-500 h-7 pt-2 select-none"
                  :class="{ 'is-armed': eggTaps >= EGG_HINT_AT }"
                  @click="tapVersion"
                >
                  {{ t('appHeader.version', { version: appVersion }) }}
                </div>
              </template>
            </Menu>

            <Button
              text
              rounded
              @click="toggleMenu"
              class="flex items-center gap-2"
              :aria-label="userMenuLabel"
            >
              <span class="relative inline-flex">
                <PlayerAvatar
                  v-if="appUser"
                  :name="appUser.displayName || appUser.betterAuth?.email || '?'"
                  :player-id="appUser.id"
                  size="sm"
                />
                <span
                  v-if="showWhatsNew && whatsNew.hasUnseen.value"
                  class="unseen-dot top-0 right-0 ring-2 ring-white dark:ring-gray-900"
                  data-testid="avatar-whats-new-dot"
                ></span>
              </span>
              <span class="hidden sm:block text-sm font-medium">
                {{ appUser?.displayName }}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useEasterEgg } from '@/composables/useEasterEgg'
import { useSecretTap } from '@/composables/useSecretTap'
import { useViewport } from '@/composables/useViewport'
import type { MenuItem } from 'primevue/menuitem'
import NotificationBell from './NotificationBell.vue'
import NotificationDropdown from './NotificationDropdown.vue'
import SkolLogo from '@/components/brand/SkolLogo.vue'
import PlayerAvatar from './PlayerAvatar.vue'
import { useWhatsNew } from '@/composables/whats-new/useWhatsNew'

const { t } = useI18n()

const appVersion = __APP_VERSION__

/** Taps needed to unlock, and the tap the version starts hinting from. */
const EGG_TAPS = 5
const EGG_HINT_AT = 3

const { play: playEasterEgg } = useEasterEgg()
const { tap: tapVersion, count: eggTaps } = useSecretTap(EGG_TAPS, playEasterEgg)

const route = useRoute()
const router = useRouter()
const { appUser, isAuthenticated, logout, kioskSettingsLocked } = useAuth()
const { isMobile } = useViewport()
const showBackButton = computed(
  () =>
    isMobile.value &&
    (route.name === 'tournament-detail' || route.name === 'tournament-tab') &&
    !route.path.includes('/badges') &&
    !route.path.includes('/teams'),
)
const menu = ref()
const notifDropdown = useTemplateRef('notifDropdown')

const whatsNew = useWhatsNew()
// A kiosk is a shared screen, not a person catching up on the news.
const showWhatsNew = computed(() => appUser.value?.role !== 'kiosk')
// The badge alone says nothing to a screen reader.
const userMenuLabel = computed(() =>
  showWhatsNew.value && whatsNew.hasUnseen.value
    ? `${t('appHeader.userMenuAriaLabel')} — ${t('appHeader.whatsNewAvailable')}`
    : t('appHeader.userMenuAriaLabel'),
)

const menuItems = computed<MenuItem[]>(() => [
  {
    label: t('appHeader.menu.myStats'),
    icon: 'fas fa-chart-bar',
    command: () => {
      router.push(`/players/${appUser.value?.id}`)
    },
    visible: appUser.value?.role !== 'kiosk',
  },
  {
    label: t('appHeader.menu.comparePlayers'),
    icon: 'fas fa-people-arrows',
    command: () => {
      router.push({ name: 'player-compare' })
    },
    visible: appUser.value?.role !== 'kiosk',
  },
  {
    label: t('appHeader.menu.rewinds'),
    icon: 'fas fa-film',
    command: () => {
      router.push({ name: 'rewinds' })
    },
    visible: appUser.value?.role !== 'kiosk',
  },
  {
    key: 'whats-new',
    label: t('appHeader.menu.whatsNew'),
    icon: 'fas fa-gift',
    command: () => {
      whatsNew.open()
    },
    visible: showWhatsNew.value,
  },
  {
    label: t('appHeader.menu.settings'),
    icon: 'fas fa-cog',
    command: () => {
      router.push('/settings')
    },
    visible: !(appUser.value?.role === 'kiosk' && kioskSettingsLocked.value),
  },
  {
    separator: true,
    visible: !(appUser.value?.role === 'kiosk' && kioskSettingsLocked.value),
  },
  {
    label: t('appHeader.menu.logout'),
    icon: 'fas fa-right-from-bracket',
    command: () => {
      handleLogout()
    },
    class: 'text-red-600',
  },
])

const { tap: tapLogin } = useSecretTap(5, () => router.push('/login?native=true'), {
  windowMs: 3000,
})

function handleLoginTap() {
  // Every tap is still a normal trip to /login — except the one that unlocks the
  // native form, which supersedes it.
  if (tapLogin()) return
  router.push('/login')
}

function toggleMenu(event: Event) {
  menu.value.toggle(event)
}

/**
 * The await is load-bearing: /login is behind `redirectIfAuthenticated`, so
 * navigating before `signOut()` has resolved leaves the session still set and
 * the guard bounces the user straight back into the app.
 * `replace` rather than `push`, so Back does not lead into a logged-out shell.
 */
async function handleLogout() {
  try {
    await logout()
  } catch {
    // The error is already surfaced through the auth state. Either way the user
    // asked to leave, so send them out instead of stranding them mid-session.
  }
  await router.replace('/login')
}

function toggleNotifications(event: Event) {
  notifDropdown.value?.toggle(event)
}
</script>

<style scoped>
.unseen-dot {
  position: absolute;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background-color: var(--p-red-500);
}

/* The version line doubles as a hidden trigger. It stays inert-looking until a
   few taps in, then leans in — enough to reward someone who is poking at it,
   invisible to everyone else. */
.app-version {
  cursor: default;
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

.app-version.is-armed {
  color: #a95ef9;
  transform: scale(1.08);
}

@media (prefers-reduced-motion: reduce) {
  .app-version {
    transition: color 0.2s ease;
  }

  .app-version.is-armed {
    transform: none;
  }
}
</style>
