import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { FakeEventTarget } from '../../core/testing/fake-event-target.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaError } from '../errors/media-error.ts'
import type { AudioOutputDescriptor } from './audio-output-manager.ts'
import { DefaultAudioOutputManager } from './default-audio-output-manager.ts'

const errorNamed = (name: string) => Object.assign(new Error(name), { name })

const output = (deviceId: string, groupId: string, label: string) =>
  ({ deviceId, groupId, label, kind: 'audiooutput' }) as MediaDeviceInfo

class FakeOutputDevices extends FakeEventTarget {
  public devices: MediaDeviceInfo[] = [
    output('speaker', 'built-in', 'Speaker'),
    output('headset', 'usb', 'Headset'),
    { deviceId: 'microphone', groupId: 'usb', label: 'Headset microphone', kind: 'audioinput' } as MediaDeviceInfo,
  ]

  public failure: unknown
  public selectAudioOutput: (() => Promise<MediaDeviceInfo>) | undefined

  public readonly enumerateDevices = async (): Promise<MediaDeviceInfo[]> => {
    if (this.failure !== undefined) {
      throw this.failure
    }

    return this.devices
  }
}

/** an `<audio>` element that can send its sound somewhere else */
class FakeAudioElement {
  public sinkId = ''
  public failure: unknown

  public readonly setSinkId = vi.fn(async (id: string) => {
    if (this.failure !== undefined) {
      throw this.failure
    }

    this.sinkId = id
  })
}

const settled = () => new Promise((resolve) => setTimeout(resolve))

