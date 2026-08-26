# Broadpeak SIMID Controller: Version 0.4.0 vs 0.5.0 Differences

## Overview

This document details the differences between version 0.4.0 and version 0.5.0 of the Broadpeak SIMID Controller library.

**Repository:** https://github.com/Broadpeak-tv/simid-controller

**Total Changes:** 17 files modified, 348 insertions, 257 deletions

---

## Summary of Key Changes

Version 0.5.0 introduces significant enhancements to support nonlinear ad expansion/collapse functionality, improved resize handling, and better media state management. The changes affect both Web (TypeScript/JavaScript) and Android (Kotlin) implementations.

---

## Major Feature Additions

### 1. Nonlinear Ad Expansion/Collapse Support

**New SIMID Messages Supported:**
- `Creative:expandNonlinear` - Expands a nonlinear ad to full player dimensions
- `Creative:collapseNonlinear` - Collapses an expanded nonlinear ad back to original dimensions

**Behavior:**
- When expanding: player pauses media and resizes creative to full player dimensions
- When collapsing: player resumes media and resizes creative back to original dimensions
- Both operations support rejection if the player cannot complete the resizing

### 2. Player Resize Notification

**New Public Method:**
- `notifyResize(playerDimensions, creativeDimensions, fullscreen)` 
  - Allows the application to notify the SIMID controller when player or creative dimensions change
  - Sends a `SIMID:Player:resize` message to the creative
  - Available in both Web and Android implementations

### 3. Separate Creative Dimensions

**Constructor Changes:**
- Both Web and Android controllers now accept a separate `creativeDimensions` parameter
- Previously, creative dimensions were assumed to be the same as player dimensions
- This allows for proper handling of nonlinear ads that don't occupy the full player area

**Constructor Signature Changes:**

**Web (TypeScript):**
```typescript
// v0.4.0
constructor(
  playerDimensions: DOMRect,
  creativeUri: string,
  adParameters = '',
  adDuration = 0,
  adSkippable = false,
  mediaStatePollingInterval = 250
)

// v0.5.0
constructor(
  playerDimensions: DOMRect,
  creativeDimensions: DOMRect,  // NEW
  creativeUri: string,
  adParameters = '',
  adDuration = 0,
  adSkippable = false,
  mediaTimeupdateInterval = 250  // RENAMED
)
```

**Android (Kotlin):**
```kotlin
// v0.4.0
SimidController(
  activity: Activity,
  context: Context,
  playerDimensions: Rect,
  creativeUri: String,
  adParameters: String = "",
  adDuration: Float = 0.0F,
  adSkippable: Boolean = false,
  mediaStatePollingInterval: Long = 250L
)

// v0.5.0
SimidController(
  activity: Activity,
  context: Context,
  playerDimensions: Rect,
  creativeDimensions: Rect,  // NEW
  creativeUri: String,
  adParameters: String = "",
  adDuration: Float = 0.0F,
  adSkippable: Boolean = false,
  mediaTimeupdateInterval: Long = 250L  // RENAMED
)
```

### 4. Media Timeupdate Improvements

**Renaming and Clarification:**
- `mediaStatePollingInterval` → `mediaTimeupdateInterval`
- More accurately reflects its purpose (sending timeupdate messages)
- Can now be set to `-1` to disable automatic timeupdate messages
- Constant renamed from `MEDIA_STATE_POLL_INTERVAL_MS` to `MEDIA_TIMEUPDATE_INTERVAL_MS`

**Internal Method Renaming:**
- `_startPollingMediaState()` → `_startMediaTimeupdateInterval()`
- `_stopPollingMediaState()` → `_stopMediaTimeupdateInterval()`

### 5. Environment Data Enhancement

**New Field in Init Message:**
- `nonlinearDuration` is now included in the environment data sent to creatives
- Set to the `adDuration` value provided in constructor
- Informs the creative of the intended display duration for nonlinear ads

