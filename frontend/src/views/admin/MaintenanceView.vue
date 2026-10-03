<template>
  <div class="maintenance-view">
    <div class="flex flex-wrap justify-between items-center gap-3 mb-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {{ t('maintenanceView.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">{{ t('maintenanceView.subtitle') }}</p>
      </div>
      <Button
        :label="t('maintenanceView.refresh')"
        icon="fa fa-rotate"
        severity="secondary"
        :loading="loading"
        @click="loadSystemInfo"
      />
    </div>

    <Message v-if="error" severity="error" class="mb-4">{{ error }}</Message>

    <div v-if="info" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Avatar storage -->
      <Card class="lg:col-span-2" data-testid="avatar-storage-card">
        <template #title>
          <i class="fa fa-image mr-2"></i>{{ t('maintenanceView.avatars.title') }}
        </template>
        <template #content>
          <Message v-if="hasStrandedAvatars" severity="warn" class="mb-4">
            {{
              t('maintenanceView.avatars.mismatch', {
                stranded: info.avatarStorage.strandedDrivers.join(', '),
                driver: info.avatarStorage.driver,
              })
            }}
          </Message>
          <dl class="info-grid">
            <dt>{{ t('maintenanceView.avatars.driver') }}</dt>
            <dd><Tag :value="info.avatarStorage.driver" /></dd>
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
          <Message v-if="lastMigration" :severity="lastMigration.failed > 0 ? 'warn' : 'success'" class="mt-4">
            {{ t('maintenanceService.migrationDetail', lastMigration) }}
          </Message>
          <Button
            v-if="hasStrandedAvatars"
            class="mt-4"
            icon="fa fa-right-left"
            severity="warn"
            data-testid="migrate-avatars"
            :label="t('maintenanceView.avatars.migrate', { driver: info.avatarStorage.driver })"
            :loading="migrating"
            @click="confirmMigration"
          />
        </template>
      </Card>

      <!-- Application -->
      <Card>
        <template #title><i class="fa fa-cube mr-2"></i>{{ t('maintenanceView.app.title') }}</template>
        <template #content>
          <dl class="info-grid">
            <dt>{{ t('maintenanceView.app.version') }}</dt>
            <dd data-testid="app-version">
              {{ deployedVersion }}
              <Tag
                v-if="staleClient"
                severity="warn"
                class="ml-2"
                :value="t('maintenanceView.app.staleClient', { version: clientVersion })"
              />
            </dd>
            <dt>Bun</dt>
            <dd>{{ info.application.bunVersion }}</dd>
            <dt>NODE_ENV</dt>
            <dd>{{ info.application.nodeEnv ?? t('maintenanceView.unknown') }}</dd>
            <dt>{{ t('maintenanceView.app.startedAt') }}</dt>
            <dd>{{ dateToStringDDMMYYYYHHMM(info.application.startedAt) }}</dd>
            <dt>{{ t('maintenanceView.app.apiVersions') }}</dt>
            <dd>
              {{ info.application.apiVersions.join(', ') }}
              ({{ t('maintenanceView.app.latest', { version: info.application.latestApiVersion }) }})
            </dd>
          </dl>
        </template>
      </Card>

      <!-- Database -->
      <Card>
        <template #title><i class="fa fa-database mr-2"></i>{{ t('maintenanceView.db.title') }}</template>
        <template #content>
          <dl class="info-grid mb-4">
            <dt>PostgreSQL</dt>
            <dd>{{ info.database.serverVersion }}</dd>
            <dt>{{ t('maintenanceView.db.size') }}</dt>
            <dd>{{ formatBytes(info.database.sizeBytes, locale) }}</dd>
            <dt>{{ t('maintenanceView.db.migrations') }}</dt>
            <dd>{{ info.database.migrations.applied }}</dd>
            <dt>{{ t('maintenanceView.db.latestMigration') }}</dt>
            <dd>{{ dateToStringDDMMYYYYHHMM(info.database.migrations.latestMigrationAt ?? undefined) || '—' }}</dd>
          </dl>
          <DataTable :value="info.database.tables" size="small" striped-rows>
            <Column field="name" :header="t('maintenanceView.db.table')" />
            <Column field="rows" :header="t('maintenanceView.db.rows')" />
            <Column :header="t('maintenanceView.db.tableSize')">
              <template #body="{ data }">{{ formatBytes(data.sizeBytes, locale) }}</template>
            </Column>
          </DataTable>
        </template>
      </Card>

      <!-- Environment -->
      <Card class="lg:col-span-2">
        <template #title><i class="fa fa-sliders mr-2"></i>{{ t('maintenanceView.env.title') }}</template>
        <template #subtitle>{{ t('maintenanceView.env.subtitle') }}</template>
        <template #content>
          <DataTable
            :value="info.environment"
            size="small"
            row-group-mode="subheader"
            group-rows-by="group"
          >
            <template #groupheader="{ data }">
              <span class="font-semibold">{{ t(`maintenanceView.env.groups.${data.group}`) }}</span>
            </template>
            <Column field="name" :header="t('maintenanceView.env.name')">
              <template #body="{ data }"><code>{{ data.name }}</code></template>
            </Column>
            <Column :header="t('maintenanceView.env.value')">
              <template #body="{ data }">
                <Tag v-if="data.secret" :severity="data.configured ? 'success' : 'secondary'"
                  :value="t(data.configured ? 'maintenanceView.env.secretSet' : 'maintenanceView.env.unset')"
                  icon="fa fa-lock" />
                <code v-else-if="data.configured" class="break-all">{{ data.value }}</code>
                <span v-else class="text-gray-500 italic">{{ t('maintenanceView.env.unset') }}</span>
              </template>
            </Column>
          </DataTable>
        </template>
      </Card>
    </div>

    <div v-else-if="loading" class="flex justify-center py-12">
      <ProgressSpinner />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useMaintenanceService } from '@/composables/maintenance/maintenance.service'
import { dateToStringDDMMYYYYHHMM } from '@/utils/DateUtils'
import { formatBytes } from '@/utils/bytes'

const { t, locale } = useI18n()
const confirm = useConfirm()
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

function confirmMigration() {
  if (!info.value) return
  confirm.require({
    header: t('maintenanceView.avatars.confirmHeader'),
    message: t('maintenanceView.avatars.confirmMessage', {
      driver: info.value.avatarStorage.driver,
      stranded: info.value.avatarStorage.strandedDrivers.join(', '),
    }),
    icon: 'fa fa-exclamation-triangle',
    acceptLabel: t('maintenanceView.avatars.confirmAccept'),
    rejectLabel: t('common.cancel'),
    acceptClass: 'p-button-warn',
    accept: migrateAvatars,
  })
}

// Front and back ship in the same image, so they share one version. The server only
// knows it from the deployed build (unknown in dev); this tab's bundle can lag
// behind it until the PWA applies the background update.
const deployedVersion = computed(() => info.value?.application.version ?? clientVersion)
const staleClient = computed(() => deployedVersion.value !== clientVersion)

onMounted(loadSystemInfo)
</script>

<style scoped>
.maintenance-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

.info-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.5rem 1.5rem;
}

.info-grid dt {
  color: var(--p-text-muted-color);
}

.info-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .maintenance-view {
    padding: 1rem;
  }
}
</style>
