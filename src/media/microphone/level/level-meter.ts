import type { Listenable } from '../../../core/events/listenable.ts'

export interface LevelMeterEvents {
  /** how loud the microphone is right now, from `0` (silence) to `1` */
  change: number
}

/**
 * Measures how loud a microphone is, for a level display or to notice that nothing arrives.
 *
 * Measuring costs: it runs an audio context. The meter therefore only measures while someone listens to `change`.
 * Browsers do not let a page play or analyse sound before the user has interacted with it; until then nothing is
 * reported.
 */
export interface LevelMeter extends Listenable<LevelMeterEvents> {
  /**
   * Whether the level is being measured, which is the case while someone listens.
   */
  readonly isRunning: boolean

  /**
   * What was measured last: the root mean square of the signal, from `0` to `1`. `0` while nobody listens.
   */
  readonly level: number
}
