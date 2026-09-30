import Player from './Player'

type Channel = {
  id: string
  number: string
  name: string
  category: string
  thumbnail: string
  stream: string
}

type AdMode = 'pre-roll' | 'on-zap'

const CHANNELS_URL = './channels.json'
const CHANNEL_SWITCH_TOAST_MS = 3000
const SUPPORTED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'f', 'F', 'Escape', ' '])
const delayParam = new URLSearchParams(window.location.search).get('zapDelay')
const initialZapDelay = delayParam !== null && /^\d{1,2}$/.test(delayParam) ? Number(delayParam) : 0

export default class App {
  private playerContainer: HTMLElement
  private channelsElement: HTMLElement
  private player: Player
  private channels: Channel[] = []
  private adMode: AdMode = new URLSearchParams(window.location.search).get('mode') === 'on-zap' ? 'on-zap' : 'pre-roll'
  private zapDelaySeconds = initialZapDelay
  private activeChannelIndex = -1
  private toastHideTimer = -1
  private theaterMode = false
  private tuneRequest = 0

  constructor() {
    this.playerContainer = document.getElementById('player-container') as HTMLElement
    this.channelsElement = document.getElementById('channels') as HTMLElement

    const playerElement = document.getElementById('player') as HTMLElement
    this.player = new Player(
      this.playerContainer,
      playerElement,
      (key) => this.handleAppKey(key),
      () => {}
    )
    this.updateAdModePill()
    this.updateModeUrl()
    const delayInput = document.getElementById('zap-delay') as HTMLInputElement
    delayInput.value = String(this.zapDelaySeconds)

    document.getElementById('ad-mode-pill')!.addEventListener('click', () => this.toggleAdMode())
    delayInput.addEventListener('input', () => {
      const digits = delayInput.value.replace(/\D/g, '').slice(0, 2)
      if (delayInput.value !== digits) delayInput.value = digits
      this.updateZapDelay(delayInput, false)
    })
    delayInput.addEventListener('change', () => this.updateZapDelay(delayInput, true))
    document.getElementById('theater-toggle')!.addEventListener('click', () => this.setTheaterMode(!this.theaterMode))
    document.getElementById('channel-up')!.addEventListener('click', () => this.zap(-1))
    document.getElementById('channel-down')!.addEventListener('click', () => this.zap(1))
    document.addEventListener('keydown', event => this.onKeyDown(event))
    window.addEventListener('resize', () => this.player.handleResize(this.theaterMode))
  }

