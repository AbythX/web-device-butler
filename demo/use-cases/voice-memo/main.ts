import {
  DefaultDeviceButler,
  type DeviceButler,
  type KeptRecording,
  type MediaRecording,
  type MicrophoneSession,
  type StorageSpaceWatch,
} from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

/**
 * A recording that runs: the microphone, what records it and the watch on the space that is left.
 */
interface Recording {
  readonly session: MicrophoneSession
  readonly recording: MediaRecording
  readonly space: StorageSpaceWatch
}

/**
 * The use case of a voice recorder: a microphone with a level display whose sound is kept in the storage piece by
 * piece, so a memo survives a page that is thrown away while it records.
 */
class VoiceMemos extends DemoPage {
  /** stop before the storage is full, while the end of the recording still fits */
  private static readonly reserve = 20 * 1024 * 1024
  /** where the memos are kept */
  private static readonly namespace = 'memos'

  private readonly butler: DeviceButler

  private recording: Recording | undefined
  private playing: string | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger, storage: { namespace: 'web-device-butler-demo' } })

    this.onClick('record', () => this.record())
    this.onClick('stop', () => this.finish())

    const muted = this.element<HTMLInputElement>('muted')
    muted.addEventListener('change', () => {
      if (this.recording !== undefined) {
        // the microphone keeps running and delivers silence, so the recording has no gap
        this.recording.session.muted = muted.checked
      }
    })

    // what another tab recorded in the meantime
    this.butler.page.on('change', (state) => {
      if (state === 'visible') {
        void this.showMemos()
      }
    })

    void this.run('Loading the memos', () => this.showMemos())
  }

  private async record(): Promise<void> {
    const form = new FormData(this.element<HTMLFormElement>('options'))

    const session = await this.butler.microphone.open({
      prefer: {
        noiseSuppression: form.has('noiseSuppression'),
        echoCancellation: form.has('echoCancellation'),
        autoGainControl: form.has('autoGainControl'),
      },
    })

    try {
      session.muted = this.element<HTMLInputElement>('muted').checked

      // every piece goes into the storage as it arrives, and the memo stays there once it was stopped. The screen
      // stays on, so the phone does not lock in the middle of a memo.
      const running = await this.butler.recorder.record(session, {
        keep: { namespace: VoiceMemos.namespace, after: 'keep' },
        keepAwake: true,
      })

      const space = this.butler.storage.watchSpace({ interval: 2000, lowBelow: VoiceMemos.reserve })
      const recording: Recording = { session, recording: running, space }

      running.on('progress', () => this.showRecording())
      space.on('low', () => void this.run('The storage is almost full, stopping', () => this.finish()))
      // the microphone was unplugged, or the browser or the user stopped it: the recording has ended by itself
      session.on('ended', () => {
        if (this.recording === recording) {
          void this.run('The microphone stopped', () => this.finish())
        }
      })

      const meter = this.element<HTMLMeterElement>('level')
      session.level?.on('change', (level) => (meter.value = level))

      this.recording = recording
      await this.showMemos()
    } catch (error) {
      await session.close()
      throw error
    }
  }

  /**
   * Ends the recording and keeps it. Safe to call when the microphone has ended already.
   */
  private async finish(): Promise<void> {
    const recording = this.recording

    if (recording === undefined) {
      return
    }

    this.recording = undefined
    const { session, space } = recording

    try {
      // a full storage rejects here; what was kept until then stays, as an interrupted memo
      await recording.recording.stop()
    } finally {
      space.dispose()
      await session.close()
      this.element<HTMLMeterElement>('level').value = 0
      await this.showMemos()
    }
  }

  private async play(memo: KeptRecording): Promise<void> {
    // a memo in several segments is several files; this page plays the first
    const { segments } = await memo.read()
    const sound = segments[0]?.blob

    if (sound === undefined) {
      throw new Error('Nothing of this memo was kept')
    }

    if (this.playing !== undefined) {
      URL.revokeObjectURL(this.playing)
    }

    this.playing = URL.createObjectURL(sound)

    const player = this.element<HTMLAudioElement>('player')
    player.hidden = false
    player.src = this.playing
    await player.play()
  }

  private async remove(memo: KeptRecording): Promise<void> {
    await memo.delete()
    await this.showMemos()
  }

  // ---- output ----

  private showRecording(): void {
    const recording = this.recording
    this.element<HTMLButtonElement>('record').disabled = recording !== undefined
    this.element<HTMLButtonElement>('stop').disabled = recording === undefined

    if (recording === undefined) {
      this.element('recording').replaceChildren()

      return
    }

    const { recording: running, session } = recording
    this.describe('recording', {
      Microphone: session.descriptor.label,
      Length: VoiceMemos.duration(running.duration),
      Kept: DemoPage.bytes(running.bytes),
    })
  }

  private async showMemos(): Promise<void> {
    const memos = await this.butler.recorder.kept(VoiceMemos.namespace).list()
    memos.sort((first, second) => second.startedAt - first.startedAt)

    const rows = memos.map((memo) =>
      this.row(
        new Date(memo.startedAt).toLocaleString(),
        VoiceMemos.duration(memo.duration),
        DemoPage.bytes(memo.bytes),
        // interrupted: the page was thrown away or crashed while it recorded, and this is what was kept
        memo.state,
        this.button('Play', () => this.play(memo)),
        this.button('Delete', () => this.remove(memo))
      )
    )

    this.element('memos').replaceChildren(...rows)

    const space = await this.butler.storage.space()
    this.element('space').textContent =
      `${memos.length} kept` + (space.isKnown ? `, ${DemoPage.bytes(space.available)} free` : '')
  }

  private static duration(milliseconds: number): string {
    const seconds = Math.round(milliseconds / 1000)

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }

  protected override refresh(): void {
    this.showRecording()
  }
}

Reflect.set(globalThis, 'demo', new VoiceMemos(document))
