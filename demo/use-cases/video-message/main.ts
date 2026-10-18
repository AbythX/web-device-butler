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
 * while it records, and a recording that survives a page that is thrown away.
 */
class VideoMessage extends DemoPage {
  /** the message that is being recorded, in the storage until it is stopped */
  private static readonly draft = { namespace: 'video-messages', id: 'draft' }

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

    void this.run('Looking for an interrupted message', () => this.recover())
  }

  /**
   * A message the last visit could not finish: the page was thrown away or crashed while it recorded.
   */
  private async recover(): Promise<void> {
    const { namespace, id } = VideoMessage.draft
    const draft = await this.butler.recorder.kept(namespace).get(id)

    if (draft?.state !== 'interrupted') {
      return
    }

    const { blob, segments } = await draft.read()
    const message = blob ?? segments[0]?.blob

    if (message !== undefined) {
      this.showMessage(message)
      this.status(`A message of ${Math.round(draft.duration / 1000)} s was interrupted; this is what was kept`)
    }

    await draft.delete()
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
    // on. It is kept in the storage until it is stopped, so the next visit finds it if this page is thrown away.
    const recording = await this.butler.recorder.record(session, { keepAwake: true, keep: VideoMessage.draft })
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
