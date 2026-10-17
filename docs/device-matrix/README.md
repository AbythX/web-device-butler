# Device matrix

What real devices do, collected with the [demo pages](../../demo/README.md): the cameras and microphones first, then
the parts around the screen, sharing and files. The results decide which quirk classes the library needs.

No device has been recorded yet.

## Collecting a report

1. `pnpm demo:lan` starts the demo pages over HTTPS and prints their address in the network. Phones in the same
   network open that address and choose `Cameras` (the page `camera/`); the browser warns once about the self-signed
   certificate.
2. From a fresh page load, with the back side and the torch as `must have` and `1920x1080` as `would like`: press `prepare()`, then
   `open()`. Check on the device which lens runs and whether `torch.toggle()` really lights the torch.
3. Reload the page and repeat step 2. This is the cached visit: no camera other than the selected one should start.
4. Press `list({ detail: 'probed' })` once, so the report covers every camera.
5. With the session running, open the page in a second tab and press `prepare()` and `open()` there with each
   `When busy` policy. Note what happens to the session of the first tab.
6. Write the device, the OS version, the browser version and what you saw into the notes, press `Build report` and
   `Copy`, and save the result as `docs/device-matrix/<device>-<browser>.json`.

## Devices to cover

| Device                                        | Browser | Report |
| --------------------------------------------- | ------- | ------ |
| Phone with iOS                                | Safari  |        |
| Android phone with one back camera            | Chrome  |        |
| Android phone with several front/back cameras | Chrome  |        |
| Desktop                                       | Chrome  |        |
| Desktop                                       | Firefox |        |
| Desktop (macOS)                               | Safari  |        |

## Questions the reports have to answer

- Is `facingMode: { ideal }` enough for the access request on the phones that need a request per facing, or does it
  have to be `exact`?
- How long after the start of a camera does Chrome for Android report the torch? The library waits until the
  capabilities stayed the same for 200 ms, at most 1500 ms (`CameraTiming`).
- Does the tie-break of the selection (largest zoom range, then highest resolution) land on the main camera?
- Does a browser swap width and height of the configured resolution when the phone is held upright?
- Does Safari report the torch among the settings of the track, or only among its constraints?
- Does a frozen background tab answer a take-over request?
- Does Firefox change the resolution of a running camera? With its fake camera it accepts the change and keeps
  delivering the old resolution.
- Does OPFS work in Safari on macOS and iOS (open since phase 1)?
- Does Firefox ask twice on the first visit, once for the access request and once for the camera that is opened by
  its id? Its permission is granted per device unless the user chooses to remember it; the specs switch the prompt
  off.
- Are the ids of the cameras the same on the next visit in Safari on iOS? If not, what is remembered about the
  cameras is thrown away on every page load and every camera is started again.
- Does Safari on iOS deliver new frames from the `<video>` of the fabric adapter, which is not part of the page?
- Do the settings of a track swap width and height when the phone is turned? `settingschange` relies on it.

For notifications, the page `use-cases/field-report/` asks for the permission with "Tell me when it was sent" and
notifies once the outbox has sent a report, while no tab of it can be seen. Send a report without a network, switch
to another application, turn the network on. Open for it:

- Does `when: 'unseen'` get its answer from a tab that is frozen in time, or does it treat silence as "not seen"?
- Which phones vibrate for a page at all, and only after a tap?
- Does Chromium on Android throw on `new Notification()` as expected, and show it through a service worker?

For the sensors, the page `location/` has a section "Motion and compass". Press `request('motion')` and the watches,
hold the phone flat, upright and sideways, and turn it once around. Open for it:

- Is `webkitCompassHeading` still there in Safari on iOS, and does it point where the top edge points while the phone
  lies flat, and where the back points while it is upright?
- Does `deviceorientationabsolute` give the heading in Chromium on Android?
- Do pitch and roll stay right when the phone is held sideways, in both directions?
- Does Firefox on Android send `absolute: true` with `deviceorientation`?

