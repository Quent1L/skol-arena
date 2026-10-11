<template>
  <div>
    <AdminPageHeader
      :title="t('maintenanceView.title')"
      :description="t('maintenanceView.subtitle')"
    >
      <template #actions>
        <UButton
          :label="t('maintenanceView.refresh')"
          icon="i-fa7-solid:rotate"
          color="neutral"
          variant="soft"
          :loading="loading"
          @click="loadSystemInfo"
        />
      </template>
    </AdminPageHeader>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <div v-if="info" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Avatar storage -->
      <UCard class="lg:col-span-2" data-testid="avatar-storage-card">
        <template #header>
          <h2 class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon name="i-fa7-solid:image" />{{ t('maintenanceView.avatars.title') }}
          </h2>
        </template>
        <UAlert
          v-if="hasStrandedAvatars"
          color="warning"
          variant="subtle"
          icon="i-fa7-solid:triangle-exclamation"
          class="mb-4"
          :description="
            t('maintenanceView.avatars.mismatch', {
              stranded: info.avatarStorage.strandedDrivers.join(', '),
              driver: info.avatarStorage.driver,
            })
          "
        />
        <dl
          class="grid grid-cols-2 gap-x-4 sm:grid-cols-[max-content_1fr] sm:gap-x-6 gap-y-2 text-sm [&>dt]:text-muted [&>dd]:break-words [&>dd]:min-w-0"
        >
          <dt>{{ t('maintenanceView.avatars.driver') }}</dt>
          <dd><UBadge :label="info.avatarStorage.driver" variant="subtle" /></dd>
          <dt>{{ t('maintenanceView.avatars.total') }}</dt>
          <dd>{{ info.avatarStorage.total }}</dd>
          <dt>{{ t('maintenanceView.avatars.inActive') }}</dt>
          <dd>{{ info.avatarStorage.inActive }}</dd>
          <template v-for="entry in info.avatarStorage.stranded" :key="entry.driver">
            <dt>{{ t('maintenanceView.avatars.inOther', { driver: entry.driver }) }}</dt>
            <dd>{{ entry.count }}</dd>
          </template>
          <dt>{{ t('maintenanceView.avatars.missing') }}</dt>
          <dd>{{ info.avatarStorage.missing }}</dd>
        </dl>
        <UAlert
          v-if="lastMigration"
          :color="lastMigration.failed > 0 ? 'warning' : 'success'"
          variant="subtle"
          class="mt-4"
          :description="t('maintenanceService.migrationDetail', lastMigration)"
        />
        <UButton
          v-if="hasStrandedAvatars"
          class="mt-4 w-full justify-center sm:w-auto"
          icon="i-fa7-solid:right-left"
          color="warning"
          data-testid="migrate-avatars"
          :label="t('maintenanceView.avatars.migrate', { driver: info.avatarStorage.driver })"
          :loading="migrating"
          @click="confirmMigration"
        />
      </UCard>

      <!-- Application -->
      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon name="i-fa7-solid:cube" />{{ t('maintenanceView.app.title') }}
          </h2>
        </template>
        <dl
          class="grid grid-cols-2 gap-x-4 sm:grid-cols-[max-content_1fr] sm:gap-x-6 gap-y-2 text-sm [&>dt]:text-muted [&>dd]:break-words [&>dd]:min-w-0"
        >
          <dt>{{ t('maintenanceView.app.version') }}</dt>
          <dd data-testid="app-version">
            {{ deployedVersion }}
            <UBadge
              v-if="staleClient"
              color="warning"
              variant="subtle"
              class="ms-2"
              :label="t('maintenanceView.app.staleClient', { version: clientVersion })"
            />
          </dd>
          <dt>Bun</dt>
          <dd>{{ info.application.bunVersion }}</dd>
          <dt>{{ t('maintenanceView.app.startedAt') }}</dt>
          <dd>{{ dateToStringDDMMYYYYHHMM(info.application.startedAt) }}</dd>
          <dt>{{ t('maintenanceView.app.apiVersions') }}</dt>
          <dd>
            {{ info.application.apiVersions.join(', ') }}
            ({{ t('maintenanceView.app.latest', { version: info.application.latestApiVersion }) }})
          </dd>
        </dl>
      </UCard>

      <!-- Database -->
      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon name="i-fa7-solid:database" />{{ t('maintenanceView.db.title') }}
          </h2>
        </template>
        <dl
          class="mb-4 grid grid-cols-2 gap-x-4 sm:grid-cols-[max-content_1fr] sm:gap-x-6 gap-y-2 text-sm [&>dt]:text-muted [&>dd]:break-words [&>dd]:min-w-0"
        >
          <dt>PostgreSQL</dt>
          <dd>{{ info.database.serverVersion }}</dd>
          <dt>{{ t('maintenanceView.db.size') }}</dt>
          <dd>{{ formatBytes(info.database.sizeBytes, locale) }}</dd>
          <dt>{{ t('maintenanceView.db.migrations') }}</dt>
          <dd>{{ info.database.migrations.applied }}</dd>
          <dt>{{ t('maintenanceView.db.latestMigration') }}</dt>
          <dd>
            {{
              dateToStringDDMMYYYYHHMM(info.database.migrations.latestMigrationAt ?? undefined) ||
              '—'
            }}
          </dd>
        </dl>
        <UTable
          :data="info.database.tables"
          :columns="tableColumns"
          :ui="{ td: 'py-2', th: 'py-2' }"
        >
          <template #sizeBytes-cell="{ row }">{{
            formatBytes(row.original.sizeBytes, locale)
          }}</template>
        </UTable>
      </UCard>

      <!-- Environment -->
      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon name="i-fa7-solid:sliders" />{{ t('maintenanceView.env.title') }}
          </h2>
          <p class="mt-1 text-sm text-muted">{{ t('maintenanceView.env.subtitle') }}</p>
        </template>
        <!-- One block per group; name and value stack on phones, where long values need the room. -->
        <section v-for="group in envGroups" :key="group.name" class="mb-4 last:mb-0">
          <h3 class="mb-2 text-sm font-semibold">
            {{ t(`maintenanceView.env.groups.${group.name}`) }}
          </h3>
          <ul class="divide-y divide-default rounded-md border border-default">
            <li
              v-for="variable in group.variables"
              :key="variable.name"
              class="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <code class="text-sm sm:w-72 sm:shrink-0">{{ variable.name }}</code>
              <UBadge
                v-if="variable.secret"
                :color="variable.configured ? 'success' : 'neutral'"
                variant="subtle"
                icon="i-fa7-solid:lock"
                class="self-start"
                :label="
                  t(
                    variable.configured
                      ? 'maintenanceView.env.secretSet'
                      : 'maintenanceView.env.unset',
                  )
                "
              />
              <code v-else-if="variable.configured" class="text-sm break-all text-muted">{{
                variable.value
              }}</code>
              <span v-else class="text-sm text-dimmed italic">{{
                t('maintenanceView.env.unset')
              }}</span>
            </li>
          </ul>
        </section>
      </UCard>
    </div>

    <div v-else-if="loading" class="flex justify-center py-12">
      <UIcon name="i-fa7-solid:spinner" class="size-8 animate-spin text-muted" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import type { SystemInfo } from '@skol-arena/shared/types/index'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { hiddenBelow } from '@/components/admin/table-columns'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useMaintenanceService } from '@/composables/maintenance/maintenance.service'
