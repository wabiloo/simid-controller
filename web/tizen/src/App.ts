import Player from './Player'

declare const tizen: any

// Fixed demo stream — no on-screen UI on Tizen, no manual URL entry.
const DEFAULT_STREAM_URL = 'https://dcv5s0ei7csoc.cloudfront.net/2ab56412b1163ee1f2c20f39d03e6ede/AVOD/CAMIONSXXL-S2E2/unconditioned/stream.m3u8?ooba-tag=rmc-pause'

// Samsung Tizen TV remote keycodes we care about.
// (see https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)
const KEY_ENTER = 13
const KEY_BACK = 10009
const KEY_PLAY = 415
const KEY_PAUSE = 19
const KEY_STOP = 413

// Tizen requires explicit registration of TV-specific keys (beyond Enter/arrows,
// which work out of the box) before keydown events for them are delivered.
const TIZEN_KEYS_TO_REGISTER = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop']

export default class App {

  private playerContainer: HTMLElement
  private playerElement: HTMLElement

  private player: Player

  private resizeTimer: number = -1

  constructor() {
    this.playerContainer = document.getElementById('player-container') as HTMLElement
    this.playerElement = document.getElementById('player') as HTMLElement

    this.player = new Player(this.playerContainer, this.playerElement)

    this.registerTizenKeys()
    this.setResizeObserver()
    this.setupRemoteControl()
  }

  public async init() {
    // Auto-load the fixed demo stream shortly after startup, no user input required.
    setTimeout(() => this.loadStream(), 2000)
  }

  public async reset() {
    await this.stopStream()
  }

  private async loadStream() {
    await this.player.load(DEFAULT_STREAM_URL)
  }

  private async stopStream() {
    await this.player.stop()
  }

  private togglePlayPause() {
    this.player.togglePlayPause()
  }

  private registerTizenKeys() {
    if (typeof tizen === 'undefined' || !tizen.tvinputdevice) {
      return
    }
    for (const key of TIZEN_KEYS_TO_REGISTER) {
      try {
        tizen.tvinputdevice.registerKey(key)
      } catch (e) {
        console.warn('[App] Could not register Tizen key:', key, e)
      }
    }
  }

  private async exitApp() {
    console.log('[App] Exit requested')

    // Stop playback/SIMID session first, in case app termination is delayed or fails.
    await this.stopStream()

    if (typeof tizen !== 'undefined' && tizen.application) {
      tizen.application.getCurrentApplication().exit()
    } else {
      window.close()
    }
  }

  private setupRemoteControl() {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      const keycode = event.keyCode

      switch (keycode) {
        case KEY_ENTER:
          this.togglePlayPause()
          break
        case KEY_PLAY:
          this.player.play()
          break
        case KEY_PAUSE:
          this.player.pause()
          break
        case KEY_STOP:
          this.stopStream()
          break
        case KEY_BACK:
          this.exitApp()
          break
        default:
          console.log('[App] Key pressed:', keycode)
      }
    })
  }

  private setResizeObserver() {
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = window.setTimeout(() => {
        console.log('Window resized:', window.innerWidth, window.innerHeight)
        this.player?.handleResize()
      }, 200)
    })
  }
}
