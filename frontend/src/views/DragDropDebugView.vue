<template>
  <div class="p-8 flex gap-8">
    <div>
      <p class="mb-2 font-semibold">{{ t('dragDropDebugView.listA', { count: files1.length }) }}</p>
      <VueDraggable
        v-model="files1"
        tag="ul"
        class="flex flex-col gap-1 min-h-32 border-2 border-dashed border-blue-400 p-2 rounded w-48"
        :group="'A'"
      >
        <li
          v-for="file in files1"
          :key="file"
          class="bg-blue-100 dark:bg-blue-900 px-3 py-2 rounded cursor-grab select-none text-sm"
        >
          {{ file }}
        </li>
      </VueDraggable>
    </div>

    <div>
      <p class="mb-2 font-semibold">{{ t('dragDropDebugView.listB', { count: files2.length }) }}</p>
      <VueDraggable
        v-model="files2"
        tag="ul"
        class="flex flex-col gap-1 min-h-32 border-2 border-dashed border-green-400 p-2 rounded w-48"
        :group="'A'"
      >
        <li
          v-for="file in files2"
          :key="file"
          class="bg-green-100 dark:bg-green-900 px-3 py-2 rounded cursor-grab select-none text-sm"
        >
          {{ file }}
        </li>
      </VueDraggable>
    </div>

    <div class="text-xs text-slate-400 self-start pt-8 space-y-1">
      <div>A: {{ files1.join(', ') || '—' }}</div>
      <div>B: {{ files2.join(', ') || '—' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'

const { t } = useI18n()

const files1 = ref([
  'dungeon_master.exe',
  'map_1.dat',
  'map_2.dat',
  'character1.txt',
  'character2.txt',
  'shell32.dll',
  'README.txt',
])
const files2 = ref<string[]>([])
</script>
