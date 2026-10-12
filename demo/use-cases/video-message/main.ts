import {
  type CombinedMediaSession,
  DefaultDeviceButler,
  type DeviceButler,
  type MediaBusyPolicy,
  type MediaRecording,
} from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

/**
 * The use case of a video message: a camera and a microphone as one session, which no other tab can interrupt
 * while it records.
 */
class VideoMessage extends DemoPage {
  private readonly butler: DeviceButler

  private session: CombinedMediaSession | undefined
  private recording: MediaRecording | undefined
  private message: string | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({
      logger: this.logger,
      camera: { require: { facing: 'front' }, prefer: { width: 1280, height: 720 } },
      microphone: { prefer: { echoCancellation: true, noiseSuppression: true } },
    })

    this.onClick('start', () => this.start('fail'))
    this.onClick('takeover', () => this.start('takeover'))
    this.onClick('record', () => this.record())
    this.onClick('finish', () => this.recording?.stop())
    this.onClick('close', () => this.session?.close())
  }

  private async start(whenBusy: MediaBusyPolicy): Promise<void> {
    await this.session?.close()

    // if the microphone cannot be opened, the camera is closed again: there is a session with both or none
    const session = await this.butler.media.open({ camera: { whenBusy } })
    session.on('statechange', (state) => this.logger.info(`statechange: ${state}`))
    session.on('ended', ({ reason, source }) => {
      this.session = undefined
      // a recording ends by itself when its session ends, and keeps what it has
      this.showSession()

      if (reason !== 'closed') {
        this.status(`The session ended: ${reason}${source === undefined ? '' : `, first the ${source}`}`, true)
      }
    })
    this.session = session
  }

  private async record(): Promise<void> {
    const session = this.session

    if (session === undefined) {
      return
    }

    // While it runs, a tab that asks with `whenBusy: 'takeover'` gets a MediaDeviceBusyError, and the screen stays
    // on. A short message fits in memory.
    const recording = await this.butler.recorder.record(session, { keepAwake: true })
    this.recording = recording

    // however it ends: stopped here, or because the session ended
    void recording.finished
      .then(({ blob, segments }) => {
        // one segment, unless a device was started again while it recorded; then this page shows the first
        const message = blob ?? segments[0]?.blob

        if (message !== undefined) {
          this.showMessage(message)
        }
      })
      .catch((error: unknown) => this.status(`The recording failed: ${String(error)}`, true))
      .finally(() => {
        this.recording = undefined
        this.showSession()
      })
  }

  // ---- output ----

  private showSession(): void {
    const session = this.session
    const isRecording = this.recording !== undefined

    const preview = this.element<HTMLVideoElement>('preview')
    preview.hidden = session === undefined
    preview.srcObject = session?.stream ?? null
    preview.classList.toggle('recording', isRecording)

    this.element<HTMLButtonElement>('record').disabled = session === undefined || isRecording
    this.element<HTMLButtonElement>('finish').disabled = !isRecording
    this.element<HTMLButtonElement>('close').disabled = session === undefined

    if (session === undefined) {
      this.element('session').replaceChildren()

      return
    }

    const { camera, microphone } = session
    this.describe('session', {
      State: isRecording ? 'recording' : session.state,
      Camera: `${camera.descriptor.label}, ${camera.settings.resolution?.toString() ?? 'unknown'}`,
      Microphone: microphone.descriptor.label,
      'Another tab may take over': String(session.allowTakeover),
    })
  }

  private showMessage(message: Blob): void {
    if (this.message !== undefined) {
      URL.revokeObjectURL(this.message)
    }

    this.message = URL.createObjectURL(message)

    this.element('result').hidden = false
    this.element('result-size').textContent = DemoPage.bytes(message.size)
    this.element<HTMLVideoElement>('message').src = this.message
    this.element<HTMLAnchorElement>('download').href = this.message
  }

  protected override refresh(): void {
    this.showSession()
  }
}

Reflect.set(globalThis, 'demo', new VideoMessage(document))
