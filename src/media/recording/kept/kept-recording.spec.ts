import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { CrossTabLock } from '../../../core/coordination/lock/cross-tab-lock.ts'
import type {
  LockLike,
  LockManagerLike,
  LockRequestOptions,
} from '../../../core/coordination/lock/lock-manager-like.ts'
import { BrowserEnvironment, type BrowserGlobals } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultPageLifecycle } from '../../../platform/page/default-page-lifecycle.ts'
import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import { BinaryCodec } from '../../../storage/codecs/binary-codec.ts'
import { StorageQuotaExceededError } from '../../../storage/errors/storage-quota-exceeded-error.ts'
import { FakeBrowser } from '../../../storage/testing/fake-browser.ts'
import { FakeStorage } from '../../../storage/testing/fake-storage.ts'
import { MediaError } from '../../errors/media-error.ts'
import { DefaultMediaRecordingManager } from '../default-media-recording-manager.ts'
import type { MediaRecordingManager } from '../media-recording-manager.ts'
import { FakeMediaRecorder } from '../testing/fake-media-recorder.ts'
import { FakeRecordingSource } from '../testing/fake-recording-source.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 200 && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const textOf = async (blob: Blob | undefined) => (blob === undefined ? undefined : await blob.text())

/**
 * The locks of one tab. The browser releases them when the tab is thrown away or crashes, which {@link crash} does.
 */
class TabLocks implements LockManagerLike {
  private release!: () => void
  private readonly crashed = new Promise<void>((resolve) => (this.release = resolve))

  public constructor(private readonly locks: LockManagerLike) {}

  public request(
    name: string,
    options: LockRequestOptions,
    callback: (lock: LockLike | null) => Promise<void>
  ): Promise<unknown> {
    return this.locks.request(name, options, (lock) => Promise.race([callback(lock), this.crashed]))
  }

  public query() {
    return this.locks.query()
  }

  /** the tab is gone: nothing of it runs any more, and its locks are free */
  public crash(): void {
    this.release()
  }
}

