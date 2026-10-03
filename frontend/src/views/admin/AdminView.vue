<template>
  <div class="admin-view">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">{{ t('adminView.title') }}</h1>
      <p class="text-gray-600 dark:text-gray-400">
        {{ t('adminView.subtitle') }}
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Tournament Management Card -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToTournaments">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-trophy text-5xl text-blue-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.tournamentsTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.tournamentsDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-blue-600 hover:bg-blue-700"
              @click.stop="navigateToTournaments"
            />
          </div>
        </template>
      </Card>

      <!-- Card Gestion des disciplines -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToDisciplines">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-gamepad text-5xl text-purple-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.disciplinesTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.disciplinesDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-purple-600 hover:bg-purple-700"
              @click.stop="navigateToDisciplines"
            />
          </div>
        </template>
      </Card>
      <Card
        class="cursor-pointer hover:shadow-lg transition-shadow"
        @click="navigateToInvitaionCode"
      >
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-gamepad text-5xl text-purple-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.invitationsTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.invitationsDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-purple-600 hover:bg-purple-700"
              @click.stop="navigateToInvitaionCode"
            />
          </div>
        </template>
      </Card>

      <!-- Card Saisons Ranked -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToRanked">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-ranking-star text-5xl text-yellow-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.rankedTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.rankedDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-yellow-600 hover:bg-yellow-700"
              @click.stop="navigateToRanked"
            />
          </div>
        </template>
      </Card>

      <!-- Card Organisations -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToOrganizations">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-users text-5xl text-indigo-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.organizationsTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.organizationsDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-indigo-600 hover:bg-indigo-700"
              @click.stop="navigateToOrganizations"
            />
          </div>
        </template>
      </Card>

      <!-- Users Card -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToUsers">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-users text-5xl text-indigo-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.usersTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.usersDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-indigo-600 hover:bg-indigo-700"
              @click.stop="navigateToUsers"
            />
          </div>
        </template>
      </Card>

      <!-- Game Rules Card -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToRules">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-scroll text-5xl text-green-600"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.rulesTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.rulesDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-green-600 hover:bg-green-700"
              @click.stop="navigateToRules"
            />
          </div>
        </template>
      </Card>

      <!-- Rules Engine Card -->
      <Card class="cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToRulesEngine">
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-wand-magic-sparkles text-5xl text-purple-600"></i>
            </div>
            <div class="flex items-center justify-center gap-2 mb-3">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t('adminView.rulesEngineTitle') }}</h2>
              <Tag :value="t('adminView.betaTag')" severity="warn" />
            </div>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.rulesEngineDescription') }}
            </p>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              class="bg-purple-600 hover:bg-purple-700"
              @click.stop="navigateToRulesEngine"
            />
          </div>
        </template>
      </Card>
      <!-- Technical maintenance Card -->
      <Card
        class="cursor-pointer hover:shadow-lg transition-shadow"
        data-testid="maintenance-card"
        @click="navigateToMaintenance"
      >
        <template #content>
          <div class="text-center py-8">
            <div class="mb-4">
              <i class="fa fa-screwdriver-wrench text-5xl text-gray-600 dark:text-gray-300"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {{ t('adminView.maintenanceTitle') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('adminView.maintenanceDescription') }}
            </p>
            <Message
              v-if="hasStrandedAvatars"
              severity="warn"
              class="mb-4 text-left"
              data-testid="maintenance-avatar-warning"
            >
              {{ t('adminView.maintenanceAvatarWarning') }}
            </Message>
            <Button
              :label="t('adminView.access')"
              icon="fa fa-arrow-right"
              :severity="hasStrandedAvatars ? 'warn' : 'secondary'"
              @click.stop="navigateToMaintenance"
            />
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMaintenanceService } from '@/composables/maintenance/maintenance.service'

const { t } = useI18n()
const router = useRouter()
// Answered from a flag the backend computes at startup: free to ask on every visit.
const { hasStrandedAvatars, loadStatus } = useMaintenanceService()

onMounted(loadStatus)

function navigateToTournaments() {
  router.push('/admin/tournaments')
}

function navigateToDisciplines() {
  router.push('/admin/disciplines')
}

function navigateToInvitaionCode() {
  router.push('/admin/invitations')
}

function navigateToOrganizations() {
  router.push('/admin/organizations')
}

function navigateToUsers() {
  router.push('/admin/users')
}

function navigateToRules() {
  router.push('/admin/rules')
}

function navigateToRanked() {
  router.push('/admin/ranked')
}

function navigateToRulesEngine() {
  router.push('/admin/rules-engine')
}

function navigateToMaintenance() {
  router.push('/admin/maintenance')
}
</script>

<style scoped>
.admin-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

@media (max-width: 640px) {
  .admin-view {
    padding: 1rem;
  }
}
</style>
