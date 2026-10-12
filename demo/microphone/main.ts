import {
  type AudioOutputDescriptor,
  DefaultDeviceButler,
  type DeviceButler,
  type EventSubscription,
  type MicrophoneDescriptor,
  type MicrophoneProcessingName,
  type MicrophoneRequirements,
  type MicrophoneSession,
  type MicrophoneTraits,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page of the microphones: lists every microphone with what the library found out about it and lets a
 * tester try the processing, the level and muting. It is the tool for the microphone part of the device matrix.
 */
class MicrophoneDemo extends DemoPage {
  private static readonly processingNames: readonly MicrophoneProcessingName[] = [
    'echoCancellation',
    'noiseSuppression',
    'autoGainControl',
  ]

  private readonly butler: DeviceButler

  private microphones: readonly MicrophoneDescriptor[] = []
  private selected: MicrophoneDescriptor | undefined
  private session: MicrophoneSession | undefined
  /** the meter only measures while someone listens, so not listening switches it off */
  private levelSubscription: EventSubscription | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger })

    this.butler.microphone.on('accesschange', () => this.showAccess())
    this.butler.microphone.on('availabilitychange', (availability) => {
      this.logger.info(`availabilitychange: ${availability}`)
      this.showFacts()
    })
    this.butler.microphone.on('change', (microphones) => {
      this.logger.info(`change: ${microphones.length} microphones`)
      this.showMicrophones(microphones)
    })

    this.onClick('prepare', () => this.prepare())
    this.onClick('open', () => this.open(this.requirements))
    this.onClick('list', async () => this.showMicrophones(await this.butler.microphone.list()))
    this.onClick('close', () => this.session?.close())
    this.onClick('report', () => this.showReport())
    this.onClick('copy', () => this.butler.clipboard.writeText(this.element('report-output').textContent ?? ''))

    this.butler.audioOutput.on('change', (outputs) => {
      this.logger.info(`audioOutput change: ${outputs.length} outputs`)
      this.showOutputs(outputs)
    })
    this.onClick('outputs', async () => this.showOutputs(await this.butler.audioOutput.list()))
    this.onClick('choose', async () => {
      const chosen = await this.butler.audioOutput.choose()

      this.status(`choose(): ${chosen === undefined ? 'the user closed the list' : `'${chosen.label}'`}`)
      this.showOutputs(await this.butler.audioOutput.list())
    })
    this.onClick('route-default', () => this.route(undefined))
    this.player.src = URL.createObjectURL(MicrophoneDemo.tone())

    const muted = this.element<HTMLInputElement>('muted')
    muted.addEventListener('change', () => {
      if (this.session !== undefined) {
        this.session.muted = muted.checked
      }
    })
    this.element('measure').addEventListener('change', () => this.measure())

    this.showFacts()
    this.showAccess()
  }

  /**
   * What the form asks of a microphone.
   */
  private get requirements(): MicrophoneRequirements {
    const form = new FormData(this.element<HTMLFormElement>('requirements'))
    const require: MicrophoneTraits = {}
    const prefer: MicrophoneTraits = {}
    /** where the form puts a trait: among what a microphone must have, or among what it should have */
    const placeOf = (name: string) => ({ require, prefer })[String(form.get(name))]

    for (const name of MicrophoneDemo.processingNames) {
      const traits = placeOf(name)

      if (traits !== undefined) {
        traits[name] = true
      } else if (form.get(name) === 'off') {
        prefer[name] = false
      }
    }

    const stereo = placeOf('stereo')

    if (stereo !== undefined) {
      stereo.channelCount = 2
    }

    const usesDefault = placeOf('default')

    if (usesDefault !== undefined) {
      usesDefault.default = true
    }

    return {
      require,
      prefer,
      // SAFETY: the select of the form only offers the busy policies of the type
      whenBusy: form.get('whenBusy') as MicrophoneRequirements['whenBusy'],
      exclusive: form.has('exclusive'),
      autoRecover: form.has('autoRecover'),
    }
  }

  private get player(): HTMLAudioElement {
    return this.element<HTMLAudioElement>('player')
  }

  /**
   * Sends the tone to an output, or back to the default of the system.
   */
  private async route(output: AudioOutputDescriptor | undefined): Promise<void> {
    await this.butler.audioOutput.route(this.player, output)
    this.showOutputs(await this.butler.audioOutput.list())
  }

  private async prepare(): Promise<void> {
    // the form is the configuration: what prepare() prepares is what open() uses afterwards
    this.butler.microphone.configure(this.requirements)

    const { microphone } = await this.butler.prepare({ microphone: true })
    this.selected = microphone?.selected
    this.showMicrophones(microphone?.microphones ?? [])

    if (microphone?.error !== undefined) {
      throw microphone.error
    }

    this.status(`prepare(): permission ${microphone?.permission}, selected '${microphone?.selected?.label}'`)
  }

  private async open(requirements: Partial<MicrophoneRequirements>): Promise<void> {
    await this.session?.close()

    const session = await this.butler.microphone.open(requirements)
    this.session = session
    this.selected = session.descriptor
    session.muted = this.element<HTMLInputElement>('muted').checked

    session.on('statechange', (state) => {
      this.logger.info(`statechange: ${state}`)
      this.showSession()
    })
    session.on('settingschange', (settings) => {
      this.logger.info('settingschange', settings)
      this.showSession()
    })
    session.on('trackchange', () => this.logger.info('trackchange: the microphone was started again'))
    session.on('mutechange', (muted) => this.logger.info(`mutechange: ${muted}`))
    session.on('ended', ({ reason }) => {
      this.logger.info(`ended: ${reason}`)
      this.session = undefined
      this.levelSubscription = undefined
      this.showSession()
    })

    this.measure()
    this.showMicrophones(await this.butler.microphone.list())
    this.showSession()
  }

  /**
   * Listens to the level, or stops listening, as the checkbox says.
   */
  private measure(): void {
    const meter = this.element<HTMLMeterElement>('level')
    this.levelSubscription?.unsubscribe()
    this.levelSubscription = undefined
    meter.value = 0

    if (this.element<HTMLInputElement>('measure').checked) {
      this.levelSubscription = this.session?.level?.on('change', (level) => (meter.value = level))
    }
  }

  // ---- output ----

  private showFacts(): void {
    const { platform, coordination, microphone } = this.butler

    this.describe('facts', {
      'User agent': navigator.userAgent,
      Platform: platform.isIos ? 'iOS' : platform.isAndroid ? 'Android' : 'other',
      'Secure context': String(globalThis.isSecureContext),
      'Cross-tab locks': String(coordination.isCrossTab),
      Availability: microphone.availability,
    })
  }

  private showAccess(): void {
    this.element('access').textContent = `access: ${this.butler.microphone.access.any}`
  }

  private showMicrophones(microphones: readonly MicrophoneDescriptor[]): void {
    this.microphones = microphones

    const rows = microphones.map((microphone) => {
      const { features } = microphone
      // a microphone that was only listed says nothing about what it can do
      const has = (feature: boolean): string => (microphone.detail === 'listed' ? '?' : feature ? 'yes' : 'no')

      const row = this.row(
        microphone.label || microphone.id || '(no label)',
        microphone.isDefault ? 'yes' : '',
        microphone.detail,
        has(features.echoCancellation),
        has(features.noiseSuppression),
        has(features.autoGainControl),
        String(features.maxChannelCount ?? '?'),
        String(features.maxSampleRate ?? '?'),
        this.button('open({ id })', () => this.open({ id: microphone.id }))
      )

      row.classList.toggle('selected', microphone.id === this.selected?.id)
      row.classList.toggle('running', microphone.id === this.session?.descriptor.id)

      return row
    })

    this.element('microphones').replaceChildren(...rows)
  }

  private showOutputs(outputs: readonly AudioOutputDescriptor[]): void {
    const { audioOutput } = this.butler
    const routed = audioOutput.routeOf(this.player)

    const rows = outputs.map((output) =>
      this.row(
        output.label || output.id || '(no label)',
        output.isDefault ? 'yes' : '',
        // without a route the sound goes to the default of the system
        (routed === undefined ? output.isDefault : output.id === routed) ? 'yes' : '',
        this.button('route(player, output)', () => this.route(output))
      )
    )

    this.element('output-list').replaceChildren(...rows)
    this.element('output-facts').textContent =
      `canChoose: ${audioOutput.canChoose}, canRoute: ${audioOutput.canRoute(this.player)}`
  }

  private showSession(): void {
    const session = this.session
    this.element('session').hidden = session === undefined

    if (session === undefined) {
      return
    }

    const { settings, descriptor, processing } = session

    this.element('session-state').textContent = session.state
    this.element<HTMLInputElement>('muted').checked = session.muted
    this.describe('session-facts', {
      Microphone: `${descriptor.label}${descriptor.isDefault ? ' (default)' : ''}`,
      Delivers: `${settings.channelCount ?? '?'} channels @ ${settings.sampleRate ?? '?'} Hz`,
      'Echo cancellation': MicrophoneDemo.onOff(processing.echoCancellation),
      'Noise suppression': MicrophoneDemo.onOff(processing.noiseSuppression),
      'Auto gain': MicrophoneDemo.onOff(processing.autoGainControl),
      'Can be switched': processing.available.join(', ') || 'nothing',
      Level: session.level === undefined ? 'not available' : session.level.isRunning ? 'measuring' : 'not measuring',
    })

    const controls = MicrophoneDemo.processingNames.map((name) => {
      const next = !processing[name]

      return this.button(`processing.set({ ${name}: ${next} })`, () => processing.set({ [name]: next }))
    })

    this.element('controls').replaceChildren(...controls)
  }

  private static onOff(enabled: boolean): string {
    return enabled ? 'on' : 'off'
  }

  /**
   * Two seconds of a tone as a WAV file, so the outputs have something to play that needs no microphone.
   */
  private static tone(): Blob {
    const rate = 8000
    const samples = rate * 2
    const wav = new DataView(new ArrayBuffer(44 + samples * 2))

    const text = (offset: number, value: string): void => {
      for (let index = 0; index < value.length; index++) {
        wav.setUint8(offset + index, value.charCodeAt(index))
      }
    }

    // the header of a file with one channel of 16 bits
    text(0, 'RIFF')
    wav.setUint32(4, 36 + samples * 2, true)
    text(8, 'WAVEfmt ')
    wav.setUint32(16, 16, true)
    wav.setUint16(20, 1, true)
    wav.setUint16(22, 1, true)
    wav.setUint32(24, rate, true)
    wav.setUint32(28, rate * 2, true)
    wav.setUint16(32, 2, true)
    wav.setUint16(34, 16, true)
    text(36, 'data')
    wav.setUint32(40, samples * 2, true)

    for (let sample = 0; sample < samples; sample++) {
      // 440 Hz fits into two seconds a whole number of times, so the loop has no click
      wav.setInt16(44 + sample * 2, Math.sin((sample / rate) * 2 * Math.PI * 440) * 6000, true)
    }

    return new Blob([wav], { type: 'audio/wav' })
  }

  private showReport(): void {
    const { platform, coordination, microphone } = this.butler

    const report = {
      date: new Date().toISOString(),
      notes: this.element<HTMLTextAreaElement>('notes').value,
      userAgent: navigator.userAgent,
      platform: platform.isIos ? 'ios' : platform.isAndroid ? 'android' : 'other',
      crossTabLocks: coordination.isCrossTab,
      access: microphone.access.any,
      requirements: this.requirements,
      selected: this.selected?.id,
      audioOutput: {
        canChoose: this.butler.audioOutput.canChoose,
        canRoute: this.butler.audioOutput.canRoute(this.player),
        routedTo: this.butler.audioOutput.routeOf(this.player),
      },
      microphones: this.microphones.map((descriptor) => ({
        id: descriptor.id,
        label: descriptor.label,
        detail: descriptor.detail,
        isDefault: descriptor.isDefault,
        features: descriptor.features.toJSON(),
      })),
      session:
        this.session === undefined
          ? undefined
          : {
              microphone: this.session.descriptor.id,
              settings: this.session.settings,
              trackSettings: this.session.track.getSettings(),
              trackCapabilities: this.session.track.getCapabilities?.(),
            },
      timings: this.timings,
    }

    this.element('report-output').textContent = JSON.stringify(report, undefined, 2)
  }

  protected override refresh(): void {
    this.showFacts()
    this.showAccess()

    if (this.session !== undefined) {
      this.showSession()
    }
  }
}

Reflect.set(globalThis, 'demo', new MicrophoneDemo(document))
