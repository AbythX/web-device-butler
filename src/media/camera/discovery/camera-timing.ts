/**
 * The waiting times of the camera module, in milliseconds. The defaults are guesses until the device matrix says
 * more; specs shorten them.
 */
export interface CameraTiming {
  /** how often a camera that was just started is asked what it can do; default: 50 */
  capabilityInterval?: number
  /** how long the answer has to stay the same before it counts; default: 200 */
  capabilitySettleTime?: number
  /** when to stop waiting for the answer to settle and take what is there; default: 1500 */
  capabilityTimeout?: number
  /**
   * A camera that ends sooner than this after it was started is not started again by `autoRecover`, so a camera
   * that cannot run does not restart forever; default: 1000
   */
  recoverMinLifetime?: number
  /**
   * How often a running camera is asked what it delivers while someone listens to `settingschange`, which is the
   * only way to notice that a phone was turned; default: 500
   */
  settingsInterval?: number
}
