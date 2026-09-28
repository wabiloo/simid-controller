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

The sample entries use public DASH demonstration streams and thumbnail images so channel switching can be tried without a DAI account. They do not provide SIMID ads. Replace stream URLs with Broadpeak DAI-enabled streams to test stream-triggered non-linear SIMID ads. Each JSON channel has `id`, `number`, `name`, `category`, `thumbnail`, and `stream` properties.

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
