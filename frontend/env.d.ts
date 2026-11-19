/// <reference types="vite/client" />

import 'vue-i18n'
import type { ComposerTranslation } from 'vue-i18n'

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: ComposerTranslation
  }
}
