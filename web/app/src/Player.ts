import { CreativeData, MediaState } from '@broadpeak-tv/simid-controller'
import { SmartLib, StreamingSessionOptions } from '@broadpeak/smartlib'
import '@broadpeak/smartlib-ad'
import '@broadpeak/smartlib-analytics'
import '@broadpeak/smartlib-bitmovin'
import { GenericSimidControllerApi } from '@broadpeak/smartlib-simid'
import SimidController from './SimidController'

declare const bitmovin: any

export default class Player {

  private playerContainer: HTMLElement
  private playerElement: HTMLElement

  private player: any // BitmovinPlayer

  private smartlibSession?: any /* StreamingSession */
  private adDatas: Map<string, any> = new Map<string, any>()
  private simidControllers: Map<string, SimidController> = new Map<string, SimidController>()
  private simidIframes: Map<string, HTMLIFrameElement> = new Map<string, HTMLIFrameElement>()
  private bpkSimidController: any /* GenericSimidControllerApi */

  private activePauseAdBreak?: any /* AdBreakData */
  private activePauseAdId?: string
  private pauseAdTimer?: number

  private adTypeCat: string = 'aspect-full'

  private contentMetadata: Record<string, string> = {
    contentPosterUrl: 'https://io-fsly.cdn.rmcplus.fr/imagescaler002/rmcbfm/production/assets/1020933732470_9C860Fb/posters/e6bc41a1067de0b06d41cdaa066cc0d8/e6bc41a1067de0b06d41cdaa066cc0d8.jpg',
    contentTitle: 'Les reines du volant, saison 2 épisode 2'
  }

  constructor(playerContainer: HTMLElement, playerElement: HTMLElement) {
    this.playerContainer = playerContainer
    this.playerElement = playerElement

    SmartLib.getInstance().init('', '', '*')

    this.loadPlayer()
  }

  public async load(url: string) {

    await this.stop()

    // Create SmartLib session
    this.smartlibSession = SmartLib.getInstance().createStreamingSession()
    this.smartlibSession.setOption(StreamingSessionOptions.AD_TRACKERS_NON_LINEAR_AUTO_SEND, false)
    this.setAdDataListeners(this.smartlibSession)
    this.setAdEventsListeners(this.smartlibSession)

    this.bpkSimidController = new GenericSimidControllerApi()

    // Attach player to smartlib session
    this.smartlibSession.attachPlayer(this.player)

    // Attach bpkSimidController to the session
    this.smartlibSession.attachSimidController(this.bpkSimidController)

    const result = await this.smartlibSession.getURL(url)

    const playUrl = result.url || url
    const source: any = playUrl.includes('.m3u8') ? { hls: playUrl } : { dash: playUrl }

    await this.player.load(source)
    this.player.play()
  }

  public async stop() {
    this.simidControllers.forEach(controller => controller.reset())
    this.smartlibSession?.stopStreamingSession()
    await this.player.unload()
  }

  private injectContentMetadata(adParameters: string): string {
    let params: Record<string, any> = {}
    try {
      params = JSON.parse(adParameters)
    } catch {
      // adParameters was not valid JSON — start from empty object
    }
    Object.assign(params, this.contentMetadata)
    params.durationRemaining = this.getRemainingDuration()
    return JSON.stringify(params)
  }

  private getRemainingDuration(): string {
    const duration = this.player.getDuration()
    if (!duration || !isFinite(duration) || isNaN(duration)) return '...'
    const remaining = Math.max(0, duration - this.player.getCurrentTime())
    if (remaining < 60) return '< 1 min'
    return `${Math.floor(remaining / 60)} min`
  }

  public loadSimid(adId: string, creativeUri: string, adParameters: string, clickThruUrl: string, duration: number, autoStart = false) {

    // Consider player container dimensions as initial creative dimensions
    const playerRect: DOMRect = this.getElementDimensions(this.playerContainer)

    console.log(`[Player] Load SIMID - uri:${creativeUri} duration:${duration}`)
    const creativeData: CreativeData = {
      adParameters,
      clickThruUrl
    }
    const simidController = new SimidController(playerRect, playerRect, creativeUri, creativeData, duration, false, -1)

    simidController.onGetMediaState = () => this.getMediaState()
    simidController.onAddSimid = (iframe: HTMLIFrameElement) => this.addSimidIframe(adId, iframe)
    simidController.onShowSimid = (show: boolean) => this.showSimidIframe(adId, show)
    simidController.onResizeSimid = (dimensions: DOMRect) => this.resizeSimid(adId, dimensions)
    simidController.onResizePlayer = (dimensions: DOMRect) => this.resizePlayer(dimensions)
    simidController.onPauseMedia = () => this.pauseMedia()
    simidController.onPlayMedia = () => this.playMedia()
    simidController.onOpenPage = (uri: string) => this.openPage(uri)
    simidController.onComplete = (skipped: boolean) => this.completeAd(adId, skipped)

    simidController.simidControllerApi = this.bpkSimidController

    console.log(`[Player] Load SIMID controller v${simidController.getVersion()}`)
    simidController.load(autoStart)

    this.simidControllers.set(adId, simidController)
  }

