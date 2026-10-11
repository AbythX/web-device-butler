import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { FakeAudioContext } from '../testing/fake-audio-context.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import type { FakeMediaInput } from '../testing/fake-media-devices.ts'
import type { MicrophoneManager } from './microphone-manager.ts'
import type { MicrophoneRequirements } from './model/microphone-requirements.ts'
import { MicrophoneTestBench } from './testing/microphone-test-bench.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('default-microphone-manager', () => {
  let browser!: FakeMediaBrowser
  let sut!: MicrophoneManager
  const pages: MicrophoneManager[] = []

  /** another page of the browser: a second tab */
  const load = (configuration: MicrophoneRequirements = {}) => {
    const manager = MicrophoneTestBench.load(browser, configuration)
    pages.push(manager)

    return manager
  }

  const use = (inputs: FakeMediaInput[]) => {
    browser = new FakeMediaBrowser({ inputs })
    sut = load()
  }

  const isLocked = async () =>
    (await browser.locks.query()).held?.some((lock) => lock.name === 'web-device-butler:microphone') ?? false

  /** the microphones that were started by their id, in order */
  const startedById = () =>
    browser.devices.requests
      .map((request) => (request.audio as MediaTrackConstraints).deviceId)
      .filter((deviceId) => deviceId !== undefined)
      .map((deviceId) => (deviceId as ConstrainDOMStringParameters).exact)

  beforeEach(() => {
    FakeAudioContext.reset()
    use(MicrophoneTestBench.computer())
  })

  afterEach(async () => {
    pages.splice(0).forEach((page) => page.dispose())
    await flush()

    browser.close()
    browser.devices.assertNothingRuns()
    browser.devices.assertNoViolations()
  })

  describe('#list', () => {
    test('should list nothing and ask the browser nothing before access was requested', async () => {
      expect(await sut.list()).toEqual([])
      expect(browser.devices.calls).toEqual([])
    })

    test('should list every microphone once and mark the default of the system', async () => {
      await sut.requestAccess()

      const microphones = await sut.list()

      expect(microphones.map(({ id, label, isDefault }) => [id, label, isDefault])).toEqual([
        ['builtin', 'Built-in Microphone', false],
        ['headset', 'Headset', true],
        ['stereo', 'USB Stereo Microphone', false],
      ])
    })

    test('should take the first microphone for the default in a browser that has no entry for it', async () => {
      use(MicrophoneTestBench.computer().filter((input) => input.deviceId !== 'default'))
      await sut.requestAccess()

      expect((await sut.list()).map(({ id, isDefault }) => [id, isDefault])).toEqual([
        ['builtin', true],
        ['headset', false],
        ['stereo', false],
      ])
    })

    test('should keep the entry for the default if it cannot be matched with a microphone', async () => {
      use([
        { deviceId: 'default', kind: 'audioinput', label: 'Default', groupId: '' },
        { deviceId: 'builtin', kind: 'audioinput', label: 'Built-in Microphone', groupId: '' },
      ])
      await sut.requestAccess()

      expect((await sut.list()).map(({ id, isDefault }) => [id, isDefault])).toEqual([
        ['default', true],
        ['builtin', false],
      ])
    })

    test('should remove the entry for the communications device as well', async () => {
      use([
        ...MicrophoneTestBench.computer(),
        { deviceId: 'communications', kind: 'audioinput', label: 'Communications - Headset', groupId: 'headset-group' },
      ])
      await sut.requestAccess()

      expect((await sut.list()).map(({ id }) => id)).toEqual(['builtin', 'headset', 'stereo'])
    })

    test('should not know what a microphone can do before it ran', async () => {
      await sut.requestAccess()

      expect((await sut.list()).every((microphone) => microphone.detail === 'listed')).toBe(true)
    })

    test('should use what the browser knows about a microphone without starting it', async () => {
      use([
        {
          deviceId: 'builtin',
          kind: 'audioinput',
          label: 'Built-in Microphone',
          staticCapabilities: { echoCancellation: [true, false] },
        },
      ])
      await sut.requestAccess()

      const [microphone] = await sut.list()

      expect(microphone?.detail).toBe('static')
      expect(microphone?.features.echoCancellation).toBe(true)
    })

    test('should know what a microphone can do once it ran on the page', async () => {
      await (await sut.open({ id: 'stereo' })).close()

      const stereo = (await sut.list()).find((microphone) => microphone.id === 'stereo')

      expect(stereo?.detail).toBe('probed')
      expect(stereo?.features.maxChannelCount).toBe(2)
    })
  })

  describe('#select', () => {
    test('should return the default microphone without starting any microphone but for access', async () => {
      const microphone = await sut.select()

      expect(microphone?.id).toBe('headset')
      expect(browser.devices.requests).toEqual([{ audio: true }])
    })

    test('should start the microphones to find out about a feature that is required', async () => {
      const microphone = await sut.select({ require: { minChannelCount: 2 } })

      expect(microphone?.id).toBe('stereo')
      expect(microphone?.detail).toBe('probed')
      expect(startedById()).toEqual(['builtin', 'headset', 'stereo'])
    })

    test('should prefer the default among the microphones that have what is required', async () => {
      expect((await sut.select({ require: { echoCancellation: true } }))?.id).toBe('headset')
    })

    test('should start the microphones only once per page', async () => {
      await sut.select({ require: { echoCancellation: true } })
      const requests = browser.devices.requests.length

      await sut.select({ require: { noiseSuppression: true } })

      expect(browser.devices.requests).toHaveLength(requests)
    })

    test('should not start the microphones the browser tells about', async () => {
      const inputs = MicrophoneTestBench.computer()
      inputs.forEach((input) => (input.staticCapabilities = input.capabilities))
      use(inputs)

      expect((await sut.select({ require: { minChannelCount: 2 } }))?.id).toBe('stereo')
      expect(startedById()).toEqual([])
    })

    test('should use the configured defaults and let a call override single fields', async () => {
      sut = load({ require: { minChannelCount: 2 } })

      expect((await sut.select())?.id).toBe('stereo')
      expect((await sut.select({ require: {} }))?.id).toBe('headset')
    })

    test('should return nothing if no microphone has what is required', async () => {
      expect(await sut.select({ require: { echoCancellation: true, minChannelCount: 2 } })).toBeUndefined()
    })

    test('should return nothing if access is refused', async () => {
      browser.devices.permission.microphone = 'denied'

      expect(await sut.select()).toBeUndefined()
      expect(sut.access.any).toBe('denied')
    })

    test('should return the microphone with the given id', async () => {
      expect((await sut.select({ id: 'builtin' }))?.id).toBe('builtin')
      expect(await sut.select({ id: 'gone' })).toBeUndefined()
    })

    test('should leave no microphone running and release the lock', async () => {
      await sut.select({ require: { echoCancellation: true } })

      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test('should go on with the other microphones if one does not start', async () => {
      const audit = browser.devices.beforeCall
      browser.devices.beforeCall = async (call) => {
        await audit?.(call)

        if (JSON.stringify(call.constraints ?? {}).includes('builtin')) {
          throw new DOMException('Could not start audio source', 'NotReadableError')
        }
      }

      const microphone = await sut.select({ require: { minChannelCount: 2 } })

      expect(microphone?.id).toBe('stereo')
      expect((await sut.list())[0]?.detail).toBe('listed')
    })

    test('should answer from what is known while another tab has the microphones for itself', async () => {
      await sut.requestAccess()
      const session = await load().open({ exclusive: true })

      const microphone = await sut.select()

      expect(microphone?.id).toBe('headset')
      expect(session.state).toBe('live')
    })

    test('should fail while another tab has the microphones for itself and nothing is known', async () => {
      const session = await load().open({ exclusive: true })

      await expect(sut.select()).rejects.toThrow(MediaDeviceBusyError)
      expect(session.state).toBe('live')
    })
  })

  describe('#open', () => {
    test('should open the default microphone', async () => {
      const session = await sut.open()

      expect(session.descriptor.id).toBe('headset')
      expect(session.descriptor.detail).toBe('probed')
      expect(session.track.kind).toBe('audio')
      expect(session.state).toBe('live')
    })

    test('should open the microphone that has what is required', async () => {
      const session = await sut.open({ require: { minChannelCount: 2 }, channelCount: 2 })

      expect(session.descriptor.id).toBe('stereo')
      expect(session.settings.channelCount).toBe(2)
    })

    test('should start with the processing of the configuration', async () => {
      sut = load({ processing: { noiseSuppression: false } })

      const session = await sut.open()

      expect(session.settings).toMatchObject({ echoCancellation: true, noiseSuppression: false, autoGainControl: true })
      expect(browser.devices.requests.at(-1)).toEqual({
        audio: { noiseSuppression: false, deviceId: { exact: 'headset' } },
      })
    })

    test('should open a microphone by its id', async () => {
      const session = await sut.open({ id: 'builtin' })

      expect(session.descriptor.id).toBe('builtin')
      expect(startedById()).toEqual(['builtin'])
    })

    test('should open the default of the system by the id browsers give it', async () => {
      const session = await sut.open({ id: 'default' })

      expect(session.descriptor.id).toBe('headset')
      expect(session.descriptor.isDefault).toBe(true)
      expect((await sut.select({ id: 'default' }))?.id).toBe('headset')
    })

    test('should fail for an id that no microphone has', async () => {
      await expect(sut.open({ id: 'gone' })).rejects.toThrow(MediaDeviceNotFoundError)
      expect(await isLocked()).toBe(false)
    })

    test('should say which requirement removed which microphone if none fits', async () => {
      const opening = sut.open({ require: { echoCancellation: true, minChannelCount: 2 } })

      await expect(opening).rejects.toThrow(MediaRequirementsError)
      await expect(opening).rejects.toThrow(
        "None of the 3 microphones fits the requirements: 'Built-in Microphone' lacks 2 channels; " +
          "'Headset' lacks 2 channels; 'USB Stereo Microphone' lacks echoCancellation"
      )
      expect(await isLocked()).toBe(false)
    })

    test('should fail if access is refused', async () => {
      browser.devices.permission.microphone = 'denied'

      await expect(sut.open()).rejects.toThrow(PermissionDeniedError)
    })

    test('should let several tabs record at once', async () => {
      const first = await sut.open()
      const second = await load().open()

      expect(first.state).toBe('live')
      expect(second.state).toBe('live')
      expect(browser.devices.liveTracks).toHaveLength(2)
    })

    test('should run two microphones at once on the same page', async () => {
      const first = await sut.open({ id: 'builtin' })
      const second = await sut.open({ id: 'stereo' })

      expect(first.track.readyState).toBe('live')
      expect(second.track.readyState).toBe('live')
    })

    test('should keep other tabs out for a session that wants the microphones for itself', async () => {
      const session = await sut.open({ exclusive: true })

      await expect(load().open()).rejects.toMatchObject({ name: 'MediaDeviceBusyError', holder: 'other-tab' })

      await session.close()
      await expect(load().open()).resolves.toBeDefined()
    })

    test('should not get the microphones for itself while another tab records', async () => {
      const session = await load().open()

      await expect(sut.open({ exclusive: true })).rejects.toThrow(MediaDeviceBusyError)
      expect(session.state).toBe('live')
    })

    test('should take the microphones over from a tab that has them for itself', async () => {
      const first = await sut.open({ exclusive: true })

      const second = await load().open({ whenBusy: 'takeover' })

      expect(first.state).toBe('ended')
      expect(second.state).toBe('live')
    })

    test('should hold the lock until the session is closed', async () => {
      const session = await sut.open()
      expect(await isLocked()).toBe(true)

      await session.close()

      expect(await isLocked()).toBe(false)
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should close its sessions when it is disposed', async () => {
      const session = await sut.open()

      sut.dispose()
      await flush()

      expect(session.state).toBe('ended')
    })
  })

  describe('#initialize', () => {
    test('should request access and say which microphone open() would start', async () => {
      const result = await sut.initialize({ require: { echoCancellation: true } })

      expect(result.permission).toBe('granted')
      expect(result.microphones.map((microphone) => microphone.id)).toEqual(['builtin', 'headset', 'stereo'])
      expect(result.selected?.id).toBe('headset')
      expect(result.error).toBeUndefined()
    })

    test('should leave no microphone running and release the lock', async () => {
      await sut.initialize({ require: { echoCancellation: true } })

      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test('should be followed by an open() that starts the selected microphone', async () => {
      sut = load({ require: { minChannelCount: 2 } })
      const { selected } = await sut.initialize()
      const starts = startedById().length

      const session = await sut.open()

      expect(session.descriptor.id).toBe(selected?.id)
      expect(startedById().slice(starts)).toEqual(['stereo'])
    })

    test('should report that no microphone fits instead of throwing', async () => {
      const result = await sut.initialize({ require: { echoCancellation: true, minChannelCount: 2 } })

      expect(result.selected).toBeUndefined()
      expect(result.microphones).toHaveLength(3)
      expect(result.error).toBeInstanceOf(MediaRequirementsError)
      expect(result.error?.message).toContain("'USB Stereo Microphone' lacks echoCancellation")
    })

    test('should report a refused permission instead of throwing', async () => {
      browser.devices.permission.microphone = 'denied'

      const result = await sut.initialize()

      expect(result.permission).toBe('denied')
      expect(result.microphones).toEqual([])
      expect(result.error).toBeInstanceOf(PermissionDeniedError)
    })

    test('should report a page without microphones, such as one without HTTPS', async () => {
      browser = new FakeMediaBrowser({ inputs: MicrophoneTestBench.computer() }, { isSecureContext: false })

      const result = await load().initialize()

      expect(result.permission).toBe('unsupported')
      expect(result.error).toBeInstanceOf(UnsupportedError)
    })

    test('should reject for a call that was aborted', async () => {
      const reason = new Error('the user left')

      await expect(sut.initialize({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
    })
  })

  describe('events', () => {
    test('should announce the new list when a microphone is plugged in', async () => {
      await sut.requestAccess()
      const lists: string[][] = []
      sut.on('change', (microphones) => lists.push(microphones.map((microphone) => microphone.id)))

      browser.devices.plug({ deviceId: 'usb', kind: 'audioinput', label: 'USB microphone' })
      await flush()
      await flush()

      expect(lists).toEqual([['builtin', 'headset', 'stereo', 'usb']])
    })
  })

  describe('.create', () => {
    test('should build a manager that works on its own', async () => {
      const { DefaultMicrophoneManager: Manager } = await import('./default-microphone-manager.ts')
      const manager = Manager.create({ prefer: { default: true } }, browser.openEnvironment())
      pages.push(manager)

      expect((await manager.select())?.id).toBe('headset')
    })
  })
})
