import Player from './Player'

const DEFAULT_STREAM_URL = 'https://dcv5s0ei7csoc.cloudfront.net/2ab56412b1163ee1f2c20f39d03e6ede/AVOD/Meridian_1920x1080_30fps_SDR/conditioned/stream.mpd?ooba-tag=rmc-pause'

export default class App {

  private playerContainer: HTMLElement
  private playerElement: HTMLElement
  private videoElement: HTMLMediaElement

  private streamEditUrl: HTMLTextAreaElement
  private streamButtonLoad: HTMLButtonElement
  private streamButtonStop: HTMLButtonElement

  private metadataButton: HTMLButtonElement
  private metadataOverlay: HTMLElement

  private resizeTimer: number = -1

  private player: Player

  constructor() {
    this.playerContainer = document.getElementById('player-container') as HTMLElement
    this.playerElement = document.getElementById('player') as HTMLElement
    this.videoElement = document.getElementById('video') as HTMLMediaElement
    this.streamEditUrl = document.getElementById('stream-edit-url') as HTMLTextAreaElement
    this.streamButtonLoad = document.getElementById('stream-button-load') as HTMLButtonElement
    this.streamButtonStop = document.getElementById('stream-button-stop') as HTMLButtonElement
    this.metadataButton = document.getElementById('metadata-button') as HTMLButtonElement
    this.metadataOverlay = document.getElementById('metadata-overlay') as HTMLElement

    this.player = new Player(this.playerContainer, this.playerElement, this.videoElement)

    this.setResizeObserver()
    this.setupMetadata()
  }

  public async init() {

    this.streamButtonLoad.onclick = (e) => this.loadStream()
    this.streamButtonStop.onclick = (e) => this.stopStream()

    const urlParam = (new URL(window.location.href)).searchParams.get('url')
    const url = urlParam || DEFAULT_STREAM_URL

    this.streamEditUrl.value = url

    setTimeout(() => this.loadStream(), 2000)
  }

  public async reset() {
    await this.stopStream()
  }

  private async loadStream() {
    const url = this.streamEditUrl.value
    await this.player.load(url)
  }

  private async stopStream() {
    await this.player.stop()
  }

  private setupMetadata() {
    this.metadataButton.onclick = () => this.openMetadataOverlay()

    document.getElementById('metadata-close')!.onclick = () => this.closeMetadataOverlay()
    document.getElementById('metadata-cancel')!.onclick = () => this.closeMetadataOverlay()

    document.getElementById('metadata-save')!.onclick = () => {
      this.player.setContentMetadata(this.readMetadataFields())
      this.closeMetadataOverlay()
    }

    this.metadataOverlay.addEventListener('click', (e) => {
      if (e.target === this.metadataOverlay) this.closeMetadataOverlay()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMetadataOverlay()
    })
  }

  private openMetadataOverlay() {
    this.renderMetadataFields(this.player.getContentMetadata())
    this.metadataOverlay.style.display = 'flex'
  }

  private closeMetadataOverlay() {
    this.metadataOverlay.style.display = 'none'
  }

  private renderMetadataFields(metadata: Record<string, string>): void {
    const container = document.getElementById('metadata-fields')!
    container.innerHTML = ''
    for (const [key, value] of Object.entries(metadata)) {
      const row = document.createElement('div')
      row.className = 'metadata-row'

      const label = document.createElement('label')
      label.className = 'metadata-key'
      label.textContent = key

      const input = document.createElement('input')
      input.className = 'metadata-value'
      input.type = 'text'
      input.dataset.key = key
      input.value = value

      row.appendChild(label)
      row.appendChild(input)
      container.appendChild(row)
    }
  }

  private readMetadataFields(): Record<string, string> {
    const metadata: Record<string, string> = {}
    document.querySelectorAll<HTMLInputElement>('#metadata-fields .metadata-value').forEach(input => {
      metadata[input.dataset.key!] = input.value
    })
    return metadata
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
