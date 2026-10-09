<template>
  <div class="rewind-archive">
    <div class="mb-6">
      <h1 class="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
        {{ t('rewind.archive.title') }}
      </h1>
      <p class="text-gray-600 dark:text-gray-400">{{ t('rewind.archive.subtitle') }}</p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      class="mb-6"
      :title="error"
      close
      @update:open="error = null"
    />

    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
    </div>

    <div v-else-if="groups.length > 0" class="flex flex-col gap-8">
      <section v-for="group in groups" :key="group.discipline ?? 'none'">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {{ group.discipline ?? t('rewind.archive.noDiscipline') }}
        </h2>

        <div class="flex flex-col gap-2">
          <button
            v-for="entry in group.entries"
            :key="entry.seasonId"
            class="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500"
            @click="play(entry.seasonId)"
          >
            <i class="fa fa-film text-xl text-indigo-500 dark:text-indigo-300" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-semibold text-gray-900 dark:text-white">
                  {{ entry.seasonName }}
                </span>
                <span
                  v-if="!entry.viewedAt"
                  class="shrink-0 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                >
                  {{ t('rewind.archive.unwatched') }}
                </span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(entry.startDate) }} – {{ formatDate(entry.endDate) }}
              </div>
            </div>

            <i class="fa fa-play text-sm text-gray-400" />
          </button>
        </div>
      </section>
    </div>

    <UCard v-else variant="soft" class="py-12 text-center">
        <div class="space-y-4">
          <i class="fa fa-film block text-4xl text-gray-400" />
          <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300">
            {{ t('rewind.archive.empty.title') }}
          </h3>
          <p class="text-gray-500 dark:text-gray-400">{{ t('rewind.archive.empty.hint') }}</p>
        </div>
    </UCard>

    <RewindLauncher v-model:open="open" :season-id="activeSeasonId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatRewindDate,
  groupArchiveByDiscipline,
  useRewindService,
} from '@/composables/ranked/rewind.service'
import RewindLauncher from '@/components/rewind/RewindLauncher.vue'

const { t, locale } = useI18n()
const { archive, loading, error, loadArchive } = useRewindService()

const open = ref(false)
const activeSeasonId = ref<string | null>(null)

const groups = computed(() => groupArchiveByDiscipline(archive.value))

function formatDate(value: Date): string {
  return formatRewindDate(value, locale.value)
}

function play(seasonId: string): void {
  activeSeasonId.value = seasonId
  open.value = true
}

onMounted(loadArchive)
</script>

<style scoped>
.rewind-archive {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
}

@media (max-width: 640px) {
  .rewind-archive {
    padding: 1rem;
  }
}
</style>
