import { describe, expect, test } from 'vitest'

import type { MediaInputDetail } from '../../input/media-input-descriptor.ts'
import { CameraDescriptor } from '../model/camera-descriptor.ts'
import type { CameraFacing } from '../model/camera-facing.ts'
import { CameraFeatures, type CameraFeatureValues } from '../model/camera-features.ts'
import { CameraSelector } from './camera-selector.ts'

const camera = (
  id: string,
  facing: CameraFacing,
  features: Partial<CameraFeatureValues> = {},
  detail: MediaInputDetail = 'probed'
) => new CameraDescriptor(id, id, id, detail, facing, new CameraFeatures({ torch: false, focusModes: [], ...features }))

const fullHd = { width: 1920, height: 1080 }

const ultraHd = { width: 3840, height: 2160 }

/** two front and two back cameras, only one back camera has a torch */
const phone = [
  camera('front-0', 'front', { maxResolution: fullHd }),
  camera('back-wide', 'back', { maxResolution: fullHd }),
  camera('back-main', 'back', { torch: true, zoom: { min: 1, max: 8 }, maxResolution: ultraHd }),
  camera('front-1', 'front', { maxResolution: { width: 1280, height: 720 } }),
]

const ids = (cameras: readonly CameraDescriptor[]) => cameras.map((descriptor) => descriptor.id)

