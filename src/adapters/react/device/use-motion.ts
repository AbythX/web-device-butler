import type { DeviceMotion } from '../../../motion/device-motion.ts'
import type { Attitude, Movement } from '../../../motion/model/attitude.ts'
import type { MotionWatch, MotionWatchOptions } from '../../../motion/watch/motion-watch.ts'
import { MotionController, type MotionSnapshot } from '../../state/device/motion-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'

export interface UseMotionWatch<Value> extends MotionSnapshot<Value> {
  /** starts following the sensor; in Safari, request the permission `motion` in a click first */
  start(options?: MotionWatchOptions): void
  /** stops following the sensor; the last value stays */
  stop(): void
}

/**
 * A watch of `butler.motion` as state of a component. Shared by `useAttitude` and `useMovement`. The watch is
 * stopped when the component is unmounted. Pass a `rate`: every value is a render.
 */
export const useMotionWatch = <Value>(
  open: (options?: MotionWatchOptions) => MotionWatch<Value>
): UseMotionWatch<Value> => {
  const latest = useLatest(open)
  const controller = useController(() => new MotionController(() => latest.current))

  return { ...useSnapshot(controller), start: controller.start, stop: controller.stop }
}

/**
 * How the device is turned, as state of a component: `value?.pitch`, `roll`, `heading`. Nothing is read before
 * `start()`.
 */
export const useAttitude = (motion: DeviceMotion): UseMotionWatch<Attitude> =>
  useMotionWatch((options) => motion.watchAttitude(options))

/**
 * How the device moves, as state of a component: `value?.acceleration`, `rotationRate`. Nothing is read before
 * `start()`.
 */
export const useMovement = (motion: DeviceMotion): UseMotionWatch<Movement> =>
  useMotionWatch((options) => motion.watchMotion(options))
