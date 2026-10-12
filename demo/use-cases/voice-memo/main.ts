import {
  BinaryCodec,
  DefaultDeviceButler,
  type DeviceButler,
  type MediaRecording,
  type MicrophoneSession,
  type StorageSpaceWatch,
  type Store,
} from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

/**
 * What is kept about a memo, next to its sound.
 */
interface Memo {
  id: string
  recordedAt: number
  /** in milliseconds */
  duration: number
  /** what the recorder of this browser produced, which the player has to be told */
  mimeType: string
  bytes: number
  /** how many entries hold the sound; more than one if the microphone was started again while it recorded */
  segments?: number
}

/**
 * A recording that runs: the microphone, what records it and the watch on the space that is left.
 */
interface Recording {
  readonly memo: Memo
  readonly session: MicrophoneSession
  readonly recording: MediaRecording
  readonly space: StorageSpaceWatch
}

/**
 * The use case of a voice recorder: a microphone with a level display whose sound is stored as a stream.
 */
class VoiceMemos extends DemoPage {
  /** stop before the storage is full, while the end of the recording still fits */
  private static readonly reserve = 20 * 1024 * 1024

  private readonly butler: DeviceButler
  /** the sound, on a driver that can be written as a stream */
  private readonly sounds: Promise<Store<Uint8Array>>
  private readonly memos: Promise<Store<Memo>>

  private recording: Recording | undefined
  private playing: string | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger, storage: { namespace: 'web-device-butler-demo' } })

    // only `opfs` and `memory` can be written as a stream; memory keeps the memos until the page is left
    this.sounds = this.butler.storage.open({
      driver: ['opfs', 'memory'],
      namespace: 'memos',
      codec: new BinaryCodec(),
    })
    // the list lives as long as the sounds do
    this.memos = this.sounds.then((sounds) =>
      this.butler.storage.open<Memo>({
        driver: sounds.capabilities.persistence === 'origin' ? ['indexeddb', 'local'] : ['memory'],
        namespace: 'memo-index',
      })
    )

    this.onClick('record', () => this.record())
    this.onClick('stop', () => this.finish())

    const muted = this.element<HTMLInputElement>('muted')
    muted.addEventListener('change', () => {
      if (this.recording !== undefined) {
        // the microphone keeps running and delivers silence, so the recording has no gap
        this.recording.session.muted = muted.checked
      }
    })

    void this.run('Loading the memos', async () => {
      ;(await this.memos).on('change', ({ origin }) => {
        if (origin === 'remote') {
          void this.showMemos()
        }
      })
      await this.showMemos()
    })
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

      const memo: Memo = { id: crypto.randomUUID(), recordedAt: Date.now(), duration: 0, mimeType: '', bytes: 0 }
      const sounds = await this.sounds

      // every piece goes straight into a stream of the store. Until the stream is closed, the entry does not exist
      // for anyone else. The screen stays on, so the phone does not lock in the middle of a memo.
      const running = await this.butler.recorder.record(session, {
        into: (segment) => sounds.writeStream(VoiceMemos.keyOf(memo, segment)),
        keepAwake: true,
      })

      memo.mimeType = running.mimeType

      const space = this.butler.storage.watchSpace({ interval: 2000, lowBelow: VoiceMemos.reserve })
      const recording: Recording = { memo, session, recording: running, space }

      running.on('progress', ({ duration, bytes }) => {
        memo.duration = duration
        memo.bytes = bytes
        this.showRecording()
      })
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
    const { memo, session, space } = recording

    try {
      // the last piece is written and the stream closed: now the entry is there, in one step. A recording that
      // could not be written to its end rejects here, and nothing is kept of it.
      const { duration, bytes, segments } = await recording.recording.stop()

      if (segments.length > 0) {
        await (await this.memos).set(memo.id, { ...memo, duration, bytes, segments: segments.length })
      }
    } finally {
      space.dispose()
      await session.close()
      this.element<HTMLMeterElement>('level').value = 0
      await this.showMemos()
    }
  }

  private async play(memo: Memo): Promise<void> {
    // a memo in several segments is several files; this page plays the first
    const stream = await (await this.sounds).readStream(VoiceMemos.keyOf(memo, 0))

    if (stream === undefined) {
      throw new Error('The sound of this memo is gone')
    }

    const sound = await new Response(stream).blob()

    if (this.playing !== undefined) {
      URL.revokeObjectURL(this.playing)
    }

    this.playing = URL.createObjectURL(new Blob([sound], { type: memo.mimeType }))

    const player = this.element<HTMLAudioElement>('player')
    player.hidden = false
    player.src = this.playing
    await player.play()
  }

  private async remove(memo: Memo): Promise<void> {
    await (await this.memos).delete(memo.id)

    for (let segment = 0; segment < (memo.segments ?? 1); segment++) {
      await (await this.sounds).delete(VoiceMemos.keyOf(memo, segment))
    }

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

    const { memo, session } = recording
    this.describe('recording', {
      Microphone: session.descriptor.label,
      Length: VoiceMemos.duration(memo.duration),
      Written: DemoPage.bytes(memo.bytes),
    })
  }

  private async showMemos(): Promise<void> {
    const memos: Memo[] = []

    for await (const [, memo] of (await this.memos).entries()) {
      memos.push(memo)
    }

    memos.sort((first, second) => second.recordedAt - first.recordedAt)

    const rows = memos.map((memo) =>
      this.row(
        new Date(memo.recordedAt).toLocaleString(),
        VoiceMemos.duration(memo.duration),
        DemoPage.bytes(memo.bytes),
        this.button('Play', () => this.play(memo)),
        this.button('Delete', () => this.remove(memo))
      )
    )

    this.element('memos').replaceChildren(...rows)

    const space = await this.butler.storage.space()
    this.element('space').textContent =
      `${memos.length} on '${(await this.sounds).capabilities.driver}'` +
      (space.isKnown ? `, ${DemoPage.bytes(space.available)} free` : '')
  }

  /**
   * The entry that holds a segment of the sound of a memo.
   */
  private static keyOf(memo: Memo, segment: number): string {
    return segment === 0 ? memo.id : `${memo.id}-${segment}`
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
