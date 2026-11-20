import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import UpdateOverlay from '../UpdateOverlay.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  messages: {
    fr: {
      updateOverlay: {
        continueAnyway: 'Continuer sans attendre',
        doneSubtitle: "L'application vient d'être mise à jour.",
        doneTitle: 'Mise à jour effectuée',
        downloadingSubtitle: 'Téléchargement en cours...',
        fileProgress: '{done} / {total} fichiers',
        forcedSlowHint: 'Cette mise à jour est obligatoire.',
        forcedSubtitle: 'Mise à jour obligatoire...',
        forcedTitle: 'Mise à jour requise',
        slowHint: 'Connexion lente ?',
        subtitle: 'Rechargement en cours...',
        title: 'Nouvelle version disponible',
      },
    },
  },
})

type Props = InstanceType<typeof UpdateOverlay>['$props']

function mountOverlay(props: Partial<Props> = {}) {
  return mount(UpdateOverlay, {
    props: { visible: true, ...props } as Props,
    global: { plugins: [i18n], stubs: { LogoFillGauge: true, BrandBackdrop: true } },
  })
}

describe('UpdateOverlay', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows real progress while downloading', async () => {
    const wrapper = mountOverlay({ phase: 'downloading', progress: 0.42 })

    expect(wrapper.text()).toContain('Téléchargement en cours...')
    expect(wrapper.text()).toContain('42%')
    expect(wrapper.find('.update-progress-measured').attributes('style')).toContain('width: 42%')
  })

  it('falls back to an indeterminate bar as long as the worker has reported nothing', () => {
    const wrapper = mountOverlay({ phase: 'downloading', progress: null })

    expect(wrapper.find('.update-progress-indeterminate').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('%')
  })

  it('keeps the timed bar when only the handover remains', () => {
    const wrapper = mountOverlay({ phase: 'applying' })

    expect(wrapper.find('.update-progress-timed').exists()).toBe(true)
    expect(wrapper.text()).toContain('Rechargement en cours...')
  })

  it('escalates with time spent in front of the screen', async () => {
    vi.useFakeTimers()
    const wrapper = mountOverlay({ phase: 'downloading' })

    expect(wrapper.find('.update-dismiss').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.text()).toContain('Connexion lente ?')
    expect(wrapper.find('.update-dismiss').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)
    const dismiss = wrapper.find('.update-dismiss')
    expect(dismiss.exists()).toBe(true)

    await dismiss.trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('counts precached files while downloading', () => {
    const wrapper = mountOverlay({ phase: 'downloading', progress: 0.25, done: 30, total: 120 })

    expect(wrapper.text()).toContain('30 / 120 fichiers')
  })

  it('silences the counter once the download is finished', () => {
    const wrapper = mountOverlay({ phase: 'applying', done: 120, total: 120 })

    expect(wrapper.text()).not.toContain('fichiers')
  })

  it('offers no way out when the update is mandatory', async () => {
    vi.useFakeTimers()
    const wrapper = mountOverlay({ phase: 'downloading', forced: true })

    expect(wrapper.text()).toContain('Mise à jour requise')

    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.text()).toContain('Cette mise à jour est obligatoire.')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.find('.update-dismiss').exists()).toBe(false)
  })

  it('announces the completed update with its version number', async () => {
    vi.useFakeTimers()
    const wrapper = mountOverlay({ phase: 'done', version: '1.19.0' })

    expect(wrapper.text()).toContain('Mise à jour effectuée')
    expect(wrapper.text()).toContain("L'application vient d'être mise à jour.")
    expect(wrapper.find('.update-version').text()).toBe('1.19.0')
    expect(wrapper.find('.update-progress-track').exists()).toBe(false)

    // Nothing is pending: no slow-connection excuse, no escape hatch.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(wrapper.find('.update-hint').exists()).toBe(false)
    expect(wrapper.find('.update-dismiss').exists()).toBe(false)
  })

  it('resets to zero when hidden then shown again', async () => {
    vi.useFakeTimers()
    const wrapper = mountOverlay({ phase: 'downloading' })

    await vi.advanceTimersByTimeAsync(15_000)
    expect(wrapper.find('.update-dismiss').exists()).toBe(true)

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(wrapper.find('.update-dismiss').exists()).toBe(false)
  })
})