import { dateToStringDDMMYYYYHHMM } from '@/utils/DateUtils'
import { formatBytes } from '@/utils/bytes'

const { t, locale } = useI18n()
const confirm = useConfirmDialog()
const clientVersion = __APP_VERSION__
const {
  info,
  lastMigration,
  loading,
  migrating,
  error,
  hasStrandedAvatars,
  loadSystemInfo,
  migrateAvatars,
} = useMaintenanceService()

type DatabaseTable = SystemInfo['database']['tables'][number]
type EnvironmentVariable = SystemInfo['environment'][number]

const tableColumns: TableColumn<DatabaseTable>[] = [
  { accessorKey: 'name', header: t('maintenanceView.db.table') },
  { accessorKey: 'rows', header: t('maintenanceView.db.rows'), meta: hiddenBelow('sm') },
  { accessorKey: 'sizeBytes', header: t('maintenanceView.db.tableSize') },
]

/** Variables in their declaration order, grouped under the group they first appear in. */
const envGroups = computed(() => {
  const groups = new Map<string, EnvironmentVariable[]>()
  for (const variable of info.value?.environment ?? []) {
    groups.set(variable.group, [...(groups.get(variable.group) ?? []), variable])
  }
  return [...groups].map(([name, variables]) => ({ name, variables }))
})

async function confirmMigration() {
  if (!info.value) return
  const confirmed = await confirm({
    title: t('maintenanceView.avatars.confirmHeader'),
    message: t('maintenanceView.avatars.confirmMessage', {
      driver: info.value.avatarStorage.driver,
      stranded: info.value.avatarStorage.strandedDrivers.join(', '),
    }),
    confirmLabel: t('maintenanceView.avatars.confirmAccept'),
    color: 'warning',
  })
  if (confirmed) await migrateAvatars()
}

// Front and back ship in the same image, so they share one version. The server only
// knows it from the deployed build (unknown in dev); this tab's bundle can lag
// behind it until the PWA applies the background update.
const deployedVersion = computed(() => info.value?.application.version ?? clientVersion)
const staleClient = computed(() => deployedVersion.value !== clientVersion)

onMounted(loadSystemInfo)
</script>
