import { beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment, type BrowserGlobals } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultMediaRecordingManager } from '../../../media/recording/default-media-recording-manager.ts'
import { FakeMediaRecorder } from '../../../media/recording/testing/fake-media-recorder.ts'
import { FakeRecordingSource } from '../../../media/recording/testing/fake-recording-source.ts'
import { DefaultPageLifecycle } from '../../../platform/page/default-page-lifecycle.ts'
import { DefaultScreenWakeLock } from '../../../screen/wake-lock/default-screen-wake-lock.ts'
import { renderHook } from '../testing/render-hook.ts'
import { waitFor } from '../testing/wait-for.ts'
import { useRecording } from './use-recording.ts'

const logger = new NullLogger()

describe('useRecording', () => {
  beforeEach(() => {
    FakeMediaRecorder.reset()
  })

  const recorderOf = () => {
    const environment = BrowserEnvironment.of({
      MediaRecorder: FakeMediaRecorder as unknown as BrowserGlobals['MediaRecorder'],
      Blob,
    })

    return new DefaultMediaRecordingManager(
      environment,
      new DefaultScreenWakeLock(environment, logger),
      new DefaultPageLifecycle(environment, logger),
      logger
    )
  }

  test('should follow a recording from its start to what it leaves', async () => {
    const hook = await renderHook(() => useRecording(recorderOf()))
    const { start } = hook.result.current

    await hook.act(() => start(new FakeRecordingSource()))
    expect(hook.result.current.state).toBe('recording')
    expect(hook.result.current.recording).toBeDefined()

    await hook.act(() => FakeMediaRecorder.last.deliver('1234'))
    expect(hook.result.current.bytes).toBe(4)

    await hook.act(() => hook.result.current.pause())
    expect(hook.result.current.state).toBe('paused')

    await hook.act(() => hook.result.current.stop())

    expect(await hook.result.current.result?.blob?.text()).toBe('1234end')
    expect(hook.result.current.recording).toBeUndefined()
    expect(hook.result.current.state).toBeUndefined()
  })

  test('should stop the recording when the component is unmounted', async () => {
    const source = new FakeRecordingSource()
    const hook = await renderHook(() => useRecording(recorderOf()))
    await hook.act(() => hook.result.current.start(source))

    await hook.unmount()
    await waitFor(() => source.allowTakeover)

    expect(FakeMediaRecorder.last.state).toBe('inactive')
    expect(source.allowTakeover).toBe(true)
  })
})
