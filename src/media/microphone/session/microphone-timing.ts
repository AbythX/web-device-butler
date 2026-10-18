/**
 * The waiting times of a microphone session, in milliseconds.
 */
export interface MicrophoneTiming {
  /** how often the level is measured while someone listens to it; default: 100 */
  levelInterval?: number
  /**
   * A microphone that ends sooner than this after it was started is not started again by `autoRecover`;
   * default: 1000
   */
  recoverMinLifetime?: number
}
