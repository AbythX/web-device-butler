import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { Logger } from '../../../core/logging/logger.ts'
import type { MediaAccess } from '../../access/media-access.ts'
import type { MediaAccessScope } from '../../access/media-access-state.ts'
import type { MediaLease } from '../../access/media-lease.ts'
import { SessionClosedError } from '../../errors/session-closed-error.ts'
import { FakeMediaBrowser } from '../../testing/fake-media-browser.ts'
import { CameraDescriptor } from '../model/camera-descriptor.ts'
import { CameraTestBench } from '../testing/camera-test-bench.ts'
import { CameraCapabilityReader } from './camera-capability-reader.ts'
import { CameraProber } from './camera-prober.ts'

const scopeOf = (descriptor: CameraDescriptor): MediaAccessScope =>
  descriptor.facing === 'front' || descriptor.facing === 'back' ? descriptor.facing : 'any'

describe('camera-prober', () => {
  let browser!: FakeMediaBrowser
  let access!: MediaAccess
  let lease!: MediaLease
  let logger!: Logger
  let sut!: CameraProber

  const candidates = async () => (await access.enumerate()).map((device) => CameraDescriptor.listed(device))

  beforeEach(async () => {
    browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
    access = browser.openTab().access
    lease = await access.acquire()
    await lease.ensureAccess(['back', 'front'])

    logger = mock<Logger>()
    sut = new CameraProber(new CameraCapabilityReader(() => [], CameraTestBench.timing), logger)
  })

  afterEach(async () => {
    await lease.release()
    browser.close()
    browser.devices.assertNoViolations()
  })

  describe('#probe', () => {
    test('should describe every candidate from its running track', async () => {
      const probed = await sut.probe(lease, await candidates(), { scopeOf })

      expect(probed).toHaveLength(4)
      expect(probed.every((camera) => camera.detail === 'probed')).toBe(true)
      expect(probed.filter((camera) => camera.features.torch).map((camera) => camera.id)).toEqual(['back-main'])
    })

    test('should read the camera that runs on the lease first, without starting it again', async () => {
      const requests = browser.devices.requests.length

      const probed = await sut.probe(lease, await candidates(), { scopeOf })

      // the access request for the front left front-0 running
      expect(probed.map((camera) => camera.id)).toEqual(['front-0', 'back-wide', 'back-main', 'front-1'])
      expect(browser.devices.requests).toHaveLength(requests + 3)
    })

    test('should only start the candidates', async () => {
      const [, wide] = await candidates()

      const probed = await sut.probe(lease, wide === undefined ? [] : [wide], { scopeOf })

      expect(probed.map((camera) => camera.id)).toEqual(['back-wide'])
    })

    test('should leave no camera running and keep the lock', async () => {
      await sut.probe(lease, await candidates(), { scopeOf })

      expect(browser.devices.liveTracks).toEqual([])
      expect(lease.stream).toBeUndefined()
      expect(lease.isReleased).toBe(false)
    })

    test('should stop after the first camera the caller is content with', async () => {
      const probed = await sut.probe(lease, await candidates(), {
        scopeOf,
        until: (camera) => camera.facing === 'back',
      })

      expect(probed.map((camera) => camera.id)).toEqual(['front-0', 'back-wide'])
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should leave out a camera that does not start and go on with the next', async () => {
      const audit = browser.devices.beforeCall
      browser.devices.beforeCall = async (call) => {
        await audit?.(call)

        if (JSON.stringify(call.constraints ?? {}).includes('back-wide')) {
          throw new DOMException('Could not start video source', 'NotReadableError')
        }
      }

      const probed = await sut.probe(lease, await candidates(), { scopeOf })

      expect(probed.map((camera) => camera.id)).toEqual(['front-0', 'back-main', 'front-1'])
      expect(logger.warn).toHaveBeenCalledWith(
        "Could not look at the camera 'camera2 2, facing back'",
        expect.anything()
      )
    })

    test('should give up when the lease is gone', async () => {
      const all = await candidates()
      await lease.release()

      await expect(sut.probe(lease, all, { scopeOf })).rejects.toThrow(SessionClosedError)
    })

    test('should do nothing without candidates', async () => {
      const requests = browser.devices.requests.length

      expect(await sut.probe(lease, [], { scopeOf })).toEqual([])
      expect(browser.devices.requests).toHaveLength(requests)
    })
  })
})
