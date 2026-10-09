<template>
  <div class="mx-auto w-full max-w-6xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
    <!-- Greeting -->
    <div class="flex items-center gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
        <span class="wave-hand text-3xl leading-none">👋</span>
      </span>
      <h1
        class="font-headline min-w-0 flex-1 truncate text-xl font-black tracking-tight text-white sm:text-2xl"
      >
        {{ greeting }}
      </h1>
      <UTooltip v-if="canManageTournaments" :text="t('tournamentsView.adminTooltip')">
        <UButton
          icon="i-fa7-solid:gears"
          variant="ghost"
          size="lg"
          class="rounded-full"
          :aria-label="t('tournamentsView.adminTooltip')"
          to="/admin"
        />
      </UTooltip>
    </div>

    <RewindPromoCard />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error"
      close
      @update:open="error = null"
    />

    <!-- Loading skeleton, shaped like the sections it replaces -->
    <template v-if="isLoading">
      <div class="space-y-3">
        <USkeleton class="h-[1.25rem] w-[12rem]" />
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <USkeleton v-for="i in 3" :key="i" class="h-[10.5rem] w-full rounded-xl!" />
        </div>
      </div>
    </template>

    <template v-else>
      <!-- My events. Dropped entirely when empty: a player with nothing joined
           should land straight on what there is to join. -->
      <section v-if="myEvents.length > 0" class="space-y-3">
        <SectionHeader
          icon="fa fa-user-check"
          :title="t('tournamentsView.myEvents.title')"
          :count="myEvents.length"
        />

        <!-- Same container as the discover grid: a carousel here would size its
             cards off a different width and the two sections would not match. -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <TournamentCard
            v-for="event in myEvents"
            :key="event.id"
            :tournament="event"
            variant="featured"
            @click="navigateToEvent(event)"
          />
        </div>
      </section>

      <!-- Filters -->
      <div
        v-if="modeFilters.length > 0 || disciplineFilters.length > 0"
        class="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        <button
          v-for="tag in modeFilters"
          :key="`mode-${tag.key}`"
          type="button"
          class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 transition-all duration-150 active:scale-95"
          :class="chipClass(selectedModes.includes(tag.key))"
          :aria-pressed="selectedModes.includes(tag.key)"
          @click="toggleMode(tag.key)"
        >
          <i :class="tag.icon" class="text-xs"></i>
          <span class="font-label text-xs font-bold uppercase tracking-wider">{{ tag.label }}</span>
        </button>

        <span
          v-if="modeFilters.length > 0 && disciplineFilters.length > 0"
          class="h-5 w-px shrink-0 bg-slate-700/40"
          aria-hidden="true"
        />

        <button
          v-for="discipline in disciplineFilters"
          :key="`discipline-${discipline.key}`"
          type="button"
          class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 transition-all duration-150 active:scale-95"
          :class="chipClass(selectedDisciplines.includes(discipline.key))"
          :aria-pressed="selectedDisciplines.includes(discipline.key)"
          @click="toggleDiscipline(discipline.key)"
        >
          <i :class="discipline.icon" class="text-xs"></i>
          <span class="font-label text-xs font-bold uppercase tracking-wider">{{
            discipline.label
          }}</span>
        </button>

        <button
          v-if="hasActiveFilters"
          type="button"
          class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-700/20 bg-slate-800 px-4 py-1.5 text-muted transition-all duration-150 active:scale-95"
          @click="clearFilters"
        >
          <i class="fa fa-filter-circle-xmark text-xs"></i>
          <span class="font-label text-xs font-bold uppercase tracking-wider">{{
            t('tournamentsView.filters.reset')
          }}</span>
        </button>
      </div>

      <!-- Discover. Dropped when empty, but only once the player already has
           something above: with both sections gone the page would read as broken,
           so an empty hub still explains itself here. Kept as well when a filter
           is what emptied it, so the player can see why and reset. -->
      <section v-if="showDiscover" class="space-y-3">
        <SectionHeader
          icon="fa fa-compass"
          :title="t('tournamentsView.discover.title')"
          :count="discoverEvents.length || undefined"
        />

        <div
          v-if="discoverEvents.length > 0"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
        >
          <TournamentCard
            v-for="event in discoverEvents"
            :key="event.id"
            :tournament="event"
            @click="navigateToEvent(event)"
          />
        </div>

        <EmptyState
          v-else
          icon="fa fa-trophy"
          :title="t('tournamentsView.empty.title')"
          :message="
            hasActiveFilters
              ? t('tournamentsView.empty.withFilters')
              : t('tournamentsView.empty.noFilters')
          "
          :action-label="hasActiveFilters ? t('tournamentsView.clearFilters') : undefined"
          action-icon="fa fa-filter-circle-xmark"
          @action="clearFilters"
        />
      </section>

      <!-- Archives -->
      <section v-if="archivedEvents.length > 0">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-700/20 bg-slate-800 px-4 py-3 transition-colors hover:bg-slate-700"
          :aria-expanded="archivesOpen"
          @click="archivesOpen = !archivesOpen"
        >
          <i class="fa fa-box-archive text-muted" aria-hidden="true"></i>
          <span class="text-sm font-semibold text-white">
            {{ t('tournamentsView.archives.toggle', { count: archivedEvents.length }) }}
          </span>
          <i
            class="fa fa-chevron-down ml-auto text-xs text-muted transition-transform duration-200"
            :class="{ 'rotate-180': archivesOpen }"
            aria-hidden="true"
          ></i>
        </button>

        <div
          v-if="archivesOpen"
          class="mt-2 overflow-hidden rounded-xl border border-slate-700/20 bg-slate-800"
        >
          <TournamentRow
            v-for="event in archivedEvents"
            :key="event.id"
            :tournament="event"
            @click="navigateToEvent(event)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import { useRankedService } from '@/composables/ranked/ranked.service'