For reading codes, the page `use-cases/code-scanner/` scans with the back camera. Hold a QR code and the bar code of
a product in front of it, with and without `always zxing-wasm` and `only the middle of the picture`. Open for it:

- How many pictures per second does a phone read with the code detector of the browser, and with zxing-wasm?
- Does continuous focus keep a code sharp at a short distance, or does the scanner have to focus on the region?
- Does Safari on iOS deliver new pictures to the `<video>` of the scanner, which is not part of the page?

For the recordings that are kept in the storage, the page `use-cases/voice-memo/` records memos that way. Record a
memo for a minute, switch to another application until the browser throws the page away (or kill the browser), and
open the page again: the memo should be listed as `interrupted`. Open for it:

- Does the MP4 that Safari writes play when it is cut off after a piece, or does it need the end that `stop()`
  writes? Chromium writes fragmented MP4, which does.
- How much of the last second is lost when Safari on iOS throws a page away in the background?

For the capture of the screen, the page `screen/` has a section of its own. Press each `open()` there, choose
a screen, a window and a tab in turn, press the stop button of the browser, and record with the microphone. Write
what you saw into the notes. Open for it:

- Which browsers share the sound of a tab, of a window, of the whole screen?
- Does the stop button of the browser end the track in every browser, or only mute it?
- Does `content: 'text'` change what is recorded, visibly?
- Which browsers report `displaySurface` and `cursor`? Firefox reported neither in the specs, so `require` cannot
  check them there.
- Which error does each browser throw on macOS while the system does not allow it to record the screen?

For the microphones, the page `microphone/` builds the same kind of report: press `prepare()` and `open()`,
switch each processing, watch the level, then repeat `open()` in a second tab, with and without `exclusive`. Save it
as `docs/device-matrix/<device>-<browser>-microphone.json`. Open for them:

- Can two tabs record from the microphone at once on iOS? The library lets them (`exclusive: false`).
- Is the first listed microphone the default of the system in Firefox and Safari?
- Which browsers change the processing of a running microphone? Chromium does not, so the library starts the
  microphone again.
- Does the level meter report once the user has interacted with the page in Firefox and Safari?

## The screen, sharing, files and the outbox

These pages build no report. Write what you saw into the notes of the camera report of the same device.

- `screen/`: `request()`, leave the phone alone for longer than its screen timeout, then switch to another
  application and back. `enter(element)`, `lock('landscape')`, then `enter(video)`.
- `sharing/`: every button of the share sheet and the clipboard, `save(picture)`, `pick()` with and without
  `capture`.
- `network/`: flight mode on and off while the page is open, then the steps under
  [things to try without a network](../../demo/README.md#things-to-try-without-a-network).
- `microphone/`: with a headset connected, `audioOutput.list()` before and after `open()`, then
  `route(player, output)` while the tone plays.

Open for them:

- When does a phone refuse a wake lock: while it saves energy, with a low battery, in a page that was installed?
- Does the screen stay on after the return from another application, without another click?
- Which phones fill the screen with a video only, and does `canEnter()` tell them apart?
- Does `lock()` keep the page from turning outside of fullscreen anywhere?
- Which browsers share files, and which kinds? Does `canShare()` agree with what the share sheet then does?
- Does closing the share sheet end `share()` with `false` everywhere, or does a browser never answer?
- Does `readText()` ask the user every time in Safari and Firefox?
- Does `save()` end as `saved` on any phone, or always as `downloaded`? Where does the download go on iOS?
- Does `pick()` with `capture` open the camera application directly? Which phones offer a choice instead?
- Which browsers do not say that the file dialog was closed, so `pick()` only ends through its `signal`?
- Does a phone that returns from flight mode report `change` before a request can succeed?
- Is a page told `hidden` when the screen is locked, and `frozen` at all on iOS?
- Which browsers list audio outputs without an open microphone, and which route the sound of an element?
