import { CreativeData, MediaState, SimidController } from '@broadpeak-tv/simid-controller'
import { SmartLib, StreamingSessionOptions } from '@broadpeak/smartlib'
import '@broadpeak/smartlib-ad'
import '@broadpeak/smartlib-bitmovin'
import '@broadpeak/smartlib-analytics'
import { GenericSimidControllerApi } from '@broadpeak/smartlib-simid'

declare const bitmovin: any

class SimidControllerAdapter extends GenericSimidControllerApi {
  getSimidControllerName(): String {
    return 'SimidController'
  }
}

export default class Player {
  private playerContainer: HTMLElement
  private playerElement: HTMLElement
  private player: any
  private smartlibSession?: any
  private adDatas: Map<string, any> = new Map()
  private simidControllers: Map<string, SimidController> = new Map()
  private simidIframes: Map<string, HTMLIFrameElement> = new Map()
  private trackedAdIds: Set<string> = new Set()
  private controllerAdapter?: SimidControllerAdapter
  private generation = 0
  private transition: Promise<void> = Promise.resolve()
  private onAppKey: (key: string) => void

  constructor(playerContainer: HTMLElement, playerElement: HTMLElement, onAppKey: (key: string) => void) {
    this.playerContainer = playerContainer
    this.playerElement = playerElement
    this.onAppKey = onAppKey
    SmartLib.getInstance().init('', '', '*')
    this.loadPlayer()
  }

  public async load(url: string): Promise<void> {
    const generation = ++this.generation
    const transition = this.transition.catch(() => undefined).then(async () => {
      if (this.player) await this.player.unload()
      this.disposeSession()
      if (generation !== this.generation) return

      const session = SmartLib.getInstance().createStreamingSession()
      session.setOption(StreamingSessionOptions.AD_TRACKERS_NON_LINEAR_AUTO_SEND, false)
      this.smartlibSession = session
      this.controllerAdapter = new SimidControllerAdapter()
      session.attachPlayer(this.player)
      session.attachSimidController(this.controllerAdapter)
      this.setAdEventsListeners(session, generation)

      const result = await session.getURL(url)
      if (generation !== this.generation) return
      const playUrl = result.url || url
      const source = playUrl.toLowerCase().includes('.m3u8') ? { hls: playUrl } : { dash: playUrl }
      await this.player.load(source)
      if (generation !== this.generation) return
      try {
        await this.player.play()
      } catch {
        this.player.mute()
        await this.player.play()
      }
    })
    this.transition = transition
    await transition
  }

  public async stop(): Promise<void> {
    ++this.generation
    const transition = this.transition.catch(() => undefined).then(() => this.stopCurrentStream())
    this.transition = transition
    await transition
  }

  public handleResize(): void {
    const rect = this.getElementDimensions(this.playerContainer)
    this.simidControllers.forEach(controller => controller.notifyResize(rect, rect, false))
  }

  private async stopCurrentStream(): Promise<void> {
    this.disposeSession()
    if (this.player) await this.player.unload()
  }

  private disposeSession(): void {
    this.simidControllers.forEach((controller, adId) => {
      controller.reset()
      this.simidIframes.get(adId)?.remove()
    })
    this.simidControllers.clear()
    this.simidIframes.forEach(iframe => iframe.remove())
    this.simidIframes.clear()
    this.adDatas.clear()
    this.trackedAdIds.clear()
    this.smartlibSession?.stopStreamingSession()
    this.smartlibSession = undefined
    this.controllerAdapter = undefined
  }

  private loadPlayer(): void {
    const playerConfig = {
      key: '8ccd9a07-2076-4d36-b8e6-40c412fc90ba',
      style: { uiManagerFactory: (playerAPI: any, config: any) => bitmovin.playerui.UIFactory.buildUI(playerAPI, config) },
      playback: { muted: true, autoplay: false }
    }
    this.player = new bitmovin.player.Player(this.playerElement, playerConfig)
    const playerErrorEvent = bitmovin.player.PlayerEvent?.Error
    if (playerErrorEvent) {
      this.player.on(playerErrorEvent, (event: any) => {
        const error = event?.message || event?.data?.message || 'Player error'
        console.error('[Player] Playback error:', error)
      })
    }
  }

  private setAdEventsListeners(session: any, generation: number): void {
    session.activateAdvertising()
    session.setAdDataListener({
      onAdData: (adData: any) => console.log('[Player] onAdData:', adData),
      onOutOfBandAdData: (adData: any) => console.log('[Player] onOutOfBandAdData:', adData)
    })
    session.setAdEventsListener({
      onPrepareAdBreak: (adBreakData: any) => console.log('[Player] onPrepareAdBreak:', adBreakData),
      onAdBreakBegin: (adBreakData: any) => console.log('[Player] onAdBreakBegin:', adBreakData),
      onPrepareAd: (adData: any) => {
        if (generation !== this.generation) return
        this.adDatas.set(adData.adId, adData)
        if (adData.type?.toLowerCase?.() === 'nonlinear') this.trackedAdIds.add(adData.adId)
        const resource = adData.nonLinearIframeResources?.[0]
        if (!resource) return
        const duration = adData.duration ? adData.duration / 1000 : 0
        this.loadSimid(adData.adId, resource.url, resource.parameters, resource.clickURL, duration)
      },
      onAdBegin: (adData: any) => {
        if (generation === this.generation) this.simidControllers.get(adData.adId)?.start()
      },
      onAdSkippable: (adData: any) => console.log('[Player] onAdSkippable:', adData.adId),
      onAdEnd: (adData: any) => {
        if (generation !== this.generation) return
        const controller = this.simidControllers.get(adData.adId)
        controller?.reset()
        this.simidControllers.delete(adData.adId)
        this.simidIframes.get(adData.adId)?.remove()
        this.simidIframes.delete(adData.adId)
        this.adDatas.delete(adData.adId)
      },
      onAdBreakEnd: (adBreakData: any) => console.log('[Player] onAdBreakEnd:', adBreakData)
    })
  }