  public setAdTypeCat(cat: string): void {
    this.adTypeCat = cat
  }

  public getContentMetadata(): Record<string, string> {
    return { ...this.contentMetadata }
  }

  public setContentMetadata(metadata: Record<string, string>): void {
    this.contentMetadata = metadata
  }

  public handleResize() {
    const playerRect: DOMRect = this.getElementDimensions(this.playerContainer)
    console.log('[Player] Notify resize SIMID:', playerRect)
    this.simidControllers.forEach(controller => controller.notifyResize(playerRect, playerRect, false))
  }

  private loadPlayer() {
    const playerConfig = {
      key: '8ccd9a07-2076-4d36-b8e6-40c412fc90ba',
      style: {
        uiManagerFactory: (playerAPI: any, config: any) =>
          bitmovin.playerui.UIFactory.buildUI(playerAPI, config)
      },
      playback: {
        muted: true,
        autoplay: false
      }
    }

    this.player = new bitmovin.player.Player(this.playerElement, playerConfig)

    // React to pause events to show pause ads
    this.player.on(bitmovin.player.PlayerEvent.Paused, () => this.onVideoPaused())
    // React to play events to hide pause ads
    this.player.on(bitmovin.player.PlayerEvent.Playing, () => this.onVideoPlay())
  }

  private setAdDataListeners(session: any/*: SmartLib.Session*/) {
    session.setAdDataListener({
      onAdData: (adData: any) => {
        console.log('[Player] onAdData:', adData)
      },

      onOutOfBandAdData: (adData: any) => {
        console.log('[Player] onOutOfBandAdData:', adData)
      }
    })
  }

  private setAdEventsListeners(session: any/*: SmartLib.Session*/) {
    session.activateAdvertising()
    session.setAdEventsListener({
        onPrepareAdBreak: (adBreakData: any) => {
            console.log('[Player] onPrepareAdBreak:', adBreakData)
        },
        onAdBreakBegin: (adBreakData: any) => {
          console.log('[Player] onAdBreakBegin:', adBreakData)

          // Keep track of the active pause ad break
          if (adBreakData.ooba && adBreakData.ooba.name === 'pause') {
            console.log('[Player] Pause ad break detected')
            this.activePauseAdBreak = adBreakData
            this.activePauseAdId = adBreakData.ads[0]?.adId
          }
        },
        onPrepareAd: (adData: any, adBreakData: any) => {
          console.log('[Player] onPrepareAd:', adData)
          this.adDatas.set(adData.adId, adData)
          if (adData.nonLinearIframeResources && adData.nonLinearIframeResources.length) {
            const iframeResource = adData.nonLinearIframeResources[0]
            const adParameters = this.injectContentMetadata(iframeResource.parameters)
            const duration = adData.duration ? (adData.duration / 1000) : 0
            this.loadSimid(adData.adId, iframeResource.url, adParameters, adData.clickURL, duration)
          }
        },
        onAdBegin: (adData: any, adBreakData: any) => {
          console.log('[Player] onAdBegin:', adData)
          const simidController = this.simidControllers.get(adData.adId)
          if (simidController) {
            simidController.start()
          }
        },
        onAdSkippable: (adData: any, adBreakData: any, adSkippablePosition: any, adEndPosition: any, adBreakEndPosition: any) => {
          console.log('[Player] onAdSkippable:', adData)
        },
        onAdEnd: (adData: any, adBreakData: any) => {
          console.log('[Player] onAdEnd:', adData)
          const simidController = this.simidControllers.get(adData.adId)
          if (simidController) {
            simidController.reset()
            this.simidControllers.delete(adData.adId)
          }
          this.adDatas.delete(adData.adId)
        },
        onAdBreakEnd: (adBreakData: any) => {
          console.log('[Player] onAdBreakEnd:', adBreakData)
        }
    })
  }

