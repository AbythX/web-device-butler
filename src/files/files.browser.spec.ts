import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'
import type { DeviceButler } from '../core/device-butler.ts'
import type { AudioOutputDescriptor } from '../media/output/audio-output-manager.ts'

/**
 * These specs run in real browsers. A dialog of the browser cannot be answered by a spec, so they cover what
 * happens around it: the download where there is no dialog, and an input that is taken away again.
 */
const hasMicrophone = await (navigator.mediaDevices?.getUserMedia({ audio: true }) ?? Promise.reject()).then(
  (stream) => {
    stream.getTracks().forEach((track) => track.stop())

    return true
  },
  () => false
)

describe('files and audio outputs in a real browser', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  describe('files', () => {
    test('should hand a file over as a download when no dialog can be shown', async () => {
      // no click came before this, so a browser with a save dialog does not show it
      const outcome = await butler.files.save(new Blob(['text'], { type: 'text/plain' }), { name: 'spec.txt' })

      expect(outcome).toBe('downloaded')
      expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    })

    test('should take its input away when the application stops waiting for the user', async () => {
      const controller = new AbortController()
      const reason = new Error('left the screen')
      const picked = butler.files.pick({ accept: 'image/*', capture: 'environment', signal: controller.signal })

      const input = document.querySelector<HTMLInputElement>('input[type=file]')
      expect(input?.accept).toBe('image/*')
      expect(input?.getAttribute('capture')).toBe('environment')

      controller.abort(reason)

      await expect(picked).rejects.toBe(reason)
      expect(document.querySelectorAll('input[type=file]')).toHaveLength(0)
    })
  })

  describe('audio outputs', () => {
    const isDescriptor = ({ id, groupId, label, isDefault }: AudioOutputDescriptor) =>
      id.length > 0 && typeof groupId === 'string' && typeof label === 'string' && typeof isDefault === 'boolean'

    test('should list outputs the page may use, each once', async () => {
      const outputs = await butler.audioOutput.list()

      expect(outputs.every(isDescriptor)).toBe(true)
      expect(new Set(outputs.map(({ id }) => id)).size).toBe(outputs.length)
      expect(outputs.filter(({ isDefault }) => isDefault).length).toBeLessThanOrEqual(1)
    })

    test.skipIf(!hasMicrophone)('should send the sound of an element to an output where the browser can', async () => {
      await using session = await butler.microphone.open()
      const outputs = await butler.audioOutput.list()
      const player = document.createElement('audio')
      const [output] = outputs

      expect(session.state).not.toBe('ended')
      expect(butler.audioOutput.routeOf(player)).toBeUndefined()

      if (!butler.audioOutput.canRoute(player) || output === undefined) {
        return
      }

      await butler.audioOutput.route(player, output)
      expect(player.sinkId).toBe(output.id)

      await butler.audioOutput.route(player)
      expect(butler.audioOutput.routeOf(player)).toBeUndefined()
    })
  })
})