describe('camera-selector', () => {
  const sut = new CameraSelector()

  describe('#select', () => {
    test('should return the back camera with the torch', async () => {
      const selection = sut.select(phone, { require: { facing: 'back', torch: true } })

      expect(selection.best?.id).toBe('back-main')
      expect(ids(selection.ranked)).toEqual(['back-main'])
    })

    test('should never return a camera that lacks what is required', async () => {
      const selection = sut.select(phone, { require: { facing: 'front', torch: true } })

      expect(selection.best).toBeUndefined()
      expect(selection.ranked).toEqual([])
    })

    test('should say which requirement removed which camera', async () => {
      const selection = sut.select(phone, { require: { facing: 'front', torch: true } })

      expect(selection.explain()).toBe(
        "None of the 4 cameras fits the requirements: 'back-wide' lacks facing 'front'; " +
          "'back-main' lacks facing 'front'; 'front-0' lacks torch; 'front-1' lacks torch"
      )
    })

    test('should say that there is nothing to choose from', async () => {
      expect(sut.select([], { require: { facing: 'back' } }).explain()).toBe('There is no camera to choose from')
    })

    test('should rank the cameras with the preferred features higher', async () => {
      const selection = sut.select(phone, { prefer: { torch: true } })

      expect(selection.best?.id).toBe('back-main')
      expect(selection.ranked).toHaveLength(4)
    })

    test('should count every preferred feature', async () => {
      const cameras = [
        camera('zoom', 'back', { zoom: { min: 1, max: 20 } }),
        camera('both', 'back', { torch: true, zoom: { min: 1, max: 2 } }),
      ]

      expect(sut.select(cameras, { prefer: { torch: true, zoom: true } }).best?.id).toBe('both')
    })

    test('should rank a camera that cannot deliver the preferred resolution lower', async () => {
      const selection = sut.select(phone, { require: { facing: 'front' }, prefer: fullHd })

      expect(ids(selection.ranked)).toEqual(['front-0', 'front-1'])
    })

    test('should remove a camera that cannot deliver a resolution that is required', async () => {
      const selection = sut.select(phone, { require: { facing: 'front', ...fullHd } })

      expect(ids(selection.ranked)).toEqual(['front-0'])
    })

    test('should break a tie by the largest zoom range, to land on the main camera', async () => {
      const cameras = [
        camera('tele', 'back', { zoom: { min: 1, max: 2 }, maxResolution: ultraHd }),
        camera('main', 'back', { zoom: { min: 1, max: 8 }, maxResolution: fullHd }),
        camera('wide', 'back', { maxResolution: ultraHd }),
      ]

      expect(ids(sut.select(cameras, { require: { facing: 'back' } }).ranked)).toEqual(['main', 'tele', 'wide'])
    })

    test('should break a tie of the zoom by the highest resolution', async () => {
      const cameras = [
        camera('low', 'back', { maxResolution: fullHd }),
        camera('high', 'back', { maxResolution: ultraHd }),
      ]

      expect(sut.select(cameras, {}).best?.id).toBe('high')
    })

    test('should keep the order of the list for cameras that rank the same', async () => {
      const cameras = [camera('a', 'back'), camera('b', 'back'), camera('c', 'back')]

      expect(ids(sut.select(cameras, {}).ranked)).toEqual(['a', 'b', 'c'])
    })

    test('should put the cameras of the preferred side first, then those that do not say, then the others', async () => {
      const cameras = [camera('back', 'back'), camera('webcam', 'unknown'), camera('front', 'front')]

      expect(ids(sut.select(cameras, { prefer: { facing: 'front' } }).ranked)).toEqual(['front', 'webcam', 'back'])
    })

    test('should rank the preferred side above every other preference', async () => {
      const selection = sut.select(phone, { prefer: { facing: 'front', torch: true, ...ultraHd } })

      expect(ids(selection.ranked)).toEqual(['front-0', 'front-1', 'back-main', 'back-wide'])
    })

    test('should rank a preferred feature above a preferred resolution, and that above a preferred frame rate', async () => {
      const cameras = [
        camera('fast', 'back', { maxResolution: fullHd, maxFrameRate: 60 }),
        camera('large', 'back', { maxResolution: ultraHd, maxFrameRate: 30 }),
        camera('torch', 'back', { torch: true, maxResolution: fullHd, maxFrameRate: 30 }),
      ]

      const selection = sut.select(cameras, { prefer: { torch: true, ...ultraHd, frameRate: 60 } })

      expect(ids(selection.ranked)).toEqual(['torch', 'large', 'fast'])
    })

    test('should count a preferred width and height as one preference', async () => {
      const cameras = [
        camera('zoom', 'back', { zoom: { min: 1, max: 2 }, maxResolution: fullHd }),
        camera('large', 'back', { maxResolution: ultraHd }),
      ]

      expect(sut.select(cameras, { prefer: { zoom: true, ...ultraHd } }).best?.id).toBe('zoom')
    })

    test('should keep the order of the list with the strategy first', async () => {
      const selection = sut.select(phone, { require: { facing: 'back' }, strategy: 'first' })

      expect(ids(selection.ranked)).toEqual(['back-wide', 'back-main'])
    })

    test('should use the cameras that do not say where they face if none faces the required way', async () => {
      const laptop = [camera('webcam', 'unknown'), camera('usb', 'external')]

      expect(ids(sut.select(laptop, { require: { facing: 'back' } }).ranked)).toEqual(['webcam', 'usb'])
    })

    test('should not use a front camera for the back', async () => {
      const selection = sut.select([camera('front', 'front')], { require: { facing: 'back' } })

      expect(selection.best).toBeUndefined()
      expect(selection.explain()).toContain("'front' lacks facing 'back'")
    })

    test('should prefer the cameras that face the required way over those that do not say', async () => {
      const cameras = [camera('usb', 'external', { torch: true }), camera('back', 'back')]

      expect(ids(sut.select(cameras, { require: { facing: 'back' } }).ranked)).toEqual(['back'])
    })
  })

  describe('#narrow', () => {
    const listed = phone.map((descriptor) =>
      camera(descriptor.id, descriptor.facing, { maxResolution: descriptor.features.maxResolution }, 'static')
    )

    test('should never offer the front cameras for a back camera', async () => {
      expect(ids(sut.narrow(listed, { require: { facing: 'back', torch: true } }))).toEqual(['back-wide', 'back-main'])
    })

    test('should keep cameras whose torch is not known yet', async () => {
      expect(ids(sut.narrow(listed, { require: { torch: true, zoom: true, focus: true } }))).toHaveLength(4)
    })

    test('should drop a camera that is known to lack the torch', async () => {
      expect(ids(sut.narrow(phone, { require: { facing: 'back', torch: true } }))).toEqual(['back-main'])
    })

    test('should drop cameras whose resolution is known to be too low', async () => {
      expect(ids(sut.narrow(listed, { require: ultraHd }))).toEqual(['back-main'])
    })

    test('should keep every camera for requirements that ask for nothing', async () => {
      expect(sut.narrow(listed, {})).toEqual(listed)
    })
  })
})
