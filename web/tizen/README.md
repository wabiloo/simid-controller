# SIMID demo application for Samsung Tizen TV

A minimal Samsung Tizen TV application that plays a fixed demo video stream and loads
SIMID creatives triggered by the Broadpeak [SmartLib agent](https://delivery-platform.broadpeak.tv/smartlib/),
mirroring the [web/app](../app) browser demo and the [web/webos](../webos) LG webOS app, adapted
for Tizen.

This application is using the SIMID controller from this project [web/controller](../controller)
**as-is, unmodified** — it needs to be built before running/packaging this application. No changes
are made to `web/controller`; all Tizen-specific adaptations live in this app only.

## Differences from `web/app` / `web/webos`

Same rationale as the webOS app — a remote-control-only, resource-constrained TV device:

- **No on-screen UI / input form.** The app auto-loads a fixed demo stream on startup.
- **D-pad / remote-control support** (`src/App.ts`) using Samsung Tizen TV remote keycodes:
  - `Enter`/`OK` toggles play/pause
  - `Play`/`Pause`/`Stop` media keys are handled
  - `Back` (Tizen keycode `10009`) exits the app via `tizen.application.getCurrentApplication().exit()`
  - Media keys are explicitly registered via `tizen.tvinputdevice.registerKey(...)`, which Tizen
    requires before `keydown` events for them are delivered to the web app.
- **No click-through / external navigation** — SIMID `OPEN_PAGE` requests are logged and ignored.
- **Bitmovin Player modular build** + the dedicated `bitmovinplayer-tizen.js` module instead of the
  full CDN bundle, per [Bitmovin's Smart TV guidance](https://developer.bitmovin.com/playback/docs/smart-tvs-configuration-and-best-practices).
  No DRM module is included since this demo does not use DRM-protected content.
- **No custom Bitmovin UI (`bitmovin-player-ui`)** — kept out to reduce memory footprint.
- Player is configured with `tweaks.file_protocol`/`tweaks.app_id` and a reduced forward/backward
  buffer, same as the webOS app.
- Packaging uses a Tizen **`config.xml`** widget manifest instead of webOS's `appinfo.json`, and
  produces a `.wgt` package instead of an `.ipk`.

## Prerequisites

Samsung now provides a **Tizen Studio VS Code Extension** that installs the required tooling (SDK
"common tools", `sdb`, a certificate generator, and TV emulator images) without the classic
Eclipse-based Tizen Studio IDE:

1. Install the [Tizen Studio VS Code Extension](https://developer.tizen.org/development/visual-studio-code-tizen-extension/getting-started)
   from the VS Code Marketplace, and follow its setup wizard to install the SDK tools + a **TV**
   emulator image (make sure to check **"TV 10.0"**, not the generic "Tizen x.0" phone/wearable
   platform entries — those don't include the TV profile/APIs this app needs).
2. This installs into `~/.tizen-extension-platform/server/sdktools/data` and adds these env vars to
   your shell profile (e.g. `~/.zshrc`): `TIZEN_SDK`, `TIZEN_SDK_ROOT`, `TIZEN_TOOLS_PATH`. Open a
   new terminal (or `source` your profile) after installing so they're available. The `package`/
   `*-device`/`*-emulator` npm scripts below require `$TIZEN_SDK` to be set in the shell running
   `npm run ...` — this works from a normal interactive terminal, but may not be picked up
   automatically by non-interactive/non-login shells (e.g. some editor task runners); if a script
   fails with `tz: No such file or directory`, run `echo $TIZEN_SDK` first to confirm it's set.
3. The CLI tool is called **`tz`** (this is a newer toolchain than the classic `tizen` command),
   located at `$TIZEN_SDK/tools/tizen-core/tz`. The npm scripts below invoke it via that env var.
4. No explicit signing profile is required for local testing — `tz pack` falls back to bundled
   default/temporary developer certificates if none is configured. For distribution, create a
   profile via the extension's Certificate Manager UI or `tz cert`/`tz security-profiles`.

**Unlike webOS, the Tizen emulator is *supposed* to be supported for testing** (it runs a real
Chromium-based web engine), avoiding the need for a physical Samsung TV. **However, on Apple Silicon
Macs this currently does not work** — see the investigation below. If you're on an Apple Silicon
Mac, plan on physical-device testing for Tizen (same as webOS).

> ### Investigation: Tizen TV emulator is not usable on Apple Silicon Macs (as of this SDK version)
>
> This SDK ships only `macos-64` (x86_64) emulator binaries, bundled with **Intel HAXM** for
> hardware acceleration — there is no Apple Silicon / ARM build. On an M-series Mac this causes a
> cascade of issues, investigated end-to-end on this machine:
>
> 1. **`-accel: invalid option`** — the launch template hardcodes
>    `-accel tcg,thread=multi`, which the bundled macOS x86_64 QEMU fork (an old ~2017 "Maru"
>    fork, v2.8.0.38, running under Rosetta 2) doesn't recognize at all as a flag.
> 2. After removing the `-accel` line: **`Unable to find CPU definition: max`** — `-cpu max` is
>    also not recognized by this old QEMU fork.
> 3. After changing to `-cpu qemu64` (baseline TCG-safe model): the emulator boots the kernel, but
>    **kernel panics** (`Kernel panic - not syncing: Attempted to kill init!`, triggered by an
>    "invalid opcode" trap in `ld-linux-x86-64.so.2`) — `qemu64` is too limited (roughly SSE2-era)
>    for what the Tizen 10.0 guest's `init`/dynamic linker needs.
> 4. Switching to `-cpu Skylake-Client` (the most capable model this QEMU fork supports per
>    `-cpu help`: `qemu32/64, kvm32/64, core2duo, Nehalem, Westmere, SandyBridge, IvyBridge,
>    Haswell, Broadwell, Skylake-Client`, plus some AMD models — no `max`, no `Cascadelake`/newer):
>    TCG emits warnings that it can't emulate `fma`/`avx`/`avx2`/`pcid`/`rdrand`/etc. and masks them
>    off the reported CPUID. The kernel now boots successfully past the earlier panic, **but**
>    Tizen userspace services (`launchpad-starter`, D-Bus, etc.) then segfault in a repeating loop
>    with general-protection faults, and the system never reaches a usable home screen.
>
> **Conclusion:** the segfaults strongly suggest Tizen 10.0's system binaries are compiled expecting
> AVX2/FMA instructions to genuinely execute, not just be reported as present/absent via CPUID —
> and this old QEMU fork's TCG backend likely cannot translate those instructions in software at
> all (only mask their CPUID advertisement), regardless of which CPU model is selected. This appears
> to be a **hard dead end** for this specific combination (Apple Silicon + no hardware acceleration
> + Tizen 10.0 guest image + this old bundled QEMU), not something fixable via further config
> tweaking. It may be resolved in a future SDK/emulator-image update, or by using an Intel Mac /
> Windows/Linux machine (where Intel HAXM or KVM hardware acceleration is available and these
> instructions execute on real silicon).
>
> The fixes for steps 1–3 above (removing `-accel`, changing `-cpu` to `Skylake-Client`) are still
> worth applying — they get furthest before hitting the dead end in step 4 — and are documented here
> in case a future guest image or QEMU update resolves the remaining segfaults. Edit the affected
> VM's `vm_launch.conf` (found under
> `~/.tizen-extension-platform/server/sdktools/sdk-data/emulator/vms/<vm-name>/vm_launch.conf`, in
> the `[[QEMU_OPTIONS]]` section):
> - remove the `-accel tcg,thread=multi` line entirely
> - change `-cpu max` to `-cpu Skylake-Client`
>
> This has to be reapplied if the VM is deleted/recreated. Note also that `tz emul launch` can
> report `"emulator successfully launched"` immediately without the VM having actually finished (or
> being able to) boot — always confirm via `sdb devices` or the emulator window itself, not just the
> CLI's return message.

## Build the SIMID controller

See [web/controller/README.md](../controller/README.md). This app depends on the controller's
built output (`file:../controller`, resolving to `../controller/dist`), so it must be built at
least once (and rebuilt whenever the controller's source changes) before installing this app's
dependencies or building it.

## Develop in a regular browser

For quick iteration, the app can be served like a normal web app (the Tizen-specific code paths —
remote keys, `tizen.tvinputdevice`, `tweaks.file_protocol` — degrade harmlessly, i.e. no-op, in a
desktop browser):

```sh
npm ci
npm start
```

The demo will be available at http://localhost:8083 and will auto-load the fixed demo stream.

## Build & package for Tizen

```sh
npm ci
npm run package
```

This builds the webpack bundle into `public/dist/main.js`, then runs `tz pack -w public -t wgt`,
which produces `public/Debug/public.wgt` (also leaves behind a generated
`public/tizen_web_project.yaml` project descriptor and `public/Debug/projects/` — both gitignored,
regenerated on every pack).

**Verified on this machine:** `npm run build` + `tz pack -w public -t wgt` succeed end-to-end,
producing a valid signed `.wgt` (checked with `unzip -l`) using Tizen's default developer
certificates — no custom signing profile needed for local testing.

## List / launch an emulator

```sh
npm run list-emulators
npm run launch-emulator --name=<emulator-name>
```

Alternatively, launch it from the VS Code extension's Device Manager panel, which gives visual
feedback on boot progress — more reliable than the CLI for confirming the emulator actually booted
(the `tz emul launch` command can report "successfully launched" immediately without the VM
actually finishing boot; confirm with `sdb devices` showing the emulator, or check for its window).

## Install & run on the emulator (or a device)

Once the emulator (or a device) shows up in `sdb devices`:

```sh
npm run install-device --target=<emulator-or-device-name>
npm run launch-device --target=<emulator-or-device-name>
```

To run on a **physical Samsung TV** instead, put it in Developer Mode
([guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)),
connect via `sdb connect <tv-ip>`, and use its device name as `$npm_config_target`.

> **Status on this machine (Apple Silicon Mac):** the emulator does not reach a usable state — see
> the "Investigation" note above. `install-device`/`launch-device` could not be exercised as a
> result. On an Intel Mac / Windows / Linux machine (with working hardware acceleration), or once
> Samsung ships a fix, these commands should work as documented above.

## Behavior

On startup, the app auto-loads the fixed demo stream after a short delay, and at appropriate times
(as configured in the Broadpeak DAI solution for that stream) will trigger display of SIMID
creatives inside the SIMID iframe, same as `web/app` and `web/webos`. Use the remote's D-pad
`Enter`/`Play`/`Pause` keys to control playback, and `Back` to exit the app.