  private getMediaState(): MediaState {
    return {
      currentTime: this.player.getCurrentTime()
    }
  }

  private addSimidIframe(adId: string, iframe: HTMLIFrameElement): boolean {
    this.playerContainer.appendChild(iframe)
    this.simidIframes.set(adId, iframe)
    return true
  }

  private showSimidIframe(adId: string, show: boolean) {
    const simidIframe = this.simidIframes.get(adId)
    if (!simidIframe) {
      return
    }
    // ensure the pause ad is on top of any other nonlinear ad
    if (this.activePauseAdId) {
      simidIframe.style.zIndex = '20'
    }
    simidIframe.style.display = show ? 'block' : 'none'

    // trigger trackers
    if (show) {
      this.smartlibSession?.sendTracker('impression', adId)
      this.smartlibSession?.sendTracker('creativeView', adId)
    }
  }

  private resizeSimid(adId: string, dimensions: DOMRect): boolean {
    const simidIframe = this.simidIframes.get(adId)
    if (!simidIframe) {
      return false
    }
    console.log('[Player] Resize SIMID:', dimensions)

    // Check if requested SIMID dimensions is not outside original player container dimensions
    const playerRect: DOMRect = this.getElementDimensions(this.playerContainer)

    const widthFits = dimensions.x + dimensions.width <= Math.ceil(playerRect.width)
    const heightFits = dimensions.y + dimensions.height <= Math.ceil(playerRect.height)
    if (!widthFits || !heightFits) {
      return false;
    }

    this.setElementDimensions(simidIframe, dimensions)
    return true
  }

  private resizePlayer(dimensions: DOMRect) {
    console.log('[Player] Resize player:', dimensions)
    this.setElementDimensions(this.playerElement, dimensions)
  }

  private pauseMedia(): boolean {
    console.log('[Player] Pause media')
    this.player.pause()
    return true
  }

  private playMedia(): boolean {
    console.log('[Player] Play media')

    this.endPauseAd()

    this.player.play()
    return true
  }

  private openPage(uri: string) {
    console.log('[Player] Open page:', uri)
    window.open(uri, '_blank')
  }

  private completeAd(adId: string, skipped: boolean) {
    console.log('[Player] Complete ad, skipped:', skipped)
    const adData = this.adDatas.get(adId)
    if (skipped && adData) {
      this.skipCurrentAd(adData)
    }
  }

  private getElementDimensions(element: HTMLElement): DOMRect {
    const containerRect = this.playerContainer.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    elementRect.x -= containerRect.x
    elementRect.y -= containerRect.y
    return elementRect
  }

  private setElementDimensions(element: HTMLElement, dimensions: DOMRect) {
    console.log(`[Player] Resize ${element.id} x:${dimensions.x} y:${dimensions.y} w:${dimensions.width} h:${dimensions.height}`)
    const containerRect = this.playerContainer.getBoundingClientRect()
    element.style.height =  (dimensions.height * 100 / containerRect.height).toFixed(2) + '%'
    element.style.width = (dimensions.width * 100 / containerRect.width).toFixed(2) + '%'
    element.style.left = (dimensions.x * 100 / containerRect.width).toFixed(2) + '%'
    element.style.top = (dimensions.y * 100 / containerRect.height).toFixed(2) + '%'
  }

  private skipCurrentAd(adData: any) {
    if (!adData) {
      return
    }
    this.player.seek((adData.startPosition + adData.duration) / 1000)
  }

  private onVideoPaused(): void {
    console.log('[Player] Video paused')
    this.pauseAdTimer = window.setTimeout(() => {
      this.pauseAdTimer = undefined
      if (this.smartlibSession) {
        console.log('[Player] Request pause ads')
        this.smartlibSession.requestOutOfBandAds('pause', 0, true, { cat: this.adTypeCat })
      }
    }, 2000)
  }

  private onVideoPlay(): void {
    console.log('[Player] Video play event')
    window.clearTimeout(this.pauseAdTimer)
    this.pauseAdTimer = undefined
    this.endPauseAd()
  }

  private endPauseAd(): void {
    console.log('[Player] Hide pause ad')
    if (this.activePauseAdBreak) {
      console.log('[Player] Pause ad break found, removing it')
      this.smartlibSession?.endOutOfBandAdBreak(this.activePauseAdBreak.id)
      this.activePauseAdBreak = undefined
      this.activePauseAdId = undefined
    }
  }
}