import Player from './Player'

// Fixed demo stream — no on-screen UI on webOS, no manual URL entry.
const DEFAULT_STREAM_URL = 'https://dcv5s0ei7csoc.cloudfront.net/2ab56412b1163ee1f2c20f39d03e6ede/AVOD/CAMIONSXXL-S2E2/unconditioned/stream.m3u8?ooba-tag=rmc-pause'

// webOS / LG Magic Remote keycodes we care about.
// (see https://webostv.developer.lge.com/develop/references/supported-key)
const KEY_ENTER = 13
const KEY_BACK = 461
const KEY_PLAY = 415
const KEY_PAUSE = 19
const KEY_STOP = 413

export default class App {

  private playerContainer: HTMLElement
  private playerElement: HTMLElement

  private player: Player

  private resizeTimer: number = -1

  constructor() {
    this.playerContainer = document.getElementById('player-container') as HTMLElement
    this.playerElement = document.getElementById('player') as HTMLElement

    this.player = new Player(this.playerContainer, this.playerElement)

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

  private async exitApp() {
    console.log('[App] Exit requested')

    // Stop playback/SIMID session first: PalmSystem.platformBack() only minimizes/backgrounds
    // the app (it does not necessarily terminate it), so without this the stream and any
    // active SIMID session would otherwise keep running invisibly in the background, and the
    // TV would stop delivering further remote-control input to this (now backgrounded) app.
    await this.stopStream()

    const w = window as any
    if (w.webOS && w.webOS.platformBack) {
      w.webOS.platformBack()
    } else if (w.PalmSystem && w.PalmSystem.platformBack) {
      w.PalmSystem.platformBack()
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
