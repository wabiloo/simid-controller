# SIMID Channel Surf demo

A browser demo that combines a channel guide, Bitmovin player, Broadpeak SmartLib, and the SIMID controller. Select a channel, zap with the Up/Down keys, or press **F** to enter viewport-filling theater mode. Press **Escape** or use the on-screen button to leave theater mode. The theater view uses CSS rather than the browser Fullscreen API, so the SIMID iframe remains layered over the player and SIMID receives `fullscreen: false`.

The Bitmovin Player key in this demo is inherited from the existing local demos and is suitable for the configured demo domains; use your own authorized key if deploying elsewhere.

## Run the demo

Build the controller first (see [web/controller/README.md](../controller/README.md)), then run:

```sh
npm ci
npm start
```

Open http://localhost:8080. The app reads its channel list from [`public/channels.json`](public/channels.json), auto-tunes the first channel, and stops the previous stream and its SIMID sessions when switching channels. If autoplay is rejected by the browser, playback is retried muted.

The channel list currently uses the Broadpeak NEOX HLS service URL for each entry. Each JSON channel has `id`, `number`, `name`, `category`, `thumbnail`, and `stream` properties. Query parameters from each stream URL are forwarded to SmartLib as ad parameters before URL resolution.

Pausing playback waits two seconds, then requests the configured `pause` out-of-band ad break in SmartLib. Resuming playback or changing channels ends the pause ad break and cleans up its SIMID iframe. Pause ads are served only when the Broadpeak service is configured with a matching `pause` OOB ad.

Changing channels requests the configured `zap` out-of-band ad break after the new stream starts. Zap ads do not pause playback; they are served only when the Broadpeak service is configured with a matching `zap` OOB ad, and the active zap ad break ends on the next channel change.

Set the page URL to `?mode=on-zap` to select on-zap mode. The default is pre-roll mode. The current mode is shown in the pill below the channel list. In on-zap mode, channel changes trigger the `zap` OOB ad call; in pre-roll mode, the stream URL should carry the service's pre-roll query parameter.

A temporary, subdued **Pause playback** button beneath the channel list can be used to trigger pause ads while investigating another SIMID creative. It switches to **Resume playback** when paused and is hidden in theater mode.

The app uses the supplied `logo_blue_white.png` Broadpeak logo, served from `public/broadpeak-logo.png` in the upper-left header. The pause/resume investigation control appears below the channel guide and is hidden in theater mode.

## Keyboard forwarding from focused SIMID creatives

The controller in this branch includes a local, one-way extension message:

```json
{
  "sessionId": "<active SIMID session>",
  "messageId": 17,
  "timestamp": 1710000000000,
  "type": "SIMID:Creative:sendKeys",
  "args": { "key": "ArrowDown", "action": "keydown" }
}
```

The `key` may be `ArrowUp`, `ArrowDown`, `f`, `F`, or `Escape`; the controller ignores other keys and messages received before the SIMID session is initialized. This is a one-way notification and does not use resolve/reject responses. Creatives that need zapping or theater shortcuts while focused must forward their keydown event using this message. Page-level keys also work whenever the creative iframe does not own keyboard focus. The theater view includes visible channel up/down controls as a pointer-accessible fallback.

This is a branch-local SIMID controller extension; it is not part of the upstream SIMID protocol specification.
