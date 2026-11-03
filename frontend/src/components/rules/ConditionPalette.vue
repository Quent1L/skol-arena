<template>
  <div>
    <p class="mb-2 text-xs font-semibold text-muted">{{ t('conditionPalette.blocksLabel') }}</p>
    <!-- Rows that wrap in a narrow builder, a column beside it once there is room. -->
    <VueDraggable
      v-model="items"
      :group="{ name: 'cond', pull: 'clone', put: false }"
      :sort="false"
      :clone="cloneNode"
      class="flex flex-wrap gap-2 @3xl:flex-col"
    >
      <div
        v-for="item in items"
        :key="item.paletteType"
        :data-palette-type="item.paletteType"
        class="flex max-w-full min-w-0 cursor-grab items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm select-none"
      >
        <UIcon name="i-fa7-solid:grip-vertical" class="size-4 shrink-0 text-dimmed" />
        <span class="min-w-0 break-words">{{ label(item) }}</span>
      </div>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import {
  PALETTE_ITEMS,
  nodeFromPalette,
  type BuilderNode,
  type PaletteItem,
} from './condition-tree'

const { t } = useI18n()

const items = ref<PaletteItem[]>([...PALETTE_ITEMS])

function label(item: PaletteItem): string {
  return t(`conditionPalette.items.${item.paletteType}`)
}

function cloneNode(item: PaletteItem): BuilderNode {
  return nodeFromPalette(item)
}
</script>