  public async init(): Promise<void> {
    try {
      const response = await fetch(CHANNELS_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const channels = await response.json() as Channel[]
      if (!Array.isArray(channels) || channels.length === 0) throw new Error('Channel config must contain at least one channel')
      this.channels = channels.filter(channel => channel && channel.id && channel.number && channel.name && channel.thumbnail && channel.stream)
      if (this.channels.length === 0) throw new Error('Channel config contains no valid channels')
      if (this.channels.length !== channels.length) console.warn('[App] Skipped incomplete channel config entries')
      this.renderChannels()
      await this.tune(0)
    } catch (error) {
      console.error('[App] Failed to load channel configuration:', error)
      this.showStatus('Unable to load channels. Check channels.json and reload.')
    }
  }

  public async reset(): Promise<void> {
    ++this.tuneRequest
    window.clearTimeout(this.toastHideTimer)
    await this.player.stop()
  }

  private renderChannels(): void {
    this.channelsElement.replaceChildren()
    this.channels.forEach((channel, index) => {
      const button = document.createElement('button')
      button.className = 'channel-card'
      button.type = 'button'
      button.dataset.channelIndex = String(index)
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-label', `Channel ${channel.number}: ${channel.name}`)
      const image = document.createElement('img')
      image.className = 'channel-thumbnail'
      image.src = channel.thumbnail
      image.alt = ''
      image.loading = 'lazy'
      image.addEventListener('error', () => {
        image.removeAttribute('src')
        image.classList.add('thumbnail-fallback')
      }, { once: true })

      const details = document.createElement('span')
      details.className = 'channel-details'
      const number = document.createElement('span')
      number.className = 'channel-number'
      number.textContent = channel.number
      const name = document.createElement('span')
      name.className = 'channel-name'
      name.textContent = channel.name
      details.append(number, name)
      button.append(image, details)
      button.addEventListener('click', () => void this.tune(index))
      this.channelsElement.appendChild(button)
    })
  }

  private async tune(index: number): Promise<void> {
    const channel = this.channels[index]
    if (!channel || index === this.activeChannelIndex) return

    const requestId = ++this.tuneRequest
    this.activeChannelIndex = index
    this.channelsElement.querySelectorAll<HTMLButtonElement>('.channel-card').forEach((button, buttonIndex) => {
      const selected = buttonIndex === index
      button.classList.toggle('is-active', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    this.showChannelToast(channel)
    this.hideStatus()
    try {
      await this.player.load(channel.stream, this.adMode, this.zapDelaySeconds)
    } catch (error) {
      if (this.tuneRequest !== requestId) return
      console.error('[App] Failed to tune channel:', error)
      this.showStatus(`Unable to play ${channel.name}. Check the stream URL in channels.json.`)
    }
  }

  private zap(offset: number): void {
    if (this.channels.length < 2 || this.activeChannelIndex < 0) return
    const nextIndex = (this.activeChannelIndex + offset + this.channels.length) % this.channels.length
    void this.tune(nextIndex)
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || !SUPPORTED_KEYS.has(event.key) || this.isTypingTarget(event.target)) return
    this.handleAppKey(event.key)
    event.preventDefault()
  }

  private handleAppKey(key: string): void {
    switch (key) {
      case 'ArrowUp':
        this.zap(-1)
        break
      case 'ArrowDown':
        this.zap(1)
        break
      case 'f':
      case 'F':
        this.setTheaterMode(!this.theaterMode)
        break
      case 'Escape':
        if (this.theaterMode) this.setTheaterMode(false)
        break
      case ' ':
        this.player.togglePlayback()
        break
    }
  }

  private setTheaterMode(enabled: boolean): void {
    if (this.theaterMode === enabled) return
    this.theaterMode = enabled
    document.body.classList.toggle('theater-mode', enabled)
    document.getElementById('zap-controls')!.setAttribute('aria-hidden', String(!enabled))
    const button = document.getElementById('theater-toggle')!
    button.textContent = enabled ? 'Exit theater' : 'Theater mode'
    button.setAttribute('aria-pressed', String(enabled))
    requestAnimationFrame(() => this.player.handleResize(enabled))
  }

  private showChannelToast(channel: Channel): void {
    const toast = document.getElementById('channel-toast')!
    toast.textContent = `${channel.number} · ${channel.name}`
    window.clearTimeout(this.toastHideTimer)
    toast.classList.add('is-visible')
    this.toastHideTimer = window.setTimeout(() => toast.classList.remove('is-visible'), CHANNEL_SWITCH_TOAST_MS)
  }

  private showStatus(message: string): void {
    const status = document.getElementById('status-message')!
    status.textContent = message
    status.hidden = false
  }

  private hideStatus(): void {
    document.getElementById('status-message')!.hidden = true
  }

  private updateAdModePill(): void {
    const pill = document.getElementById('ad-mode-pill')!
    pill.textContent = this.adMode === 'on-zap' ? 'OOBA on zap' : 'Pre-roll'
    pill.setAttribute('aria-label', `Ad mode: ${pill.textContent}. Activate to switch to ${this.adMode === 'on-zap' ? 'Pre-roll' : 'OOBA on zap'}.`)
    document.getElementById('zap-delay-label')!.hidden = this.adMode !== 'on-zap'
  }

  private toggleAdMode(): void {
    this.adMode = this.adMode === 'on-zap' ? 'pre-roll' : 'on-zap'
    this.updateModeUrl()
    this.updateAdModePill()
  }

  private updateModeUrl(): void {
    const url = new URL(window.location.href)
    if (url.searchParams.get('mode') !== this.adMode) {
      url.searchParams.set('mode', this.adMode)
      window.history.replaceState(null, '', url)
    }
  }

  private updateZapDelay(input: HTMLInputElement, normalize: boolean): void {
    const seconds = Number(input.value)
    this.zapDelaySeconds = input.value !== '' && Number.isFinite(seconds)
      ? Math.min(99, Math.max(0, Math.trunc(seconds)))
      : 0
    if (normalize) input.value = String(this.zapDelaySeconds)
    const url = new URL(window.location.href)
    url.searchParams.set('zapDelay', String(this.zapDelaySeconds))
    window.history.replaceState(null, '', url)
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  }

}
