# SIMID demo application for LG webOS

A minimal LG webOS TV application that plays a fixed demo video stream and loads
SIMID creatives triggered by the Broadpeak [SmartLib agent](https://delivery-platform.broadpeak.tv/smartlib/),
mirroring the [web/app](../app) browser demo but adapted for TV constraints.

This application is using the SIMID controller from this project [web/controller](../controller)
**as-is, unmodified** — it needs to be built before running/packaging this application. No changes
are made to `web/controller`; all webOS-specific adaptations live in this app only.

## Differences from `web/app`

Since webOS TVs are resource-constrained, remote-control-only devices (no mouse/touch, no keyboard):

- **No on-screen UI / input form.** The app auto-loads a fixed demo stream on startup — there is no
  stream-URL input, LOAD/STOP buttons, ad-type selector, or content-metadata dialog.
- **D-pad / remote-control support** is implemented (`src/App.ts`) instead of mouse-driven controls:
  - `Enter`/`OK` toggles play/pause
  - Dedicated `Play`/`Pause`/`Stop` remote keys are also handled
  - `Back` exits the app (via `webOS.platformBack()` / `PalmSystem.platformBack()` if available)
- **No click-through / external navigation.** SIMID creatives' `OPEN_PAGE` requests are logged and
  ignored, since there is no pointer/browser to navigate to on a TV remote-only device.
- **Bitmovin Player modular build** is used instead of the full CDN bundle, plus the dedicated
  `bitmovinplayer-webos` module, per [Bitmovin's Smart TV guidance](https://developer.bitmovin.com/playback/docs/smart-tvs-configuration-and-best-practices).
  No DRM module is included since this demo does not use DRM-protected content.
- **No custom Bitmovin UI (`bitmovin-player-ui`)** — kept out to reduce memory footprint on the TV.
- Player is configured with `tweaks.file_protocol`/`tweaks.app_id` (required when the HTML is bundled
  inside the TV app package) and a reduced forward/backward buffer, per Bitmovin's recommendations.

## Prerequisites

- The [webOS TV SDK](https://webostv.developer.lge.com/develop/tools/cli-installation) (CLI `ares-*`
  tools and/or the VS Code extension) installed on your machine.
- A physical LG webOS TV in [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app),
  registered as an `ares-setup-device` target.
  **Note:** Bitmovin Player is not supported on the webOS emulator/simulator — testing requires a
  real device.

## Build the SIMID controller

See [web/controller/README.md](../controller/README.md). This app depends on the controller's
built output (`file:../controller`, resolving to `../controller/dist`), so it must be built at
least once (and rebuilt whenever the controller's source changes) before installing this app's
dependencies or building it.

## Develop in a regular browser

For quick iteration, the app can be served like a normal web app (no TV-specific packaging), since
the webOS-specific code paths (remote keys, `tweaks.file_protocol`, etc.) degrade harmlessly in a
desktop browser:

```sh
npm ci
npm start
```

The demo will be available at http://localhost:8082 and will auto-load the fixed demo stream.

## Build & package for webOS

```sh
npm ci
npm run package
```

This builds the webpack bundle into `public/dist/main.js` and then runs `ares-package` (with
`--no-minify`, see note below) to produce an `.ipk` in `dist-ipk/`.

> **Note on minification:** `ares-package`'s bundled minifier (an older Terser build) fails to parse
> modern syntax (e.g. optional chaining `?.`) present in the pre-built `@broadpeak/smartlib*`
> vendor bundles that webpack does not transpile (`node_modules` is excluded from `ts-loader`).
> The `package` script therefore passes `-n`/`--no-minify` to `ares-package`. Webpack's own output
> is not re-minified in `mode: 'development'` either — adjust `webpack.config.ts` to `mode:
> 'production'` if a minified bundle is desired for distribution.

## Install & run on a device

```sh
ares-setup-device                          # one-time: register your TV as a device target
npm run install-device --device=<name>
npm run launch-device --device=<name>
npm run inspect-device --device=<name>     # optional: opens a remote devtools inspector
```

Replace `<name>` with the device name configured via `ares-setup-device`.

## Behavior

On startup, the app auto-loads the fixed demo stream after a short delay, and at appropriate times
(as configured in the Broadpeak DAI solution for that stream) will trigger display of SIMID
creatives inside the SIMID iframe, same as `web/app`. Use the TV remote's D-pad `Enter`/`Play`/
`Pause` keys to control playback, and `Back` to exit the app.