---

## Implementation Details

### Web Controller Changes

#### New Message Handlers

```typescript
protected onCreativeExpandNonlinear(message: Message)
protected onCreativeCollapseNonlinear(message: Message)
```

#### Enhanced Resize Handler

The `onCreativeRequestResize` method now:
- Stores creative dimensions for future use (collapse operations)
- Uses optional chaining for safer callback invocation
- Provides more specific error messages

#### Creative Dimensions Tracking

- Added `_creativeDimensions` private property
- Updated throughout the lifecycle to maintain current creative size
- Used when collapsing expanded nonlinear ads

### Android Controller Changes

#### New Public Methods

```kotlin
fun onPlayMedia(cb: () -> Boolean)
fun onPauseMedia(cb: () -> Boolean)
fun notifyResize(playerDimensions: Rect, creativeDimensions: Rect, fullscreen: Boolean)
```

#### Enhanced Message Handlers

- `onCreativeExpandNonlinear(message: Message)`
- `onCreativeCollapseNonlinear(message: Message)`
- Improved `onCreativeRequestResize` with better error handling

#### Code Cleanup

- Removed unused commented code
- Removed unnecessary console.log statements from WebView injection
- Set initial WebView visibility to `GONE`
- Removed unused properties (`_duration`, `_startPosition`)

---

## Demo Application Changes

### Web Demo App

**UI Improvements:**
- Moved input controls outside of player container for better layout
- Removed localStorage usage for stream URL (now uses query parameters only)
- Changed player positioning from absolute to relative for better responsiveness

**Controller Integration Updates:**
- ✅ Updated constructor call to new signature (passing `playerRect` twice)
- ✅ Added `onPauseMedia` and `onPlayMedia` callbacks
- ✅ Implemented `pauseMedia()` and `playMedia()` methods
- ✅ Added window resize observer that debounces and calls `notifyResize()`
- ✅ New `handleResize()` method that notifies all active SIMID controllers

**Limitations:**
- ⚠️ Demo passes same dimensions for both player and creative (`playerRect, playerRect`)
- ⚠️ Does not demonstrate the separate creative dimensions feature
- ⚠️ No specific UI to showcase nonlinear ad expansion/collapse functionality
- Note: The demo works correctly but doesn't fully showcase the new nonlinear ad capabilities

### Android Demo App

**Refactoring:**
- Significant refactoring of `PlayerActivity.kt` (181 lines changed)
- Better separation of concerns between player and ad controller
- Improved resize animation handling
- Fixed `pauseMedia()` implementation

**SimidController Integration:**
- Updated to use new constructor signature with creative dimensions
- Enhanced resize handling
- Better state management

---

## Breaking Changes

### Constructor Signature Changes

**Applications using v0.4.0 will need to update their controller instantiation:**

**Web:**
```typescript
// Before (v0.4.0)
const controller = new SimidController(
  playerDimensions,
  creativeUri,
  adParameters,
  duration
);

// After (v0.5.0)
const controller = new SimidController(
  playerDimensions,
  creativeDimensions,  // NEW required parameter
  creativeUri,
  adParameters,
  duration
);
```

**Android:**
```kotlin
// Before (v0.4.0)
val controller = SimidController(
  activity,
  context,
  playerDimensions,
  creativeUri,
  adParameters,
  duration
)

// After (v0.5.0)
val controller = SimidController(
  activity,
  context,
  playerDimensions,
  creativeDimensions,  // NEW required parameter
  creativeUri,
  adParameters,
  duration
)
```

---

## Bug Fixes

