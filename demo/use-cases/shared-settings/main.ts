import { DefaultDeviceButler, type DeviceButler, type Store, type StoreChange } from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

interface Settings {
  /** a value of the CSS property `color-scheme` */
  theme: string
  name: string
}

/**
 * The use case of settings that several tabs of an application share: every tab shows the same, and no tab loses
 * what another one wrote.
 */
class SharedSettings extends DemoPage {
  private static readonly settingsKey = 'user'
  private static readonly defaults: Settings = { theme: 'light dark', name: '' }

  private readonly butler: DeviceButler
  private readonly settings: Promise<Store<Settings>>
  private readonly counters: Promise<Store<number>>
  /** what the form showed before the user changed it */
  private shown = SharedSettings.defaults

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger, storage: { namespace: 'web-device-butler-demo' } })

    // several tabs update this data at once, so it belongs in a driver that is consistent across tabs
    const driver = ['indexeddb', 'local']
    this.settings = this.butler.storage.open<Settings>({ driver, namespace: 'settings' })
    this.counters = this.butler.storage.open<number>({ driver, namespace: 'counters' })

    const form = this.element<HTMLFormElement>('settings')
    form.addEventListener('change', () => void this.run('Saving', () => this.save(new FormData(form))))
    form.addEventListener('submit', (event) => event.preventDefault())

    this.onClick('click', () => this.count('clicks'))
    this.onClick('click-many', async () => {
      for (let click = 0; click < 100; click++) {
        await this.count('clicks')
      }
    })
    this.onClick('reset', async () => {
      await (await this.settings).clear()
      await (await this.counters).clear()
    })

    void this.run('Loading', () => this.load())
  }

  private async load(): Promise<void> {
    const settings = await this.settings
    const counters = await this.counters
    this.element('driver').textContent = `on '${settings.capabilities.driver}'`

    // one listener for the changes of this tab and of the others
    settings.on('change', (change) => {
      this.showChange('settings', change)
      void this.showSettings()
    })
    counters.on('change', (change) => {
      this.showChange('counters', change)
      void this.showCounters()
    })

    await this.count('visits')
    await this.showSettings()
    await this.showCounters()
  }

  /**
   * Writes the fields that the form holds over what is stored. The tabs read and write as one step, so two tabs that
   * change different fields at once do not undo each other.
   */
  private async save(form: FormData): Promise<void> {
    const changes: Settings = { theme: String(form.get('theme')), name: String(form.get('name')) }
    const shown = this.shown

    await (
      await this.settings
    ).update(SharedSettings.settingsKey, (current = SharedSettings.defaults) => ({
      // only what the user changed in this tab; the rest may be newer in the storage than on this page
      theme: changes.theme === shown.theme ? current.theme : changes.theme,
      name: changes.name === shown.name ? current.name : changes.name,
    }))
  }

  private async count(counter: string): Promise<void> {
    await (await this.counters).update(counter, (count = 0) => count + 1)
  }

  private async stored(): Promise<Settings> {
    return (await (await this.settings).get(SharedSettings.settingsKey)) ?? SharedSettings.defaults
  }

  // ---- output ----

  private async showSettings(): Promise<void> {
    this.shown = await this.stored()
    const { theme, name } = this.shown
    const form = this.element<HTMLFormElement>('settings')

    this.page.documentElement.style.colorScheme = theme
    form.querySelector<HTMLSelectElement>('[name=theme]')!.value = theme
    form.querySelector<HTMLInputElement>('[name=name]')!.value = name
    this.element('greeting').textContent = `Hello, ${name || 'nobody'}.`
  }

  private async showCounters(): Promise<void> {
    const counters = await this.counters
    this.describe('counters', {
      'Page loads, all tabs': String((await counters.get('visits')) ?? 0),
      'Clicks, all tabs': String((await counters.get('clicks')) ?? 0),
    })
  }

  private showChange(store: string, { key, origin }: StoreChange): void {
    const row = this.row(new Date().toLocaleTimeString(), origin === 'remote' ? 'another tab' : 'this tab', store, key)
    row.classList.toggle('remote', origin === 'remote')

    const changes = this.element('changes')
    changes.prepend(row)

    while (changes.childElementCount > 50) {
      changes.lastElementChild?.remove()
    }
  }
}

Reflect.set(globalThis, 'demo', new SharedSettings(document))
