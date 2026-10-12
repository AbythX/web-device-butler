import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment, type BrowserGlobals } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { MediaError } from '../../../media/errors/media-error.ts'
import { DefaultMediaRecordingManager } from '../../../media/recording/default-media-recording-manager.ts'
import { FakeMediaRecorder } from '../../../media/recording/testing/fake-media-recorder.ts'
import { FakeRecordingSource } from '../../../media/recording/testing/fake-recording-source.ts'
import { DefaultPageLifecycle } from '../../../platform/page/default-page-lifecycle.ts'
import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import { useRecording } from './use-recording.ts'

describe('use-recording', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope
  let source!: FakeRecordingSource
  let recorder!: DefaultMediaRecordingManager

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    FakeMediaRecorder.reset()
    scope = effectScope()
    source = new FakeRecordingSource()

    const environment = BrowserEnvironment.of({
      MediaRecorder: FakeMediaRecorder as unknown as BrowserGlobals['MediaRecorder'],
      Blob,
    })

    recorder = new DefaultMediaRecordingManager(
      environment,
      mock<ScreenWakeLock>({ isSupported: false }),
      new DefaultPageLifecycle(environment, new NullLogger()),
      new NullLogger()
    )
  })

  afterEach(() => {
    scope.stop()
  })

  test('should follow a recording from its start to what it leaves', async () => {
    const state = within(() => useRecording(recorder))
    expect(state.recording.value).toBeUndefined()
    expect(state.state.value).toBeUndefined()

    const started = await state.start(source)
    expect(state.recording.value).toBe(started)
    expect(state.state.value).toBe('recording')

    FakeMediaRecorder.last.deliver('1234')
    expect(state.bytes.value).toBe(4)

    state.pause()
    expect(state.state.value).toBe('paused')
    state.resume()
    expect(state.state.value).toBe('recording')

    const result = await state.stop()

    expect(await result?.blob?.text()).toBe('1234end')
    expect(state.result.value).toBe(result)
    expect(state.bytes.value).toBe(7)
    expect(state.recording.value).toBeUndefined()
    expect(state.state.value).toBeUndefined()
  })

  test('should keep what a recording leaves that ends with its session', async () => {
    const state = within(() => useRecording(recorder))
    const started = await state.start(source)
    FakeMediaRecorder.last.deliver('kept ')

    source.end()
    await started?.finished

    expect(await state.result.value?.blob?.text()).toBe('kept end')
    expect(state.recording.value).toBeUndefined()
  })

  test('should stop the recording that runs before it starts the next', async () => {
    const state = within(() => useRecording(recorder))
    await state.start(source)
    const [first] = FakeMediaRecorder.instances

    await state.start(new FakeRecordingSource())

    expect(first?.state).toBe('inactive')
    expect(FakeMediaRecorder.last.state).toBe('recording')
    expect(state.result.value).toBeUndefined()
    expect(state.bytes.value).toBe(0)
  })

  test('should say why a recording could not be started', async () => {
    FakeMediaRecorder.startError = new Error('not supported')
    const state = within(() => useRecording(recorder))

    expect(await state.start(source)).toBeUndefined()

    expect(state.error.value).toBeInstanceOf(MediaError)
    expect(state.recording.value).toBeUndefined()
  })

  test('should do nothing when there is no recording to stop, pause or resume', async () => {
    const state = within(() => useRecording(recorder))

    state.pause()
    state.resume()

    expect(await state.stop()).toBeUndefined()
  })

  test('should stop the recording when the component is unmounted', async () => {
    const state = within(() => useRecording(recorder))
    const started = await state.start(source)

    scope.stop()
    await started?.finished

    expect(FakeMediaRecorder.last.state).toBe('inactive')
    expect(source.allowTakeover).toBe(true)
  })

  test('should stop a recording that starts after the component was unmounted', async () => {
    const state = within(() => useRecording(recorder))
    const starting = state.start(source)

    scope.stop()

    expect(await starting).toBeUndefined()
    expect(FakeMediaRecorder.last.state).toBe('inactive')
  })
})
