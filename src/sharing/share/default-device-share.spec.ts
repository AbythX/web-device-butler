import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { SharingError } from '../errors/sharing-error.ts'
import { DefaultDeviceShare } from './default-device-share.ts'

const errorNamed = (name: string) => Object.assign(new Error(name), { name })

describe('default-device-share', () => {
  let navigator!: { share: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean }
  let sut!: DefaultDeviceShare

  const shareOf = (globals: object) => new DefaultDeviceShare(BrowserEnvironment.of(globals))
  const photo = { name: 'photo.jpg', type: 'image/jpeg' } as File

  beforeEach(() => {
    navigator = { share: vi.fn(async () => undefined), canShare: vi.fn(() => true) }
    sut = shareOf({ navigator })
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultDeviceShare.create().isSupported).toBe(false)
    })
  })

  describe('#isSupported', () => {
    test('should be true where the browser has a share sheet', async () => {
      expect(sut.isSupported).toBe(true)
    })

    test.each([
      ['there is no browser', {}],
      ['the browser has no share sheet', { navigator: {} }],
      ['the page is not secure', { navigator: { share: async () => undefined }, isSecureContext: false }],
    ])('should be false where %s', async (_name, globals) => {
      const unsupported = shareOf(globals)

      expect(unsupported.isSupported).toBe(false)
      expect(unsupported.canShare({ url: 'https://example.com' })).toBe(false)
      await expect(unsupported.share({ url: 'https://example.com' })).rejects.toThrow(UnsupportedError)
    })
  })

  describe('#canShare', () => {
    test('should ask the browser with the fields that are set', async () => {
      expect(sut.canShare({ title: 'A photo', files: [photo] })).toBe(true)
      expect(navigator.canShare).toHaveBeenCalledExactlyOnceWith({ title: 'A photo', files: [photo] })
    })

    test('should be false for what the browser refuses', async () => {
      navigator.canShare = () => false

      expect(sut.canShare({ files: [photo] })).toBe(false)
    })

    test('should be false for nothing', async () => {
      expect(sut.canShare({})).toBe(false)
      expect(sut.canShare({ files: [] })).toBe(false)
      expect(navigator.canShare).not.toHaveBeenCalled()
    })

    test('should take a browser that cannot be asked for one that shares everything but files', async () => {
      navigator.canShare = undefined

      expect(sut.canShare({ text: 'Hello' })).toBe(true)
      expect(sut.canShare({ text: 'Hello', files: [photo] })).toBe(false)
    })
  })

  describe('#share', () => {
    test('should open the share sheet with the fields that are set', async () => {
      expect(await sut.share({ title: 'Title', text: 'Text', url: 'https://example.com', files: [] })).toBe(true)

      expect(navigator.share).toHaveBeenCalledExactlyOnceWith({
        title: 'Title',
        text: 'Text',
        url: 'https://example.com',
      })
    })

    test('should say when the user closed the sheet without sharing', async () => {
      navigator.share = () => Promise.reject(errorNamed('AbortError'))

      expect(await sut.share({ text: 'Hello' })).toBe(false)
    })

    test('should not open the sheet for what the browser cannot share', async () => {
      navigator.canShare = () => false

      await expect(sut.share({ files: [photo] })).rejects.toThrow(UnsupportedError)
      expect(navigator.share).not.toHaveBeenCalled()
    })

    test('should report a refusal of the browser', async () => {
      const refusal = errorNamed('NotAllowedError')
      navigator.share = () => Promise.reject(refusal)

      const failure = await sut.share({ text: 'Hello' }).catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(PermissionDeniedError)
      expect(failure).toHaveProperty('permission', 'share')
      expect(failure).toHaveProperty('cause', refusal)
    })

    test('should report any other failure as an error of sharing', async () => {
      navigator.share = () => Promise.reject(errorNamed('DataError'))

      await expect(sut.share({ text: 'Hello' })).rejects.toThrow(SharingError)
    })
  })
})
