# Later

Parts that would fit the library but are not planned yet, and parts that were considered and left out. The parts
that are planned are in [`device-features.md`](device-features.md).

## Would fit, weaker

| Part | What it would do | Why not now |
| ---- | ---------------- | ----------- |
| Background Sync for the outbox | send what is in the outbox also after the last tab was closed | needs a service worker of the application and only exists in Chromium; the outbox already sends on the next visit. Could come as part of the `worker` entry point of the notifications. |
| Battery and power | tell how much battery is left and whether the device charges, for example to warn before a long recording | `getBattery()` only exists in Chromium, and Firefox and Safari removed it on purpose |
| App badge | show a number on the icon of an installed web app, for example the items that are still in the outbox | small, and only for installed web apps; fits once there is a reason to touch the outbox again |

## Left out

| Part | Why |
| ---- | --- |
| Bluetooth, USB, Serial, HID | tied to the device, but large, Chromium only, and about talking to one particular device rather than choosing a device by what it can do |
| Speech recognition and speech output | about language more than the device; the browsers send speech to their own servers in different ways |
| Push messages | need a server and keys, not the device |
