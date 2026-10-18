# Notifications and vibration

`butler.notifications` shows notifications of the system, and `butler.vibration` makes the device vibrate. Both get
the attention of a user who is somewhere else.

Try it: `pnpm demo`, page `use-cases/field-report/`.

## The permission

```ts
button.onclick = async () => {
  const state = await butler.permission.request('notifications') // 'granted' | 'denied' | 'prompt' | 'unsupported'
}
```

`butler.prepare({ notifications: true })` does the same as part of a set-up screen, and reports a refusal as a
`PermissionDeniedError` in `error`. `prepare()` without options leaves the notifications out.

Ask in answer to a click: Safari and Firefox ask the user only then, and otherwise leave the state at `prompt`.
Ask when the user wants something the notification is for ("tell me when it was sent"), not when the page loads:
a prompt nobody asked for is mostly refused, and a refusal is for good.

## Showing a notification

```ts
const shown = await butler.notifications.show({
  title: 'Report sent',
  body: 'The field report from 10:42 has arrived.',
  tag: 'outbox',
  data: { report: 42 },
  when: 'unseen',
})

await shown?.close() // where it is still there

butler.notifications.on('click', ({ tag, data, action }) => openReport(data))
```

Everything but `title` and `when` goes to the browser as it is: `body`, `icon`, `badge`, `data`,
`requireInteraction`, `silent`. A notification with the same `tag` replaces the one before it, also one another
tab showed; without a `tag` each gets one of its own.

| `when`   | Shows it                                                          |
| -------- | ----------------------------------------------------------------- |
| `always` | whenever it is asked for (default)                                |
| `hidden` | only while the user cannot see this tab                           |
| `unseen` | only while the user can see no tab of this application            |

`show()` resolves with `undefined` when `when` kept the notification back.

For `unseen`, the tab asks the other tabs over a broadcast channel, and the ones the user can see answer. A tab
answers once its application has used `butler.notifications`, for example by listening to `click`, so creating the
butler stays free of any work. A tab that is frozen does not answer, and a headless browser can report every tab
as visible. `butler.notifications.isSeenElsewhere()` asks the same question on its own.

## A service worker, or none

There are two ways to show a notification, and browsers differ in which they allow:

- **From the page**, with `new Notification()`. Chromium on Android does not allow it and throws.
- **From the service worker** of the application, which every browser that has notifications allows.

The library takes the service worker where the application has one that runs, and the page otherwise. Without a
service worker, Chromium on Android fails with an `UnsupportedError`.

A click on a notification the page showed brings the page to the front and arrives as `click`. A click on one the
service worker showed reaches only the worker. To hand it to the page, call this once in the service worker:

```ts
// sw.ts
import { forwardNotificationEvents } from 'web-device-butler/worker'

forwardNotificationEvents(self, { openUrl: '/reports' })
```

It closes the notification, brings the page that was used last to the front and tells it, so `click` arrives
there too. Where no page is open, it opens `openUrl`, which is not told about the click: put what that page needs
into the address. The library never registers a service worker of its own; that belongs to the application.

## Where notifications are not available

`butler.notifications.isSupported` is `false` without HTTPS, and in Safari on iOS outside a web app that was added to
the home screen: there are no notifications for a tab there. Offer something else, such as a message in the page or
a vibration.

Push messages, which arrive while no page of the application is open, need a server and keys and are not part of
the library.

## Vibration

```ts
butler.vibration.vibrate('success') // 'tap' | 'success' | 'error' | 'long'
butler.vibration.vibrate([100, 50, 100]) // vibration, pause, vibration, in milliseconds
butler.vibration.stop()
```

`vibrate()` returns whether the browser took the pattern. Safari has no vibration (`isSupported` is `false`), most
desktops have nothing to vibrate with, and Chromium only vibrates for a page the user has tapped or clicked on
before. A vibration is a sign, never the only one.

## Errors

| Error                   | Thrown when                                                                       |
| ----------------------- | --------------------------------------------------------------------------------- |
| `UnsupportedError`      | the page cannot show notifications, or only a service worker can and there is none |
| `PermissionDeniedError` | the permission `notifications` was not granted; `permission` is `notifications`   |

## Not verified yet

Tested against fakes of the notifications, the service worker and its clients, and in Chromium, Firefox and WebKit,
where the tabs found each other over the broadcast channel. The browsers of the specs do not grant notifications and
cannot vibrate, so no notification was shown there. Neither has run on a phone; the
[device matrix](../device-matrix/README.md) has the questions.
