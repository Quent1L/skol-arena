<template>
  <div
    class="rich-text-editor border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden"
    :class="{ 'opacity-50 pointer-events-none': disabled }"
  >
    <!-- Toolbar -->
    <div
      class="toolbar flex flex-wrap gap-1 p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600"
    >
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('bold') }"
        @click="editor?.chain().focus().toggleBold().run()"
        :title="t('richTextEditor.toolbar.bold')"
      >
        <i class="fa fa-bold"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('italic') }"
        @click="editor?.chain().focus().toggleItalic().run()"
        :title="t('richTextEditor.toolbar.italic')"
      >
        <i class="fa fa-italic"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('underline') }"
        @click="editor?.chain().focus().toggleUnderline().run()"
        :title="t('richTextEditor.toolbar.underline')"
      >
        <i class="fa fa-underline"></i>
      </button>

      <div class="toolbar-separator"></div>

      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('heading', { level: 2 }) }"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
        :title="t('richTextEditor.toolbar.headingH2')"
      >
        H2
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('heading', { level: 3 }) }"
        @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
        :title="t('richTextEditor.toolbar.headingH3')"
      >
        H3
      </button>

      <div class="toolbar-separator"></div>

      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('bulletList') }"
        @click="editor?.chain().focus().toggleBulletList().run()"
        :title="t('richTextEditor.toolbar.bulletList')"
      >
        <i class="fa fa-list-ul"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive('orderedList') }"
        @click="editor?.chain().focus().toggleOrderedList().run()"
        :title="t('richTextEditor.toolbar.orderedList')"
      >
        <i class="fa fa-list-ol"></i>
      </button>

      <div class="toolbar-separator"></div>

      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive({ textAlign: 'left' }) }"
        @click="editor?.chain().focus().setTextAlign('left').run()"
        :title="t('richTextEditor.toolbar.alignLeft')"
      >
        <i class="fa fa-align-left"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive({ textAlign: 'center' }) }"
        @click="editor?.chain().focus().setTextAlign('center').run()"
        :title="t('richTextEditor.toolbar.alignCenter')"
      >
        <i class="fa fa-align-center"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor?.isActive({ textAlign: 'right' }) }"
        @click="editor?.chain().focus().setTextAlign('right').run()"
        :title="t('richTextEditor.toolbar.alignRight')"
      >
        <i class="fa fa-align-right"></i>
      </button>

      <div class="toolbar-separator"></div>

      <button
        type="button"
        class="toolbar-btn"
        @click="editor?.chain().focus().undo().run()"
        :disabled="!editor?.can().undo()"
        :title="t('richTextEditor.toolbar.undo')"
      >
        <i class="fa fa-undo"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        @click="editor?.chain().focus().redo().run()"
        :disabled="!editor?.can().redo()"
        :title="t('richTextEditor.toolbar.redo')"
      >
        <i class="fa fa-redo"></i>
      </button>

      <div class="toolbar-separator"></div>

      <button
        type="button"
        class="toolbar-btn"
        @click="toggleLinkInput"
        :class="{ active: editor?.isActive('link') || showLinkInput }"
        :title="t('richTextEditor.toolbar.insertLink')"
      >
        <i class="fa fa-link"></i>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        @click="
          showImageInput = !showImageInput
          showLinkInput = false
        "
        :class="{ active: showImageInput }"
        :title="t('richTextEditor.toolbar.insertImage')"
      >
        <i class="fa fa-image"></i>
      </button>
    </div>

    <!-- Link URL input bar -->
    <div v-if="showLinkInput" class="image-input-bar">
      <input
        v-model="linkUrl"
        type="url"
        :aria-label="t('richTextEditor.link.placeholder')"
        :placeholder="t('richTextEditor.link.placeholder')"
        class="image-url-input"
        @keydown.enter.prevent="insertLink"
        @keydown.escape="showLinkInput = false"
        ref="linkInputRef"
      />
      <button type="button" class="image-insert-btn" @click="insertLink" :disabled="!linkUrl">
        {{ t('richTextEditor.insert') }}
      </button>
      <button type="button" class="image-cancel-btn" @click="showLinkInput = false">
        <i class="fa fa-times"></i>
      </button>
    </div>

    <!-- Image URL input bar -->
    <div v-if="showImageInput" class="image-input-bar">
      <input
        v-model="imageUrl"
        type="url"
        :aria-label="t('richTextEditor.image.placeholder')"
        :placeholder="t('richTextEditor.image.placeholder')"
        class="image-url-input"
        @keydown.enter.prevent="insertImage"
        @keydown.escape="showImageInput = false"
        ref="imageInputRef"
      />
      <button type="button" class="image-insert-btn" @click="insertImage" :disabled="!imageUrl">
        {{ t('richTextEditor.insert') }}
      </button>
      <button type="button" class="image-cancel-btn" @click="showImageInput = false">
        <i class="fa fa-times"></i>
      </button>
    </div>

    <!-- Editor area -->
    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'