import { useAuth } from '@/composables/useAuth'
import TournamentCard from '@/components/TournamentCard.vue'
import TournamentRow from '@/components/tournament/TournamentRow.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RewindPromoCard from '@/components/rewind/RewindPromoCard.vue'
import type { ClientTournamentSummary } from '@skol-arena/shared'

/**
 * A season that just ended is exactly when players come back to read the final
 * standings and their rewind, so a freshly finished event keeps its place in the
 * live sections instead of dropping straight into the archives.
 */
const RECENTLY_FINISHED_DAYS = 7
const GRACE_PERIOD_MS = RECENTLY_FINISHED_DAYS * 86_400_000

const GREETING_KEYS = ['salut', 'hey', 're', 'welcomeBack', 'goodToSeeYou'] as const

const router = useRouter()
const { t } = useI18n()
const { tournaments, loading, error, listTournaments } = useTournamentService()
const { seasons, loading: seasonsLoading, loadSeasons } = useRankedService()
const { appUser, isSuperAdmin, isAuthenticated } = useAuth()

const selectedModes = ref<string[]>([])
const selectedDisciplines = ref<string[]>([])
const archivesOpen = ref(false)

const canManageTournaments = computed(() => isAuthenticated.value && isSuperAdmin.value)
const isLoading = computed(() => loading.value || seasonsLoading.value)

const displayName = computed(() => appUser.value?.displayName ?? '')
const firstName = computed(() => {
  return displayName.value.trim().split(/\s+/)[0]
})

// Drawn once when the view is created rather than inside the computed, so the
// greeting does not reshuffle on every unrelated re-render.
const greetingKey = GREETING_KEYS[Math.floor(Math.random() * GREETING_KEYS.length)]
const greeting = computed(() =>
  t(`tournamentsView.greetings.${greetingKey}`, { name: firstName.value }),
)

// `endDate` stands in for a finish timestamp, which the schema does not carry. A
// season stopped ahead of its planned end yields a negative delta and therefore
// counts as recent, which is the behaviour we want.
const isRecentlyFinished = (event: ClientTournamentSummary) =>
  event.status === 'finished' && Date.now() - new Date(event.endDate).getTime() < GRACE_PERIOD_MS

const isLive = (event: ClientTournamentSummary) => ['open', 'ongoing'].includes(event.status)

const allEvents = computed<ClientTournamentSummary[]>(() => {
  const visibleSeasons = isSuperAdmin.value
    ? seasons.value
    : seasons.value.filter((season) => season.status !== 'draft')

  // Live first, then the grace-period leftovers, each group most recent first.
  return [...tournaments.value, ...visibleSeasons].sort((a, b) => {
    const byGroup = Number(!isLive(a)) - Number(!isLive(b))
    if (byGroup !== 0) return byGroup
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  })
})