  private loadSimid(adId: string, creativeUri: string, adParameters: string, clickThruUrl: string, duration: number): void {
    const rect = this.getElementDimensions(this.playerContainer)
    const creativeData: CreativeData = { adParameters, clickThruUrl }
    const controller = new SimidController(rect, rect, creativeUri, creativeData, duration, false, -1)
    controller.onMessageReceived = message => this.controllerAdapter?.onMessageReceived(message)
    controller.onMessageSent = message => this.controllerAdapter?.onMessageSent(message)
    controller.onGetMediaState = () => this.getMediaState()
    controller.onAddSimid = iframe => this.addSimidIframe(adId, iframe)
    controller.onShowSimid = show => this.showSimidIframe(adId, show)
    controller.onResizeSimid = dimensions => this.resizeSimid(adId, dimensions)
    controller.onResizePlayer = dimensions => this.resizePlayer(dimensions)
    controller.onPauseMedia = () => this.pauseMedia()
    controller.onPlayMedia = () => this.playMedia()
    controller.onOpenPage = uri => window.open(uri, '_blank')
    controller.onComplete = skipped => this.completeAd(adId, skipped)
    controller.onError = (messageType, errorCode, errorMessage) => console.error(`[SIMID] ${messageType}: ${errorCode} ${errorMessage}`)
    controller.onSendKeys = key => this.onAppKey(key)
    controller.load(false)
    this.simidControllers.set(adId, controller)
  }

  private getMediaState(): MediaState {
    return {
      currentSrc: this.player.getSource()?.url || this.player.getSource()?.dash || this.player.getSource()?.hls,
      currentTime: this.player.getCurrentTime(),
      duration: this.player.getDuration(),
      paused: this.player.isPaused?.() ?? false,
      muted: this.player.isMuted?.() ?? true,
      volume: this.player.getVolume?.() ?? 0,
      // This app uses CSS theater mode, not the browser Fullscreen API.
      fullscreen: false
    }
  }

  private addSimidIframe(adId: string, iframe: HTMLIFrameElement): boolean {
    iframe.classList.add('simid-creative')
    this.playerContainer.appendChild(iframe)
    this.simidIframes.set(adId, iframe)
    return true
  }

  private showSimidIframe(adId: string, show: boolean): void {
    const iframe = this.simidIframes.get(adId)
    if (!iframe) return
    iframe.style.display = show ? 'block' : 'none'
    if (show && this.trackedAdIds.has(adId)) {
      this.smartlibSession?.sendTracker('impression', adId)
      this.smartlibSession?.sendTracker('creativeView', adId)
    }
  }

  private resizeSimid(adId: string, dimensions: DOMRect): boolean {
    const iframe = this.simidIframes.get(adId)
    if (!iframe) return false
    const playerRect = this.getElementDimensions(this.playerContainer)
    if (dimensions.x + dimensions.width > Math.ceil(playerRect.width) || dimensions.y + dimensions.height > Math.ceil(playerRect.height)) return false
    this.setElementDimensions(iframe, dimensions)
    return true
  }

  private resizePlayer(dimensions: DOMRect): void {
    this.setElementDimensions(this.playerElement, dimensions)
  }

  private pauseMedia(): boolean {
    this.player.pause()
    return true
  }

  private playMedia(): boolean {
    this.player.play()
    return true
  }

  private completeAd(adId: string, skipped: boolean): void {
    const adData = this.adDatas.get(adId)
    if (skipped && adData) {
      const endPosition = adData.startPosition + adData.duration
      if (Number.isFinite(endPosition)) this.player.seek(endPosition / 1000)
    }
  }

  private getElementDimensions(element: HTMLElement): DOMRect {
    const containerRect = this.playerContainer.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    return new DOMRect(elementRect.x - containerRect.x, elementRect.y - containerRect.y, elementRect.width, elementRect.height)
  }

  private setElementDimensions(element: HTMLElement, dimensions: DOMRect): void {
    const containerRect = this.playerContainer.getBoundingClientRect()
    element.style.height = `${(dimensions.height * 100 / containerRect.height).toFixed(2)}%`
    element.style.width = `${(dimensions.width * 100 / containerRect.width).toFixed(2)}%`
    element.style.left = `${(dimensions.x * 100 / containerRect.width).toFixed(2)}%`
    element.style.top = `${(dimensions.y * 100 / containerRect.height).toFixed(2)}%`
  }
}