const { t } = useI18n()

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showImageInput = ref(false)
const imageUrl = ref('')
const imageInputRef = ref<HTMLInputElement | null>(null)

const showLinkInput = ref(false)
const linkUrl = ref('')
const linkInputRef = ref<HTMLInputElement | null>(null)

const editor = useEditor({
  content: props.modelValue,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({ link: { openOnClick: false } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: true }),
  ],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
})

watch(
  () => props.modelValue,
  (value) => {
    if (editor.value && editor.value.getHTML() !== value) {
      editor.value.commands.setContent(value)
    }
  },
)

watch(
  () => props.disabled,
  (value) => {
    editor.value?.setEditable(!value)
  },
)

watch(showImageInput, async (val) => {
  if (val) {
    imageUrl.value = ''
    await nextTick()
    imageInputRef.value?.focus()
  }
})

watch(showLinkInput, async (val) => {
  if (val) {
    linkUrl.value = editor.value?.getAttributes('link').href ?? ''
    await nextTick()
    linkInputRef.value?.focus()
  }
})

function toggleLinkInput() {
  if (editor.value?.isActive('link')) {
    editor.value.chain().focus().unsetLink().run()
    showLinkInput.value = false
  } else {
    showImageInput.value = false
    showLinkInput.value = !showLinkInput.value
  }
}

function insertLink() {
  if (!linkUrl.value || !editor.value) return
  editor.value.chain().focus().setLink({ href: linkUrl.value, target: '_blank' }).run()
  linkUrl.value = ''
  showLinkInput.value = false
}

function insertImage() {
  if (!imageUrl.value || !editor.value) return
  editor.value.chain().focus().setImage({ src: imageUrl.value }).run()
  imageUrl.value = ''
  showImageInput.value = false
}

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.toolbar-btn {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(209 213 219);
  transition: background-color 0.15s;
  min-width: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.toolbar-btn:hover {
  background-color: rgb(55 65 81);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.active {
  background-color: rgb(30 58 138);
  color: rgb(147 197 253);
}

.toolbar-separator {
  width: 1px;
  background-color: rgb(75 85 99);
  margin: 0 0.25rem;
  align-self: stretch;
}

.editor-content {
  resize: vertical;
  overflow: auto;
  min-height: 200px;
  background-color: rgb(17 24 39);
}

:deep(.ProseMirror) {
  padding: 0.75rem;
  min-height: 200px;
  outline: none;
  color: rgb(243 244 246);
}

:deep(.ProseMirror h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

:deep(.ProseMirror h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}

:deep(.ProseMirror ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}

:deep(.ProseMirror ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}

:deep(.ProseMirror p) {
  margin: 0.25rem 0;
}

:deep(.ProseMirror a) {
  color: rgb(96 165 250);
  text-decoration: underline;
  cursor: pointer;
}

.image-input-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: rgb(31 41 55);
  border-bottom: 1px solid rgb(75 85 99);
}

.image-url-input {
  flex: 1;
  background-color: rgb(17 24 39);
  color: rgb(243 244 246);
  border: 1px solid rgb(75 85 99);
  border-radius: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  outline: none;
}

.image-url-input:focus {
  border-color: rgb(96 165 250);
}

.image-url-input::placeholder {
  color: rgb(107 114 128);
}

.image-insert-btn {
  padding: 0.25rem 0.75rem;
  background-color: rgb(37 99 235);
  color: white;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}

.image-insert-btn:hover {
  background-color: rgb(29 78 216);
}

.image-insert-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.image-cancel-btn {
  padding: 0.25rem 0.5rem;
  color: rgb(156 163 175);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: color 0.15s;
}

.image-cancel-btn:hover {
  color: rgb(243 244 246);
}

:deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.25rem;
  margin: 0.5rem 0;
  cursor: pointer;
}

:deep(.ProseMirror img.ProseMirror-selectednode) {
  outline: 2px solid rgb(96 165 250);
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: rgb(107 114 128);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>
