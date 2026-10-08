<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-highlighted sm:text-3xl">{{ t('adminView.title') }}</h1>
      <p class="mt-1 text-muted">{{ t('adminView.subtitle') }}</p>
    </div>

    <section v-for="group in ADMIN_SECTION_GROUPS" :key="group.key" class="space-y-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
        {{ t(`adminNav.groups.${group.key}`) }}
      </h2>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="section in group.sections"
          :key="section.to"
          :to="section.to"
          :icon="section.icon"
          :description="t(`adminView.${section.navKey}Description`)"
          :highlight="isMaintenance(section) && hasStrandedAvatars"
          highlight-color="warning"
          spotlight
          :data-testid="isMaintenance(section) ? 'maintenance-card' : undefined"
        >
          <template #title>
            <div class="flex items-center gap-2">
              <!-- Headings are what screen readers and the e2e suite navigate by. -->
              <h3>{{ t(`adminView.${section.navKey}Title`) }}</h3>
              <UBadge
                v-if="section.navKey === 'rulesEngine'"
                :label="t('adminView.betaTag')"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </div>
          </template>
          <UAlert
            v-if="isMaintenance(section) && hasStrandedAvatars"
            color="warning"
            variant="subtle"
            icon="i-fa7-solid:triangle-exclamation"
            :description="t('adminView.maintenanceAvatarWarning')"
            data-testid="maintenance-avatar-warning"
          />
        </UPageCard>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMaintenanceService } from '@/composables/maintenance/maintenance.service'
import { ADMIN_SECTION_GROUPS, type AdminSection } from './admin-nav'

const { t } = useI18n()
// Answered from a flag the backend computes at startup: free to ask on every visit.
const { hasStrandedAvatars, loadStatus } = useMaintenanceService()

onMounted(loadStatus)

const isMaintenance = (section: AdminSection) => section.navKey === 'maintenance'
</script>
