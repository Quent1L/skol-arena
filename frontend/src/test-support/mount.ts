import { mount, RouterLinkStub, type ComponentMountingOptions } from '@vue/test-utils'
import { defineComponent, h, type Component, type Slots } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'

/**
 * Mounts a component as is, with Pinia and a RouterLink stub: the wrapper is the component
 * itself (`vm`, `emitted`, `setProps`). Enough for components whose Nuxt UI parts need no
 * provider; prefer `mountWithUi` for overlays, toasts and tooltips.
 */
export function mountWithPlugins<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
) {
  const { global: globalOptions, ...rest } = options
  return mount(component, {
    ...rest,
    global: {
      ...globalOptions,
      plugins: [createPinia(), ...(globalOptions?.plugins ?? [])],
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
  const { global: globalOptions, slots, ...rest } = options
  // Props reach the host as attrs and are forwarded, so `wrapper.setProps()` still works.
  const Host = defineComponent({
    inheritAttrs: false,
    setup:
      (_, { attrs }) =>
      () =>
        h(UApp, null, () => h(component, attrs, slots as Slots)),
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