1. **Android App:**
   - Fixed `player/pauseMedia()` implementation (#12, #11)
   - Fixed resize animation issues (#12)
   - Fixed typos in documentation

2. **Web Controller:**
   - Fixed messages logging

3. **General:**
   - Code cleanup and refactoring for better maintainability

---

## Documentation Updates

- Android controller README updated with corrected terminology ("nonlinear" instead of "non-linear")
- Added API documentation for Android controller methods
- Enhanced code comments throughout both implementations
- Added JSDoc/KDoc comments for new public methods

---

## Version Numbers Updated

All package files updated from 0.4.0 to 0.5.0:
- `web/controller/package.json`
- `web/app/package.json`
- Android build configuration files

---

## Detailed Web Demo App Changes

### App.ts Changes

**Removed:**
- LocalStorage functionality for persisting stream URL
- `STORAGE_BASE_KEY` constant
- `getFromLocalStorage()` and `saveToLocalStorage()` methods

**Added:**
- Resize observer with debouncing (200ms delay)
- `resizeTimer` property to handle debounced resize events
- `setResizeObserver()` method that calls `player.handleResize()`

**Simplified:**
- Stream URL now uses query parameter or defaults to `DEFAULT_STREAM_URL`
- No longer saves stream URL between sessions

### Player.ts Changes

**Constructor Call Update:**
```typescript
// v0.4.0
const simidController = new SimidController(playerRect, creativeUri, adParameters, duration)

// v0.5.0
const simidController = new SimidController(
  playerRect,    // playerDimensions
  playerRect,    // creativeDimensions (same as player)
  creativeUri,
  adParameters,
  duration
)
```

**New Callbacks:**
```typescript
// Added media control callbacks
simidController.onPauseMedia = () => this.pauseMedia()
simidController.onPlayMedia = () => this.playMedia()
```

**New Methods:**
```typescript
// Handles window resize events
public handleResize() {
  const playerRect: DOMRect = this.playerContainer.getBoundingClientRect()
  this.simidControllers.forEach(controller => 
    controller.notifyResize(playerRect, playerRect, false)
  )
}

// Pause video playback
private pauseMedia(): boolean {
  console.log('[Player] Pause media')
  this.videoElement.pause()
  return true
}

// Resume video playback
private playMedia(): boolean {
  console.log('[Player] Play media')
  this.videoElement.play()
  return true
}
```

### index.html Changes

**CSS Updates:**
- Player positioning changed from `absolute` to `relative`
- Player dimensions changed from `100vw/100vh` to `100%`
- Inputs moved outside the `#player` div
- Input controls z-index increased to 999 for better visibility

**HTML Structure:**
```html
<!-- v0.4.0: Inputs inside player -->
<div id="player">
  <div class="inputs">...</div>
  <video>...</video>
</div>

<!-- v0.5.0: Inputs outside player -->
<div class="inputs">...</div>
<div id="player">
  <video>...</video>
</div>
```

### What's Missing for Full Feature Demonstration

To fully showcase v0.5.0's nonlinear ad capabilities, the demo would ideally include:

1. **Separate Creative Dimensions:**
   ```typescript
   // Example: smaller creative area for nonlinear ad
   const creativeRect = new DOMRect(
     playerRect.x,
     playerRect.y + playerRect.height - 100,  // Bottom of player
     playerRect.width,
     100  // 100px tall banner
   )
   const simidController = new SimidController(
     playerRect,      // Full player
     creativeRect,    // Smaller banner area
     creativeUri,
     adParameters,
     duration
   )
   ```

2. **UI Controls for Testing:**
   - Button to manually trigger expand/collapse
   - Visual indicator of creative vs player dimensions
   - Toggle between linear and nonlinear ad modes

3. **Visual Demonstration:**
   - Show the creative in a smaller area initially
   - Demonstrate expansion to full screen on user interaction
   - Show collapse back to original size

---

## Commits Between Versions

The following 17 commits were made between v0.4.0 and v0.5.0:

1. `e522e4d` - Fix typo
2. `9c6d491` - Creative.REQUEST_PLAY/PAUSE (#11)
3. `7f3b98e` - [android/app] Fix player/pauseMedia()
4. `2981e98` - [android/app] Fix player/pauseMedia()
5. `44d6a30` - [android/app] Fix resize animation (#12)
6. `f060c71` - [web/controller] Fix messages logging
7. `a49735c` - Add support for SIMID:Media:timeupdate message (cont'd) (#13)
8. `4bb1f78` - Refactor android controller and demo app (#14)
9. `8a3fea5` - Add support for Creative:expandNonlinear and Creative:collapseNonlinear messages (#15)
10. `60cfe87` - [web/controller] Set nonlinearDuration in init env data
11. `9b8e675` - [android/controller] Set nonlinearDuration in init env data
12. `7b68e14` - [android/controller] misc
13. `41f1c67` - Add support for SIMID:Player:resize message (#16)
14. `94b458f` - [web/app] Set inputs out of player container
15. `20b6069` - [web/app] Remove local storage for input stream url (use query param instead)
16. `e85044d` - clean code
17. `5bbf70c` - [android/controller] Add API doc
18. `6ecfcec` - v0.5.0

---

## Migration Guide

### For Web Applications

1. Update the constructor call to include `creativeDimensions`:
   ```typescript
   const creativeDims = calculateCreativeDimensions(); // Your logic
   const controller = new SimidController(
     playerDimensions,
     creativeDims,  // Add this
     creativeUri,
     adParameters,
     duration
   );
   ```

2. If your app supports fullscreen or dynamic resizing, implement resize notifications:
   ```typescript
   window.addEventListener('resize', () => {
     controller.notifyResize(
       getPlayerDimensions(),
       getCreativeDimensions(),
       isFullscreen()
     );
   });
   ```

3. If you want to disable automatic timeupdate messages:
   ```typescript
   const controller = new SimidController(
     playerDimensions,
     creativeDimensions,
     creativeUri,
     adParameters,
     duration,
     false, // adSkippable
     -1     // disable timeupdate
   );
   ```

### For Android Applications

1. Update the controller instantiation:
   ```kotlin
   val creativeDimensions = calculateCreativeDimensions() // Your logic
   val controller = SimidController(
     activity,
     context,
     playerDimensions,
     creativeDimensions,  // Add this
     creativeUri,
     adParameters,
     duration
   )
   ```

2. Set up the new media control callbacks:
   ```kotlin
   controller.onPlayMedia {
     // Resume media playback
     player.play()
     true
   }
   
   controller.onPauseMedia {
     // Pause media playback
     player.pause()
     true
   }
   ```

3. Implement resize notifications if needed:
   ```kotlin
   // When player or creative resizes
   controller.notifyResize(
     playerDimensions,
     creativeDimensions,
     isFullscreen
   )
   ```

---

## Testing Recommendations

When migrating to v0.5.0, test the following scenarios:

1. **Nonlinear Ad Expansion:**
   - Verify nonlinear ads can expand to full screen
   - Check that media pauses when expanded
   - Ensure creative resizes correctly

2. **Nonlinear Ad Collapse:**
   - Verify expanded ads collapse to original size
   - Check that media resumes when collapsed
   - Ensure creative dimensions restore properly

3. **Dynamic Resizing:**
   - Test fullscreen transitions
   - Verify orientation changes (mobile)
   - Check window resize behavior (web)

4. **Creative Resize Requests:**
   - Test creative-initiated resize requests
   - Verify error handling for unsupported resize operations
   - Check player resize follows creative resize

5. **Backward Compatibility:**
   - Ensure existing linear ads still function
   - Test with creatives that don't use new features
   - Verify error messages for unsupported operations

---

## Conclusion

Version 0.5.0 represents a significant enhancement to the SIMID Controller library, primarily focused on improving support for nonlinear ads with expand/collapse functionality and better dimension management. While there are breaking changes in the constructor signature, the migration path is straightforward, and the new functionality enables richer ad experiences.

The changes maintain the core SIMID protocol compliance while adding practical features requested by implementers working with interactive, expandable nonlinear ads.
