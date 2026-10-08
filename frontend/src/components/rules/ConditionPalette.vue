<template>
  <div>
    <p class="mb-2 text-xs font-semibold text-muted">{{ t('conditionPalette.blocksLabel') }}</p>
    <!-- A scrollable row in a narrow builder, a column beside it once there is room. -->
    <VueDraggable
      v-model="items"
      :group="{ name: 'cond', pull: 'clone', put: false }"
      :sort="false"
      :clone="cloneNode"
      class="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 @3xl:flex-col @3xl:overflow-visible"
    >
      <div
        v-for="item in items"
        :key="item.paletteType"
        class="flex shrink-0 cursor-grab items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm select-none"
      >
        <UIcon name="i-fa7-solid:grip-vertical" class="size-4 text-dimmed" />
        {{ item.label }}
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

function cloneNode(item: PaletteItem): BuilderNode {
  return nodeFromPalette(item)
}
</script>