describe('default-audio-output-manager', () => {
  let mediaDevices!: FakeOutputDevices
  let element!: FakeAudioElement
  let logger!: Logger
  let sut!: DefaultAudioOutputManager

  const managerOf = (globals: object) => new DefaultAudioOutputManager(BrowserEnvironment.of(globals), logger)
  const audio = () => element as unknown as HTMLMediaElement

  beforeEach(() => {
    mediaDevices = new FakeOutputDevices()
    element = new FakeAudioElement()
    logger = mock<Logger>()
    sut = managerOf({ navigator: { mediaDevices } })
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(await DefaultAudioOutputManager.create().list()).toEqual([])
    })
  })

  describe('#list', () => {
    test('should list the outputs and mark the first as the default of the system', async () => {
      expect(await sut.list()).toEqual([
        { id: 'speaker', groupId: 'built-in', label: 'Speaker', isDefault: true },
        { id: 'headset', groupId: 'usb', label: 'Headset', isDefault: false },
      ])
    })

    test('should replace the entry for the default by the output it stands for', async () => {
      mediaDevices.devices = [
        output('default', 'usb', 'Default - Headset'),
        output('communications', 'usb', 'Communications - Headset'),
        output('speaker', 'built-in', 'Speaker'),
        output('headset', 'usb', 'Headset'),
      ]

      expect(await sut.list()).toEqual([
        { id: 'speaker', groupId: 'built-in', label: 'Speaker', isDefault: false },
        { id: 'headset', groupId: 'usb', label: 'Headset', isDefault: true },
      ])
    })

    test('should keep an entry for the default that stands for none of the outputs', async () => {
      mediaDevices.devices = [output('default', '', 'Default'), output('speaker', 'built-in', 'Speaker')]

      expect((await sut.list()).map(({ id, isDefault }) => [id, isDefault])).toEqual([
        ['default', true],
        ['speaker', false],
      ])
    })

    test('should leave out what the page may not use yet', async () => {
      mediaDevices.devices = [output('', '', '')]

      expect(await sut.list()).toEqual([])
    })

    test.each([
      ['there is no browser', {}],
      ['the page is not secure', { navigator: { mediaDevices: new FakeOutputDevices() }, isSecureContext: false }],
    ])('should be empty where %s', async (_name, globals) => {
      expect(await managerOf(globals).list()).toEqual([])
    })

    test('should report a failure of the browser', async () => {
      mediaDevices.failure = new Error('broken')

      const failure = await sut.list().catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(MediaError)
      expect(failure).toHaveProperty('cause', mediaDevices.failure)
    })
  })

  describe('#choose', () => {
    test('should return the output the user chose', async () => {
      mediaDevices.selectAudioOutput = async () => output('headset', 'usb', 'Headset')

      expect(sut.canChoose).toBe(true)
      expect(await sut.choose()).toEqual({ id: 'headset', groupId: 'usb', label: 'Headset', isDefault: false })
    })

    test('should return nothing if the user closed the list', async () => {
      mediaDevices.selectAudioOutput = () => Promise.reject(errorNamed('NotAllowedError'))

      expect(await sut.choose()).toBeUndefined()
    })

    test('should say where the browser cannot show a list', async () => {
      expect(sut.canChoose).toBe(false)
      await expect(sut.choose()).rejects.toThrow(UnsupportedError)
    })

    test('should report any other failure', async () => {
      mediaDevices.selectAudioOutput = () => Promise.reject(errorNamed('InvalidStateError'))

      await expect(sut.choose()).rejects.toThrow(MediaError)
    })
  })

  describe('#route', () => {
    test('should send the sound to the output, given as descriptor or id', async () => {
      const [, headset] = await sut.list()

      await sut.route(audio(), headset)
      expect(sut.routeOf(audio())).toBe('headset')

      await sut.route(audio(), 'speaker')
      expect(sut.routeOf(audio())).toBe('speaker')
    })

    test('should return to the default of the system without an output', async () => {
      await sut.route(audio(), 'headset')

      await sut.route(audio())

      expect(element.setSinkId).toHaveBeenLastCalledWith('')
      expect(sut.routeOf(audio())).toBeUndefined()
    })

    test('should say where the browser cannot send the sound elsewhere', async () => {
      const plain = {} as HTMLMediaElement

      expect(sut.canRoute(audio())).toBe(true)
      expect(sut.canRoute(plain)).toBe(false)
      expect(sut.routeOf(plain)).toBeUndefined()
      await expect(sut.route(plain, 'headset')).rejects.toThrow(UnsupportedError)
    })

    test.each([
      ['NotFoundError', MediaDeviceNotFoundError],
      ['NotAllowedError', PermissionDeniedError],
      ['AbortError', MediaError],
    ])('should report a %s of the browser', async (name, expected) => {
      element.failure = errorNamed(name)

      const failure = await sut.route(audio(), 'gone').catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(expected)
      expect(failure).toHaveProperty('cause', element.failure)
    })
  })

  describe('change', () => {
    test('should announce the new list when an output is plugged in or removed', async () => {
      const changes: (readonly AudioOutputDescriptor[])[] = []
      sut.on('change', (outputs) => changes.push(outputs))

      mediaDevices.devices = [output('speaker', 'built-in', 'Speaker')]
      mediaDevices.dispatch('devicechange')
      await settled()

      expect(changes).toHaveLength(1)
      expect(changes[0]?.map(({ id }) => id)).toEqual(['speaker'])
    })

    test('should only watch the devices while someone listens', async () => {
      expect(mediaDevices.listenerCount()).toBe(0)

      const subscription = sut.on('change', () => undefined)
      expect(mediaDevices.listenerCount()).toBe(1)

      subscription.unsubscribe()
      expect(mediaDevices.listenerCount()).toBe(0)
    })

    test('should log a list that cannot be read after a change', async () => {
      sut.on('change', () => undefined)
      mediaDevices.failure = new Error('broken')

      mediaDevices.dispatch('devicechange')
      await settled()

      expect(logger.error).toHaveBeenCalledOnce()
    })
  })

  describe('#dispose', () => {
    test('should stop watching and forget every listener', async () => {
      const changes: (readonly AudioOutputDescriptor[])[] = []
      sut.on('change', (outputs) => changes.push(outputs))

      sut.dispose()
      mediaDevices.dispatch('devicechange')
      await settled()

      expect(mediaDevices.listenerCount()).toBe(0)
      expect(changes).toEqual([])
    })
  })
})
