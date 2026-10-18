/**
 * The waiting times of the notifications, in milliseconds.
 */
export interface NotificationTiming {
  /** how long the other tabs have to say that they can be seen, in milliseconds */
  answerTimeout?: number
  /** how long the service worker has to say whether there is one, in milliseconds */
  registrationTimeout?: number
}
