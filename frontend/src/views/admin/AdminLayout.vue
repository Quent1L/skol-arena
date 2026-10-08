<template>
  <div class="mx-auto flex w-full max-w-screen-2xl gap-6 px-4 py-4 lg:px-6">
    <aside class="hidden w-60 shrink-0 lg:block" :aria-label="t('adminNav.menu')">
      <div class="sticky top-4">
        <UNavigationMenu orientation="vertical" :items="navItems" />
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <div class="mb-4 flex min-h-9 items-center gap-2">
        <UButton
          class="lg:hidden"
          icon="i-fa7-solid:bars"
          color="neutral"
          variant="ghost"
          :aria-label="t('adminNav.openMenu')"
          @click="menuOpen = true"
        />
        <UButton
          v-if="parentLink"
          class="sm:hidden"
          icon="i-fa7-solid:chevron-left"
          color="neutral"
          variant="link"
          :to="parentLink.to"
          :label="parentLink.label"
        />
        <UBreadcrumb class="hidden min-w-0 sm:flex" :items="breadcrumb" />
      </div>

      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </RouterView>
    </div>

    <USlideover
      v-model:open="menuOpen"
      side="left"
      :title="t('adminNav.menu')"
      :ui="{ content: 'max-w-72' }"
    >
      <template #body>
        <UNavigationMenu orientation="vertical" :items="navItems" />
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BreadcrumbItem } from '@nuxt/ui'
import { buildAdminNavItems } from './admin-nav'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
// The drawer only serves to pick a destination: close it once there.
watch(() => route.path, () => (menuOpen.value = false))

const navItems = computed(() => buildAdminNavItems(t, route.path))

/** Ancestors from `meta.parent`, root first, then the current page. */
const breadcrumb = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = []
  let parentName = route.meta.parent
  while (parentName) {
    const parent = router.getRoutes().find((r) => r.name === parentName)
    if (!parent?.meta.breadcrumb) break
    items.unshift({ label: parent.meta.breadcrumb, to: { name: parent.name } })
    parentName = parent.meta.parent
  }
  items.unshift({ icon: 'i-fa7-solid:house', to: '/', 'aria-label': t('adminNav.home') })
  items.push({ label: route.meta.breadcrumb ?? route.meta.title })
  return items
})

/** On phones the trail collapses to a single "back to parent" link. */
const parentLink = computed(() => {
  const parent = breadcrumb.value.at(-2)
  return parent?.label ? { to: parent.to, label: parent.label } : null
})
</script>
