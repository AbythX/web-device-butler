import {
  DefaultDeviceButler,
  type DeviceButler,
  type MediaRecording,
  type MicrophoneSession,
  type ScreenCaptureRequirements,
  type ScreenCaptureSession,
  type WakeLockHold,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page of the screen: the wake lock, an element that fills the screen, a page that is kept from turning,
 * a capture of the screen that is recorded with the microphone, and what the page is told about itself.
 */
class ScreenDemo extends DemoPage {
  private readonly butler: DeviceButler
  /** the holds that are out, the oldest first */
  private readonly holds: WakeLockHold[] = []
  private capture: ScreenCaptureSession | undefined
  private microphone: MicrophoneSession | undefined
  private recording: MediaRecording | undefined
  private recordingUrl: string | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger })

    const { wakeLock, fullscreen, orientation } = this.butler

    wakeLock.on('change', (isActive) => this.note('wakeLock change', isActive ? 'active' : 'not active'))
    fullscreen.on('change', (element) => this.note('fullscreen change', element?.id ?? 'no element'))
    orientation.on('change', (kind) => this.note('orientation change', kind))
    this.butler.page.on('change', (state) => this.note('page change', state))
    this.butler.page.on('leave', ({ isKept }) => this.note('page leave', isKept ? 'kept' : 'not kept'))

    this.onClick('request', async () => this.holds.push(await wakeLock.request()))
    this.onClick('release', () => this.holds.pop()?.release())

    this.onClick('enter-stage', () => fullscreen.enter(this.element('stage')))
    this.onClick('enter-clip', () => fullscreen.enter(this.clip))
    this.onClick('exit', () => fullscreen.exit())

    this.onClick('lock-portrait', () => orientation.lock('portrait'))
    this.onClick('lock-landscape', () => orientation.lock('landscape'))
    this.onClick('unlock', () => orientation.unlock())

    this.onClick('capture', () => this.openCapture())
    this.onClick('capture-window', () => this.openCapture({ prefer: { surface: 'window' }, content: 'text' }))
    this.onClick('capture-audio', () => this.openCapture({ require: { audio: true } }))
    this.onClick('capture-monitor', () => this.openCapture({ require: { surface: 'monitor' } }))
    this.onClick('capture-close', () => this.capture?.close())
    this.onClick('tutorial-start', () => this.startTutorial())
    this.onClick('tutorial-stop', () => this.stopTutorial())

    this.play()
    this.showFacts()
  }

  // ---- screen capture ----

  private async openCapture(requirements?: ScreenCaptureRequirements): Promise<ScreenCaptureSession> {
    await this.capture?.close()

    const session = await this.butler.screenCapture.open(requirements)
    this.capture = session
    this.element<HTMLVideoElement>('capture-preview').srcObject = session.stream

    session.on('settingschange', ({ width, height }) => this.note('screenCapture settingschange', `${width}x${height}`))
    session.on('ended', ({ reason }) => {
      this.note('screenCapture ended', reason)
      this.element<HTMLVideoElement>('capture-preview').srcObject = null
    })

    return session
  }

  /**
   * A tutorial: the screen with the voice of the user, in one file.
   */
  private async startTutorial(): Promise<void> {
    const screen =
      this.capture === undefined || this.capture.state === 'ended' ? await this.openCapture() : this.capture

    this.microphone ??= await this.butler.microphone.open()

    const recording = await this.butler.recorder.record(this.butler.media.join(screen, this.microphone))
    this.recording = recording
    recording.on('statechange', (state) => this.note('recording statechange', state))
    // stopping to share the screen ends the recording as well
    void recording.finished.then(
      (result) => this.show(result.blob),
      () => undefined
    )
  }

  private async stopTutorial(): Promise<void> {
    await this.recording?.stop()
    await this.microphone?.close()
    this.microphone = undefined
  }

  private show(blob: Blob | undefined): void {
    const video = this.element<HTMLVideoElement>('capture-recording')

    if (this.recordingUrl !== undefined) {
      URL.revokeObjectURL(this.recordingUrl)
    }

    this.recordingUrl = blob === undefined ? undefined : URL.createObjectURL(blob)
    video.hidden = this.recordingUrl === undefined
    video.src = this.recordingUrl ?? ''
  }

  private get clip(): HTMLVideoElement {
    return this.element<HTMLVideoElement>('clip')
  }

  /**
   * Gives the video something to show without a camera: a canvas with the time on it.
   */
  private play(): void {
    const canvas = Object.assign(this.page.createElement('canvas'), { width: 640, height: 360 })
    const context = canvas.getContext('2d')

    if (context === null || !('captureStream' in canvas)) {
      this.clip.hidden = true

      return
    }

    const draw = (): void => {
      context.fillStyle = '#1f3a5f'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#fff'
      context.font = '48px system-ui, sans-serif'
      context.textAlign = 'center'
      context.fillText(new Date().toLocaleTimeString(), canvas.width / 2, canvas.height / 2)
    }

    draw()
    setInterval(draw, 1000)

    this.clip.srcObject = canvas.captureStream()
    // a browser that only plays in answer to a click still shows the first picture
    this.clip.play().catch(() => this.logger.info('The video waits for a click'))
  }

  // ---- output ----

  /**
   * Writes down what the page was told. The table stays when the page was in the background in between.
   */
  private note(event: string, payload: string): void {
    this.logger.info(`${event}: ${payload}`)
    this.element('events').prepend(this.row(new Date().toLocaleTimeString(), event, payload))
    this.showFacts()
  }

  private showFacts(): void {
    const { wakeLock, fullscreen, orientation, page, platform } = this.butler

    this.describe('facts', {
      'User agent': navigator.userAgent,
      Platform: platform.isIos ? 'iOS' : platform.isAndroid ? 'Android' : 'other',
      'Secure context': String(globalThis.isSecureContext),
      'Wake lock': wakeLock.isSupported ? (wakeLock.isActive ? 'active' : 'not active') : 'not supported',
      'Fullscreen with any element': String(fullscreen.isSupported),
      'Fullscreen with the video': String(fullscreen.canEnter(this.clip)),
      'Page can be kept from turning': String(orientation.canLock),
      Page: page.state ?? 'unknown',
    })
    this.describe('stage-facts', {
      'Fills the screen': fullscreen.element?.id ?? 'nothing',
      Orientation: orientation.current ?? 'unknown',
    })

    const { screenCapture } = this.butler
    const capture = this.capture?.state === 'ended' ? undefined : this.capture
    const settings = capture?.settings

    this.describe('capture-facts', {
      Supported: String(screenCapture.isSupported),
      Shared: capture === undefined ? 'nothing' : (capture.surface ?? 'not reported'),
      Size: settings === undefined ? '' : `${settings.width}x${settings.height} at ${settings.frameRate} fps`,
      Sound: capture === undefined ? '' : String(capture.audio !== undefined),
      Recording: this.recording?.state ?? 'none',
    })
    this.element('capture-state').textContent = capture?.state ?? ''

    this.element('holds').textContent = `${this.holds.length} out, ${wakeLock.isRequested ? '' : 'not '}requested`
  }

  protected override refresh(): void {
    this.showFacts()
  }
}

Reflect.set(globalThis, 'demo', new ScreenDemo(document))
