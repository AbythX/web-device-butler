import type { Ref, ShallowRef } from 'vue'

import type { DeviceMotion } from '../../../motion/device-motion.ts'
import type { Attitude, Movement } from '../../../motion/model/attitude.ts'
import type { MotionWatch, MotionWatchOptions } from '../../../motion/watch/motion-watch.ts'
import { MotionController } from '../../state/device/motion-controller.ts'
import { useController } from '../use-controller.ts'

export interface UseMotionWatch<Value> {
  /** the latest value; `undefined` until the first one arrived */
  readonly value: ShallowRef<Value | undefined>
  /** `false` once the watch found that the device reports nothing, `undefined` until it knows */
  readonly isAvailable: Ref<boolean | undefined>
  /** why the last `start()` failed; cleared by the next one */
  readonly error: ShallowRef<unknown>
  readonly isWatching: Ref<boolean>
  /** starts following the sensor; in Safari, request the permission `motion` in a click first */
  start(options?: MotionWatchOptions): void
  /** stops following the sensor; the last value stays */
  stop(): void
}

/**
 * A watch of `butler.motion` as reactive state. Shared by `useAttitude` and `useMovement`. The watch is stopped
 * when the component is unmounted.
 */
export const useMotionWatch = <Value>(
  open: (options?: MotionWatchOptions) => MotionWatch<Value>
): UseMotionWatch<Value> => {
  const controller = new MotionController(() => open)

  return { ...useController(controller), start: controller.start, stop: controller.stop }
}

/**
 * How the device is turned, as reactive state: `value.value?.pitch`, `roll`, `heading`. Nothing is read before
 * `start()`.
 */
export const useAttitude = (motion: DeviceMotion): UseMotionWatch<Attitude> =>
  useMotionWatch((options) => motion.watchAttitude(options))

/**
 * How the device moves, as reactive state: `value.value?.acceleration`, `rotationRate`. Nothing is read before
 * `start()`.
 */
export const useMovement = (motion: DeviceMotion): UseMotionWatch<Movement> =>
  useMotionWatch((options) => motion.watchMotion(options))
