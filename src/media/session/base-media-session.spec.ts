import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { Logger } from '../../core/logging/logger.ts'
import type { MediaAccess } from '../access/media-access.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaError } from '../errors/media-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import { FakeMediaStream } from '../testing/fake-media-stream.ts'
import { TestMediaSession } from '../testing/input/test-media-session.ts'
import type { MediaSessionEnd, MediaSessionState } from './media-session.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('base-media-session', () => {
  let browser!: FakeMediaBrowser
  let access!: MediaAccess
  let sut!: TestMediaSession

  const open = async (from: MediaAccess = access, logger?: Logger) => {
    const lease = await from.acquire({ whenBusy: 'takeover' })

    return new TestMediaSession(lease, await lease.open({ deviceId: 'back-0', scope: 'back' }), [], logger)
  }

  const isLocked = async () => (await access.refreshAvailability()) !== 'free'

  beforeEach(async () => {
    browser = new FakeMediaBrowser()
    access = browser.openTab().access
    sut = await open()
  })

  afterEach(() => {
    browser.close()
    browser.devices.assertNoViolations()
  })

  describe('#stream', () => {
    test('should expose the stream and its track', async () => {
      expect(sut.stream.getTracks()).toEqual([sut.track])
      expect(sut.track.label).toBe('camera2 0, facing back')
    })

    test('should not accept a stream without a track', async () => {
      const lease = await browser.openTab('microphone').access.acquire()

      expect(() => new TestMediaSession(lease, new FakeMediaStream([]) as unknown as MediaStream)).toThrow(MediaError)
    })
  })

  describe('#state', () => {
    test('should be live while the device delivers', async () => {
      expect(sut.state).toBe('live')
    })

    test('should follow the track when the browser pauses and resumes it', async () => {
      const states: MediaSessionState[] = []
      sut.on('statechange', (state) => states.push(state))

      sut.fakeTrack.mute()
      expect(sut.state).toBe('muted')
      sut.fakeTrack.unmute()

      expect(sut.state).toBe('live')
      expect(states).toEqual(['muted', 'live'])
    })

    test('should start muted on a track that is muted', async () => {
      await sut.close()
      const lease = await access.acquire()
      const stream = await lease.open({ scope: 'back' })
      browser.devices.liveTracks[0]?.mute()

      const session = new TestMediaSession(lease, stream)

      expect(session.state).toBe('muted')
    })

    test('should not fail the session if a listener fails', async () => {
      const logger = mock<Logger>()
      await sut.close()
      const session = await open(access, logger)
      session.on('statechange', () => {
        throw new Error('listener failed')
      })

      expect(() => session.fakeTrack.mute()).not.toThrow()
      expect(session.state).toBe('muted')
      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('#close', () => {
    test('should stop the device and free it for others', async () => {
      await sut.close()

      expect(sut.state).toBe('ended')
      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test('should stop the device right away, before the lock is free', async () => {
      const closing = sut.close()

      expect(sut.state).toBe('ended')
      expect(browser.devices.liveTracks).toEqual([])
      await closing
    })

    test('should announce the end once the device is free', async () => {
      const ended = vi.fn<(end: MediaSessionEnd) => void>()
      const states: MediaSessionState[] = []
      sut.on('ended', ended)
      sut.on('statechange', (state) => states.push(state))

      const closing = sut.close()
      expect(states).toEqual(['ended'])
      expect(ended).not.toHaveBeenCalled()
      await closing

      expect(ended).toHaveBeenCalledTimes(1)
      expect(ended).toHaveBeenCalledWith({ reason: 'closed' })
    })

    test('should let a listener of the end open the device again', async () => {
      let reopened: Promise<TestMediaSession> | undefined
      sut.on('ended', () => {
        reopened = access
          .acquire()
          .then(async (lease) => new TestMediaSession(lease, await lease.open({ scope: 'back' })))
      })

      await sut.close()

      expect((await reopened)?.state).toBe('live')
    })

    test('should be callable any number of times', async () => {
      const ended = vi.fn()
      sut.on('ended', ended)

      await Promise.all([sut.close(), sut.close()])
      await sut.close()

      expect(ended).toHaveBeenCalledTimes(1)
    })

    test('should stop listening to the track', async () => {
      const track = sut.fakeTrack

      await sut.close()

      expect(track.listenerCount('ended')).toBe(0)
      expect(track.listenerCount('mute')).toBe(0)
      expect(track.listenerCount('unmute')).toBe(0)
    })

    test('should close at the end of an await using block', async () => {
      await sut.close()
      {
        await using session = await open()
        expect(session.state).toBe('live')
      }

      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })
  })

  describe('device', () => {
    test('should end when the device goes away', async () => {
      const ended = vi.fn<(end: MediaSessionEnd) => void>()
      sut.on('ended', ended)

      sut.fakeTrack.end()
      await flush()

      expect(sut.state).toBe('ended')
      expect(ended).toHaveBeenCalledWith({ reason: 'device' })
      expect(await isLocked()).toBe(false)
    })

    test('should keep the first reason of the end', async () => {
      const ended = vi.fn<(end: MediaSessionEnd) => void>()
      sut.on('ended', ended)

      sut.fakeTrack.end()
      await sut.close()

      expect(ended).toHaveBeenCalledTimes(1)
      expect(ended).toHaveBeenCalledWith({ reason: 'device' })
    })
  })

  describe('#allowTakeover', () => {
    test('should give the device to another tab that takes it over', async () => {
      const ended = vi.fn<(end: MediaSessionEnd) => void>()
      sut.on('ended', ended)

      const other = await open(browser.openTab().access)

      expect(other.state).toBe('live')
      expect(sut.state).toBe('ended')
      expect(ended).toHaveBeenCalledWith({ reason: 'taken-over' })
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    test('should keep the device if the application does not allow it', async () => {
      sut.allowTakeover = false

      await expect(open(browser.openTab().access)).rejects.toBeInstanceOf(MediaDeviceBusyError)

      expect(sut.state).toBe('live')
      expect(sut.track.readyState).toBe('live')
    })

    test('should not answer for a session that has ended', async () => {
      sut.allowTakeover = false
      await sut.close()

      await expect(open(browser.openTab().access)).resolves.toBeDefined()
    })
  })

  describe('controls', () => {
    test('should change the hardware through the queue of the session', async () => {
      await Promise.all([sut.torch.set(true), sut.torch.zoom(2)])

      expect(sut.torch.isAvailable).toBe(true)
      expect(sut.torch.enabled).toBe(true)
      expect(sut.fakeTrack.overlappingChanges).toBe(1)
      // the constraints the track was requested with are kept
      expect(sut.fakeTrack.applied.at(-1)).toMatchObject({ advanced: [{ torch: true, zoom: 2 }] })
    })

    test('should read its state from the track', async () => {
      await sut.torch.set(true)
      await sut.fakeTrack.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })

      expect(sut.torch.enabled).toBe(false)
    })

    test('should refuse changes after the session was closed', async () => {
      await sut.close()

      await expect(sut.torch.set(true)).rejects.toBeInstanceOf(SessionClosedError)
    })
  })

  describe('#assertOpen', () => {
    test('should tell a session that is open from one that has ended', async () => {
      expect(() => sut.requireOpen()).not.toThrow()

      await sut.close()

      expect(() => sut.requireOpen()).toThrow(SessionClosedError)
    })
  })
})
