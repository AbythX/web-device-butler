import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDevice } from '../../core/default-device.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { DefaultMicrophoneManager } from './default-microphone-manager.ts'
import type { MicrophoneManager } from './microphone-manager.ts'

/**
 * These specs run in real browsers, against the microphone that the browser fakes, real Web Locks, real Web Audio
 * and a real second tab. The fake microphone of Firefox has no processing, and Firefox does not let a page that
 * nobody clicked on analyse sound, so there the specs cover less.
 */
const microphoneLock = 'web-device-butler:microphone'

// a browser that cannot fake a microphone has nothing to run the specs against
const hasMicrophone = await (navigator.mediaDevices?.getUserMedia({ audio: true }) ?? Promise.reject()).then(
  (stream) => {
    stream.getTracks().forEach((track) => track.stop())

    return true
  },
  () => false
)

const isLocked = async () => (await navigator.locks.query()).held?.some((lock) => lock.name === microphoneLock) ?? false

const waitFor = async (condition: () => boolean | Promise<boolean>, attempts = 300) => {
  for (let attempt = 0; attempt < attempts && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe.skipIf(!hasMicrophone)('the microphone in a real browser', () => {
  let sut!: MicrophoneManager

  beforeEach(async () => {
    // Firefox only starts a device in the tab that is in the foreground
    await commands.showFirstTab()
    sut = DefaultMicrophoneManager.create()
  })

  afterEach(async () => {
    sut.dispose()
    await commands.closeSecondTab()
    await waitFor(async () => !(await isLocked()))
  })

  describe('discovery', () => {
    test('should list nothing before access was requested and the microphones after it', async () => {
      expect(await sut.list()).toEqual([])

      await sut.requestAccess()
      const microphones = await sut.list()

      expect(microphones.length).toBeGreaterThan(0)
      expect(microphones.every((microphone) => microphone.id.length > 0 && microphone.label.length > 0)).toBe(true)
      expect(microphones.filter((microphone) => microphone.isDefault)).toHaveLength(1)
    })

    test('should select the default microphone and leave nothing running', async () => {
      const result = await sut.initialize()

      expect(result.permission).toBe('granted')
      expect(result.selected?.isDefault).toBe(true)
      expect(await isLocked()).toBe(false)
    })

    test('should find out what the microphones can do if a feature is asked for', async () => {
      const result = await sut.initialize({ prefer: { echoCancellation: true } })

      expect(result.microphones.every((microphone) => microphone.detail !== 'listed')).toBe(true)
      expect(await isLocked()).toBe(false)
    })
  })

  describe('session', () => {
    test('should open a microphone and hold the lock until the session is closed', async () => {
      const session = await sut.open()

      expect(session.state).toBe('live')
      expect(session.track.kind).toBe('audio')
      expect(session.track.readyState).toBe('live')
      expect(session.descriptor.detail).toBe('probed')
      expect(await isLocked()).toBe(true)

      await session.close()

      expect(session.track.readyState).toBe('ended')
      expect(await isLocked()).toBe(false)
    })

    test('should start with the processing it was asked for', async () => {
      await using session = await sut.open({ processing: { noiseSuppression: false } })

      expect(session.settings.noiseSuppression).toBe(false)
    })

    test('should change the processing of a running microphone, starting it again where the browser needs that', async () => {
      await using session = await sut.open()
      const canChange = session.processing.noiseSuppression

      await session.processing.set({ noiseSuppression: false })

      expect(session.processing.noiseSuppression).toBe(false)
      expect(session.track.readyState).toBe('live')
      expect(session.state).toBe('live')

      await session.processing.set({ noiseSuppression: canChange })

      expect(session.processing.noiseSuppression).toBe(canChange)
    })

    test('should silence the microphone without stopping it', async () => {
      await using session = await sut.open()

      session.muted = true

      expect(session.track.enabled).toBe(false)
      expect(session.track.readyState).toBe('live')
    })

    test('should measure the level while someone listens, where the browser lets the page analyse sound', async () => {
      await using session = await sut.open()
      const levels: number[] = []

      const subscription = session.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.some((level) => level > 0), 200)
      const probe = new AudioContext()
      const canAnalyse = probe.state === 'running'
      await probe.close()

      // the fake microphones beep; a browser that keeps the audio context suspended reports nothing at all
      expect(levels.some((level) => level > 0)).toBe(canAnalyse)
      expect(levels.every((level) => level >= 0 && level <= 1)).toBe(true)

      subscription?.unsubscribe()
      expect(session.level?.isRunning).toBe(false)
    })
  })

  describe('camera and microphone together', () => {
    test('should deliver one stream that can be recorded', async () => {
      using device = DefaultDevice.create({ camera: { facing: 'back', resolution: { width: 320, height: 240 } } })
      await using session = await device.media.open()

      expect(session.stream.getVideoTracks()).toEqual([session.camera.track])
      expect(session.stream.getAudioTracks()).toEqual([session.microphone.track])
      expect(session.state).toBe('live')

      const chunks: Blob[] = []
      const recorder = new MediaRecorder(session.stream)
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data))
      const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve))
      recorder.start()
      await new Promise((resolve) => setTimeout(resolve, 500))
      recorder.stop()
      await stopped

      expect(chunks.reduce((size, chunk) => size + chunk.size, 0)).toBeGreaterThan(0)
    })

    test('should release both devices when it is closed', async () => {
      using device = DefaultDevice.create()
      const session = await device.media.open()

      await session.close()

      const held = (await navigator.locks.query()).held ?? []
      expect(held.filter((lock) => lock.name?.startsWith('web-device-butler:'))).toEqual([])
      expect(session.camera.track.readyState).toBe('ended')
      expect(session.microphone.track.readyState).toBe('ended')
    })
  })

  describe('second tab', () => {
    test('should let a second tab record at the same time', async () => {
      await using session = await sut.open()

      const second = await commands.openMicrophoneInSecondTab({})

      expect(second).toEqual({ isOpen: true })
      expect(session.state).toBe('live')
      expect(session.track.readyState).toBe('live')
    })

    test('should keep a second tab out while a session wants the microphones for itself', async () => {
      await using session = await sut.open({ exclusive: true })

      const second = await commands.openMicrophoneInSecondTab({})

      expect(second).toEqual({ isOpen: false, error: 'MediaDeviceBusyError', holder: 'other-tab' })
      expect(session.state).toBe('live')
    })

    test('should not get the microphones for itself while a second tab records', async () => {
      await commands.openMicrophoneInSecondTab({})
      await commands.showFirstTab()

      await expect(sut.open({ exclusive: true })).rejects.toBeInstanceOf(MediaDeviceBusyError)

      await commands.closeMicrophoneInSecondTab()
      await commands.showFirstTab()
      await using session = await sut.open({ exclusive: true, whenBusy: 'wait' })
      expect(session.state).toBe('live')
    })
  })
})
