import { mount, RouterLinkStub, type ComponentMountingOptions } from '@vue/test-utils'
import { defineComponent, h, type Component, type Slots } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

/**
 * Mounts a component with the plugins PrimeVue components need in jsdom
 * (auto-imported PrimeVue components throw without the $primevue config).
 */
export function mountWithPrime<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
) {
  const { global: globalOptions, ...rest } = options
  return mount(component, {
    ...rest,
    global: {
      ...globalOptions,
      plugins: [
        PrimeVue,
        ToastService,
        ConfirmationService,
        createPinia(),
        ...(globalOptions?.plugins ?? []),
      ],
      stubs: {
        RouterLink: RouterLinkStub,
        ...(globalOptions?.stubs as Record<string, unknown> | undefined),
      },
    },
  })
}

/**
 * Mounts a component inside Nuxt UI's <UApp>, which provides what its toasts,
 * tooltips and programmatic overlays inject. The returned wrapper is the host:
 * reach the component itself with `wrapper.findComponent(component)`.
 * A catch-all memory router is installed because ULink (inside buttons, cards and
 * menus with a `to`) needs a real one; tests mocking vue-router must keep its
 * actual exports (`importOriginal`).
 */
export function mountWithUi<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
) {
  const { global: globalOptions, props, slots, ...rest } = options
  const Host = defineComponent({
    setup: () => () =>
      h(UApp, null, () => h(component, props as Record<string, unknown>, slots as Slots)),
  })
  return mount(Host, {
    ...(rest as ComponentMountingOptions<typeof Host>),
    attachTo: document.body,
    global: {
      ...globalOptions,
      plugins: [ui, createPinia(), testRouter(), ...(globalOptions?.plugins ?? [])],
      stubs: {
        RouterLink: RouterLinkStub,
        ...(globalOptions?.stubs as Record<string, unknown> | undefined),
      },
    },
  })
}

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { render: () => null } }],
  })
}
