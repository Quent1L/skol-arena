<template>
  <div v-if="showHeader" class="breadcrumb-menu hidden md:block">
    <nav class="flex items-center gap-2 flex-wrap">
      <button
        v-if="home"
        @click="() => home?.command?.()"
        class="text-muted hover:text-highlighted transition-colors"
        :aria-label="t('breadcrumbMenu.home')"
      >
        <i :class="home.icon" class="text-sm"></i>
      </button>

      <template v-for="(item, index) in allItems" :key="index">
        <i class="fas fa-chevron-right text-xs text-muted"></i>

        <button
          v-if="item.command && !item.isTitle"
          @click="() => item.command?.()"
          class="text-sm text-muted hover:text-highlighted transition-colors"
        >
          {{ item.label }}
        </button>

        <span v-else-if="item.isTitle" class="text-sm font-medium text-highlighted">
          {{ item.label }}
        </span>

        <span v-else class="text-sm text-muted">
          {{ item.label }}
        </span>
      </template>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface BreadcrumbItem {
  label: string
  command?: () => void
  isTitle?: boolean
}

const route = useRoute()
const router = useRouter()

const home = computed<{ icon: string; command: () => void } | null>(() => {
  if (route.meta.hideBreadcrumb && !route.meta.title) {
    return null
  }

  return {
    icon: 'fas fa-home',
    command: () => {
      router.push('/')
    },
  }
})

const showHeader = computed(() => {
  return !route.meta.hideBreadcrumb && route.meta.title
})

const allItems = computed<BreadcrumbItem[]>(() => {
  const ancestors: BreadcrumbItem[] = []
  let parentName = route.meta.parent as string | undefined

  while (parentName) {
    const parentRoute = router.getRoutes().find((r) => r.name === parentName)
    if (!parentRoute?.meta?.breadcrumb) break
    const routeName = parentRoute.name as string
    ancestors.unshift({
      label: parentRoute.meta.breadcrumb as string,
      command: () => router.push({ name: routeName }),
    })
    parentName = parentRoute.meta?.parent as string | undefined
  }

  if (route.meta.title) {
    ancestors.push({ label: route.meta.title as string, isTitle: true })
  } else if (route.meta.breadcrumb && !route.meta.hideBreadcrumb) {
    ancestors.push({ label: route.meta.breadcrumb as string, isTitle: true })
  }

  return ancestors
})
</script>
<style scoped>
.breadcrumb-menu {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0.75rem 1rem 0.25rem 1rem;
}
</style>
