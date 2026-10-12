/**
 * Whether the browser of the specs has the camera and the microphone it fakes. The WebKit build of Playwright has
 * none, and the specs of the hooks that open a device skip themselves there.
 */
export const hasCamera = await (navigator.mediaDevices?.getUserMedia({ video: true }) ?? Promise.reject()).then(
  (stream) => {
    stream.getTracks().forEach((track) => track.stop())

    return true
  },
  () => false
)

/**
 * Whether a tab holds the device, which is how a spec sees that a session was closed.
 */
export const isLocked = async (kind: 'camera' | 'microphone'): Promise<boolean> =>
  (await navigator.locks.query()).held?.some((lock) => lock.name === `web-device-butler:${kind}`) ?? false