const relevantEvents = computed(() =>
  allEvents.value.filter((event) => isLive(event) || isRecentlyFinished(event)),
)

const myEvents = computed(() => relevantEvents.value.filter((event) => event.isParticipant))

/**
 * Everything the chips can actually act on. The joined events sit in their own
 * section above and are never filtered, so deriving the chips from the full list
 * would offer a mode or a discipline that can only ever return nothing.
 * Derived before the selection is applied, otherwise picking one chip would make
 * the others vanish.
 */
const discoverableEvents = computed(() =>
  relevantEvents.value.filter((event) => !event.isParticipant),
)

const modeFilters = computed(() => {
  const modes = new Set(discoverableEvents.value.map((event) => event.mode))
  return [
    { key: 'ranked', label: t('tournamentsView.tags.ranked'), icon: 'fa fa-ranking-star' },
    { key: 'championship', label: t('tournamentsView.tags.championship'), icon: 'fa fa-trophy' },
    { key: 'bracket', label: t('tournamentsView.tags.bracket'), icon: 'fa fa-sitemap' },
  ].filter((tag) => modes.has(tag.key as ClientTournamentSummary['mode']))
})

const disciplineFilters = computed(() => {
  const byId = new Map<string, { key: string; label: string; icon: string }>()
  for (const event of discoverableEvents.value) {
    if (!event.discipline || byId.has(event.discipline.id)) continue
    byId.set(event.discipline.id, {
      key: event.discipline.id,
      label: event.discipline.name,
      icon: event.discipline.icon || 'fa fa-gamepad',
    })
  }
  // A single discipline is not a choice, it is noise.
  return byId.size > 1 ? [...byId.values()] : []
})

const hasActiveFilters = computed(
  () => selectedModes.value.length > 0 || selectedDisciplines.value.length > 0,
)

const discoverEvents = computed(() =>
  discoverableEvents.value.filter((event) => {
    if (selectedModes.value.length > 0 && !selectedModes.value.includes(event.mode)) return false
    return (
      selectedDisciplines.value.length === 0 ||
      selectedDisciplines.value.includes(event.discipline?.id ?? '')
    )
  }),
)

const archivedEvents = computed(() =>
  allEvents.value.filter((event) => event.status === 'finished' && !isRecentlyFinished(event)),
)

const showDiscover = computed(
  () => discoverEvents.value.length > 0 || hasActiveFilters.value || myEvents.value.length === 0,
)

function chipClass(active: boolean): string {
  return active
    ? 'bg-primary border-primary text-primary-contrast'
    : 'bg-slate-800 border-slate-700/20 text-muted'
}

function toggle(list: Ref<string[]>, key: string) {
  const index = list.value.indexOf(key)
  if (index === -1) list.value.push(key)
  else list.value.splice(index, 1)
}

const toggleMode = (key: string) => toggle(selectedModes, key)
const toggleDiscipline = (key: string) => toggle(selectedDisciplines, key)

function clearFilters() {
  selectedModes.value = []
  selectedDisciplines.value = []
}

function navigateToEvent(event: ClientTournamentSummary) {
  if (event.mode === 'ranked') router.push(`/ranked/${event.id}`)
  else router.push(`/tournaments/${event.id}`)
}

onMounted(() => {
  Promise.all([listTournaments(), loadSeasons()])
})
</script>

<style scoped>
/* Waves twice on arrival, then holds the resting tilt.
   `forwards` matters: without it the element hands back to the base rule when
   the animation ends, and that hand-off is what makes the hand hop. The last
   keyframe stays applied instead, so the animated and the idle states are the
   very same computed transform.
   The origin sits at the wrist, so the pivot stays put and only the fingers
   travel, which is what reads as a wave rather than a tilting sticker.
   The tilt is repeated on the base rule for the prefers-reduced-motion case in
   main.css, where the animation is collapsed to nothing. */
.wave-hand {
  display: inline-block;
  transform: rotate(12deg);
  transform-origin: 50% 90%;
  animation: wave 1.8s ease-in-out 1 forwards;
}

@keyframes wave {
  0%,
  60%,
  100% {
    transform: rotate(12deg);
  }
  10%,
  30%,
  50% {
    transform: rotate(28deg);
  }
  20%,
  40% {
    transform: rotate(-4deg);
  }
}
</style>
