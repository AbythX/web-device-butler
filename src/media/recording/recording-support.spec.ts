import { describe, expect, test } from 'vitest'

import { BrowserEnvironment, type MediaRecorderFactory } from '../../core/environment/browser-environment.ts'
import { RecordingSupport } from './recording-support.ts'
import { FakeMediaRecorder } from './testing/fake-media-recorder.ts'

describe('recording-support', () => {
  // SAFETY: the support only checks that the recorder is there
  const MediaRecorder = FakeMediaRecorder as unknown as MediaRecorderFactory

  test('should be supported where the browser has a recorder, also outside a secure context', async () => {
    expect(RecordingSupport.isSupportedIn(BrowserEnvironment.of({ MediaRecorder }))).toBe(true)
    expect(RecordingSupport.isSupportedIn(BrowserEnvironment.of({ MediaRecorder, isSecureContext: false }))).toBe(true)
    expect(RecordingSupport.resolveFor(BrowserEnvironment.of({ MediaRecorder }))).toBe(MediaRecorder)
  })

  test('should not be supported without a recorder', async () => {
    expect(RecordingSupport.isSupportedIn(BrowserEnvironment.of({}))).toBe(false)
  })
})