describe('kept recordings', () => {
  let browser!: FakeBrowser
  let source!: FakeRecordingSource
  /** the tab that records */
  let locks!: TabLocks
  let sut!: MediaRecordingManager
  /** another tab of the same origin, or the next visit */
  let other!: MediaRecordingManager

  const globals: Partial<BrowserGlobals> = {
    MediaRecorder: FakeMediaRecorder as unknown as BrowserGlobals['MediaRecorder'],
    Blob,
  }

  const openTab = (tabLocks: LockManagerLike = browser.locks) => {
    const environment = browser.openEnvironment()

    const locked = BrowserEnvironment.of({
      ...globals,
      navigator: { locks: tabLocks } as unknown as Navigator,
    })

    return new DefaultMediaRecordingManager(
      environment,
      mock<ScreenWakeLock>({ isSupported: false }),
      new DefaultPageLifecycle(environment, new NullLogger()),
      new NullLogger(),
      browser.openTab(),
      new CrossTabLock(locked, new NullLogger())
    )
  }

  const open = (localStorage?: FakeStorage) => {
    browser = new FakeBrowser(globals, localStorage)
    locks = new TabLocks(browser.locks)
    sut = openTab(locks)
    other = openTab()
  }

  beforeEach(() => {
    FakeMediaRecorder.reset()
    source = new FakeRecordingSource('audio')
    open()
  })

  afterEach(() => {
    browser.close()
  })

  describe('the gap they close', () => {
    test('should keep nothing of a stream into the storage that was never closed', async () => {
      const store = await browser.openTab().open({ namespace: 'memos', driver: 'opfs' })
      const writer = (await store.writeStream('memo')).getWriter()

      await writer.write(new TextEncoder().encode('ten minutes of sound'))

      // the page is thrown away here: the stream is neither closed nor aborted
      expect(await store.has('memo')).toBe(false)
    })
  })

  describe('while it records', () => {
    test('should keep every piece as it arrives', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos' } })

      FakeMediaRecorder.last.deliver('one ')
      FakeMediaRecorder.last.deliver('two ')
      await waitFor(async () => (await other.kept('memos').get(recording.id ?? ''))?.bytes === 8)

      const [kept] = await other.kept('memos').list()
      expect(kept?.id).toBe(recording.id)
      expect(kept?.state).toBe('recording')
      expect(kept?.segments).toBe(1)
      expect(await textOf((await kept?.read())?.blob)).toBe('one two ')

      await recording.stop()
    })

    test('should be named by the application, or get a name of its own', async () => {
      const named = await sut.record(source, { keep: { namespace: 'memos', id: 'monday' } })
      const unnamed = await sut.record(new FakeRecordingSource('audio'), { keep: { namespace: 'memos' } })
      const inMemory = await sut.record(new FakeRecordingSource('audio'))

      expect(named.id).toBe('monday')
      expect(unnamed.id).toMatch(/\S+/)
      expect(inMemory.id).toBeUndefined()

      await Promise.all([named.stop(), unnamed.stop(), inMemory.stop()])
    })

    test('should not be deleted while it records', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos', id: 'monday' } })
      const kept = await other.kept('memos').get('monday')

      await expect(kept?.delete()).rejects.toThrow(MediaError)

      await recording.stop()
    })

    test('should not be started twice under the same name', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos', id: 'monday' } })

      await expect(
        other.record(new FakeRecordingSource('audio'), { keep: { namespace: 'memos', id: 'monday' } })
      ).rejects.toThrow(MediaError)

      await recording.stop()
    })

    test('should not be written into a stream at the same time', async () => {
      const into = async () => new WritableStream<Uint8Array>()

      await expect(sut.record(source, { keep: { namespace: 'memos' }, into })).rejects.toThrow(TypeError)
    })
  })

  describe('when it is stopped', () => {
    test('should read the recording back and remove it from the storage', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos' } })
      FakeMediaRecorder.last.deliver('one ')

      const result = await recording.stop()

      expect(await textOf(result.blob)).toBe('one end')
      expect(result.bytes).toBe(7)
      expect(result.segments).toHaveLength(1)
      expect(await sut.kept('memos').list()).toEqual([])
    })

    test('should keep it as finished where the application asks', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos', id: 'monday', after: 'keep' } })
      FakeMediaRecorder.last.deliver('one ')
      await recording.stop()

      const kept = await other.kept('memos').get('monday')

      expect(kept?.state).toBe('finished')
      expect(await textOf((await kept?.read())?.blob)).toBe('one end')

      await kept?.delete()

      expect(await other.kept('memos').list()).toEqual([])
    })

    test('should replace a finished recording that had the same name', async () => {
      const first = await sut.record(source, { keep: { namespace: 'memos', id: 'monday', after: 'keep' } })
      FakeMediaRecorder.last.deliver('first ')
      await first.stop()

      const second = await sut.record(new FakeRecordingSource('audio'), {
        keep: { namespace: 'memos', id: 'monday', after: 'keep' },
      })

      await second.stop()

      const [kept, ...more] = await sut.kept('memos').list()

      expect(more).toEqual([])
      expect(await textOf((await kept?.read())?.blob)).toBe('end')
    })

    test('should keep every segment of a device that was started again', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos' } })
      FakeMediaRecorder.last.deliver('first ')

      source.suspend()
      source.deliver()
      await waitFor(() => FakeMediaRecorder.instances.length === 2)
      FakeMediaRecorder.last.deliver('second ')

      const result = await recording.stop()

      expect(await Promise.all(result.segments.map(({ blob }) => textOf(blob)))).toEqual(['first end', 'second end'])
      expect(result.blob).toBeUndefined()
    })

    test('should remove a recording that is discarded', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos' } })
      FakeMediaRecorder.last.deliver('one ')

      await recording.discard()

      expect(await sut.kept('memos').list()).toEqual([])
    })
  })

  describe('when the page is thrown away', () => {
    test('should be found as interrupted on the next visit, with what was kept', async () => {
      const recording = await sut.record(source, { keep: { namespace: 'memos', id: 'monday' } })
      FakeMediaRecorder.last.deliver('one ')
      FakeMediaRecorder.last.deliver('two ')
      await waitFor(async () => (await other.kept('memos').get('monday'))?.bytes === 8)

      locks.crash()
      await flush()

      const [kept] = await other.kept('memos').list()
      expect(kept?.state).toBe('interrupted')
      expect(kept?.bytes).toBe(8)

      const result = await kept?.read()
      expect(await textOf(result?.blob)).toBe('one two ')
      expect(result?.mimeType).toBe(recording.mimeType)

      await kept?.delete()
      expect(await other.kept('memos').list()).toEqual([])
    })

    test('should read a piece that was written after the last description', async () => {
      await sut.record(source, { keep: { namespace: 'memos', id: 'monday' } })
      FakeMediaRecorder.last.deliver('one ')
      await waitFor(async () => (await other.kept('memos').get('monday'))?.bytes === 4)

      // the page is thrown away between the piece and the description that counts it
      const pieces = await browser.openTab().open<Uint8Array>({
        namespace: 'recordings-memos-pieces',
        codec: new BinaryCodec(),
      })

      await pieces.set('monday/0000/000001', new TextEncoder().encode('two '))
      locks.crash()

      const kept = await other.kept('memos').get('monday')

      expect(await textOf((await kept?.read())?.blob)).toBe('one two ')
    })
  })

  describe('when the storage is full', () => {
    test('should stop, say so, and leave what was kept as interrupted', async () => {
      open(new FakeStorage(1200))
      const keep = { namespace: 'memos', id: 'monday', storage: { driver: 'local' } }
      const recording = await sut.record(source, { keep })

      FakeMediaRecorder.last.deliver('fits ')
      await waitFor(async () => (await other.kept('memos', keep.storage).get('monday'))?.bytes === 5)
      FakeMediaRecorder.last.deliver('x'.repeat(2000))

      await expect(recording.finished).rejects.toThrow(StorageQuotaExceededError)

      const kept = await other.kept('memos', keep.storage).get('monday')
      expect(kept?.state).toBe('interrupted')
      expect(await textOf((await kept?.read())?.blob)).toBe('fits ')
    })
  })

  test('should leave nothing behind when the browser does not start the recording', async () => {
    FakeMediaRecorder.startError = new Error('no recorder today')

    await expect(sut.record(source, { keep: { namespace: 'memos' } })).rejects.toThrow(MediaError)
    await flush()

    expect(await other.kept('memos').list()).toEqual([])
  })

  test('should not take a namespace without a name', async () => {
    await expect(sut.kept('').list()).rejects.toThrow(TypeError)
  })
})
