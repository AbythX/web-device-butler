import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { AudioOutputSupport } from './audio-output-support.ts'

describe('audio-output-support', () => {
  // SAFETY: the support only checks that the calls are there
  const choosing = { selectAudioOutput: () => Promise.reject(new Error('not chosen')) } as unknown as MediaDevices
  const routable = { setSinkId: () => Promise.resolve() } as unknown as HTMLMediaElement

  test('should let the user choose and route on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator: { mediaDevices: choosing } as Navigator })

    expect(AudioOutputSupport.canChooseIn(environment)).toBe(true)
    expect(AudioOutputSupport.canRouteIn(environment, routable)).toBe(true)
    expect(AudioOutputSupport.resolveFor(environment)).toBe(choosing)
  })

  test('should neither choose nor route outside a secure context', async () => {
    const environment = BrowserEnvironment.of({
      navigator: { mediaDevices: choosing } as Navigator,
      isSecureContext: false,
    })

    expect(AudioOutputSupport.canChooseIn(environment)).toBe(false)
    expect(AudioOutputSupport.canRouteIn(environment, routable)).toBe(false)
    expect(AudioOutputSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should neither choose nor route where the browser has no calls for it', async () => {
    const environment = BrowserEnvironment.of({ navigator: { mediaDevices: {} } as Navigator })

    expect(AudioOutputSupport.canChooseIn(environment)).toBe(false)
    expect(AudioOutputSupport.canRouteIn(environment, {} as HTMLMediaElement)).toBe(false)
  })
})
