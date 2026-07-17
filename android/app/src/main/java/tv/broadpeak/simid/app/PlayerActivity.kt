package tv.broadpeak.simid.app

import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.ui.PlayerView
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerNotificationManager
import tv.broadpeak.simid.controller.CreativeData
import tv.broadpeak.simid.controller.MediaState
import tv.broadpeak.simid.controller.Dimensions
import tv.broadpeak.smartlib.SmartLib
import tv.broadpeak.smartlib.ad.AdBreakData
import tv.broadpeak.smartlib.ad.AdData
import tv.broadpeak.smartlib.ad.AdManager
import tv.broadpeak.smartlib.ad.simid.GenericSimidControllerApi
import tv.broadpeak.smartlib.session.streaming.StreamingSession
import tv.broadpeak.smartlib.session.streaming.StreamingSessionOptions
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.URL

// Create a class that extends GenericSimidControllerApi
class BpkSimidController : GenericSimidControllerApi() {
    override fun getSimidControllerName(): String {
        return "Bpk SIMID Controller"
    }
}

class PlayerActivity : AppCompatActivity() {

    private var playerContainer: ViewGroup? = null
    private var playerView: PlayerView? = null

    private var player: ExoPlayer? = null

    private var session: StreamingSession? = null

    private var adDatas: MutableMap<String, AdData>  = mutableMapOf()
    private var simidControllers: MutableMap<String, SimidController>  = mutableMapOf()
    private var simidWebViews: MutableMap<String, WebView>  = mutableMapOf()

    // Ads for which onAdBegin fired before their SimidController finished loading
    // (can happen for OOBA/pause ads, whose onPrepareAd -> onAdBegin sequence can be
    // near-instantaneous, racing with the runOnUiThread-deferred loadSimid() call).
    private var pendingAdStarts: MutableSet<String> = mutableSetOf()

    private var bpkSimidController: BpkSimidController? = null

    // Global flag to control animation usage
    private var useAnimations: Boolean = true

    // Pause ad state
    private var activePauseAdBreak: AdBreakData? = null
    private var activePauseAdId: String? = null
    private var pauseAdTimerHandler: Handler = Handler(Looper.getMainLooper())
    private var pauseAdTimerRunnable: Runnable? = null

    private var adTypeCat: String = "aspect-full"

    private var contentMetadata: MutableMap<String, String> = mutableMapOf(
        "contentPosterUrl" to "https://io-fsly.cdn.rmcplus.fr/imagescaler002/rmcbfm/production/assets/1020933732470_9C860Fb/posters/e6bc41a1067de0b06d41cdaa066cc0d8/e6bc41a1067de0b06d41cdaa066cc0d8.jpg",
        "contentTitle" to "Les reines du volant, saison 2 épisode 2"
    )

    companion object {
        private const val TAG = "Player"

        private const val ANIMATION_DURATION_MS = 300L
        private const val PAUSE_AD_DEBOUNCE_MS = 2000L
        private const val PAUSE_AD_ELEVATION = 20f
    }

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_player)

        playerContainer = findViewById(R.id.playerContainer)
        playerView = findViewById(R.id.playerView)

        val b = intent.extras
        val inputUrl = b?.getString("url") ?: return

        player = ExoPlayer.Builder(this).build()

        player!!.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                error.printStackTrace()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // React to pause/play events to show/hide pause ads.
                // Ignore transient pauses caused by buffering/seeking: only a pause while
                // the player is READY is considered a genuine user/content pause.
                if (isPlaying) {
                    onVideoPlay()
                } else if (player?.playbackState == Player.STATE_READY) {
                    onVideoPaused()
                }
            }
        })

        // Attach player to the view
        playerView?.player = player

        initSmartLib(inputUrl)
        loadStream(inputUrl)

        val creativeUrl = b.getString("creativeUrl")
        if (creativeUrl == null) {
            findViewById<View>(R.id.buttonStartCreative).visibility = View.GONE
        } else {
            findViewById<View>(R.id.buttonStartCreative).setOnClickListener {
                startCreative()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        pauseAdTimerRunnable?.let { pauseAdTimerHandler.removeCallbacks(it) }
        pauseAdTimerRunnable = null
        simidControllers.forEach { (key, controller) ->  controller.reset() }
        simidControllers.clear()
        player?.stop()
        SmartLib.getInstance().release();
    }

    @OptIn(UnstableApi::class)
    private fun loadStream(url: String) {
        val result = session!!.getURL(url)

        val streamUrl = if (result != null && !result.isError) result.url else url

        player?.let { sPlayer ->

            val item = MediaItem.Builder()
                .setUri(streamUrl.toUri())
                .build()

            // Create the source
            val dataSourceFactory: DataSource.Factory = DefaultDataSource.Factory(this)
            val source: MediaSource = if (streamUrl.contains("m3u8")) {
                HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            } else {
                DashMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            }

            sPlayer.setMediaSource(source)
            sPlayer.prepare()
            sPlayer.playWhenReady = true
        }
    }

    private fun startCreative() {
        val b = intent.extras
        val creativeUrl = b?.getString("creativeUrl") ?: return
        val creativeAdParams = b.getString("creativeAdParams") ?: ""
        val creativeClickThruUrl = b.getString("creativeClickThruUrl") ?: ""
        val creativeDuration = b.getInt("creativeDuration")
        loadSimid("input-creative", creativeUrl, creativeAdParams, creativeClickThruUrl, creativeDuration.toFloat(), true)
    }

    private fun initSmartLib(url: String) {
        val domain = URL(url).host

        SmartLib.getInstance().init(this, "", "", domain);

        session = SmartLib.getInstance().createStreamingSession()
        session?.let { sSession ->
            // Disable automatic sending of nonlinear ad trackers: for pause ads we want to
            // fire impression/creativeView trackers only once the SIMID overlay is actually shown.
            sSession.setOption(StreamingSessionOptions.AD_TRACKERS_NON_LINEAR_AUTO_SEND, false)

            sSession.activateAdvertising()

            sSession.setAdDataListener(object : AdManager.AdDataListener {
                override fun onAdData(adData: ArrayList<AdBreakData>) {
                    Log.d(TAG, "onAdData: $adData")
                }

                override fun onOutOfBandAdData(adData: ArrayList<AdBreakData>) {
                    Log.d(TAG, "onOutOfBandAdData: $adData")
                }
            })

            sSession.setAdEventsListener(object : AdManager.AdEventsListener {
                override fun onPrepareAdBreak(adBreak: AdBreakData) {
                    Log.d(TAG, "onPrepareAdBreak: ${adBreak.id}")
                }

                override fun onAdBreakBegin(adBreakData: AdBreakData) {
                    Log.d(TAG, "onAdBreakBegin: ${adBreakData.id} ${adBreakData.startPosition} ${adBreakData.duration} ${adBreakData.ads.size}")

                    // Keep track of the active pause ad break
                    if (adBreakData.ooba != null && adBreakData.ooba.name == "pause") {
                        Log.d(TAG, "Pause ad break detected")
                        activePauseAdBreak = adBreakData
                        activePauseAdId = adBreakData.ads.firstOrNull()?.adId
                    }
                }

                override fun onPrepareAd(adData: AdData, adBreakData: AdBreakData) {
                    Log.d(TAG, "onAdPrepare: ${adData.adId}")

                    adDatas[adData.adId] = adData
                    if (adData.nonLinearIframeResources?.size!! > 0) {
                        runOnUiThread {
                            val iframeResource = adData.nonLinearIframeResources[0].url
                            val adParameters = injectContentMetadata(adData.nonLinearIframeResources[0].parameters)
                            val clickThruUrl = adData.clickURL
                            loadSimid(adData.adId, iframeResource, adParameters, clickThruUrl, (adData.duration.toFloat() / 1000.0F))
                        }
                    }
                }

                override fun onAdBegin(adData: AdData, adBreakData: AdBreakData) {
                    Log.d(TAG, "onAdBegin: ${adData.adId} ${adData.startPosition} ${adData.duration} ${adData.index}/${adBreakData.ads.size}")

                    val simidController = simidControllers[adData.adId]
                    if (simidController != null) {
                        runOnUiThread {
                            simidController.start()
                        }
                    } else if (adData.nonLinearIframeResources?.size ?: 0 > 0) {
                        // loadSimid() hasn't run yet (it's deferred to the UI thread from
                        // onPrepareAd) - remember to start the creative as soon as it is loaded.
                        Log.d(TAG, "SIMID controller not ready yet for ${adData.adId}, deferring start")
                        pendingAdStarts.add(adData.adId)
                    }
                }

                override fun onAdSkippable(adData: AdData, adBreakData: AdBreakData, adSkippablePosition: Long, adEndPosition: Long, adBreakEndPosition: Long) {
                    Log.d(TAG, "onAdSkippable: $adSkippablePosition $adEndPosition $adBreakEndPosition")
                }

                override fun onAdEnd(adData: AdData, adBreakData: AdBreakData) {
                    Log.d(TAG, "onAdEnd: ${adData.adId}")
                    val simidController = simidControllers[adData.adId]
                    if (simidController != null) {
                        simidController.reset()
                        simidControllers.remove(adData.adId)
                        removeWebView(adData.adId)
                    }
                    adDatas.remove(adData.adId)
                }

                override fun onAdBreakEnd(adBreakData: AdBreakData) {
                    Log.d(TAG, "onAdBreakEnd: ${adBreakData.id}")
                }
            })

            bpkSimidController = BpkSimidController()

            sSession.attachPlayer(player!!)

            // Attach bpkSimidController to the session
            sSession.attachSimidController(bpkSimidController)
        }
    }

    private fun loadSimid(adId: String, creativeUri: String, adParameters: String, clickThruUrl: String, duration: Float, autoStart: Boolean = false) {

        if (playerContainer == null) {
            return
        }

        // Consider player container dimensions as initial creative dimensions
        val playerDimensions: Dimensions = Dimensions(playerContainer!!.left, playerContainer!!.top, playerContainer!!.width, playerContainer!!.height)

        Log.d(TAG, "Load SIMID: ${playerDimensions.toString()} $creativeUri $duration")

        val creativeData = CreativeData(adParameters, clickThruUrl)
        val simidController = SimidController(this, applicationContext, playerDimensions, playerDimensions, creativeUri, creativeData, duration)

        simidController.let { controller ->
            controller.onAddSimid { webView -> addSimidWebView(adId, webView) }
            controller.onShowSimid { show -> showSimidWebView(adId, show) }
            controller.onResizeSimid { dimensions -> resizeSimid(adId, dimensions) }
            controller.onResizePlayer { dimensions -> resizePlayer(dimensions) }
            controller.onGetMediaState { getMediaState() }
            controller.onPauseMedia { pauseMedia() }
            controller.onPlayMedia { playMedia() }
            controller.onOpenPage { uri -> openPage(uri) }
            controller.onComplete { skipped -> completeAd(adId, skipped) }

            controller.simidControllerApi(bpkSimidController!!)

            Log.d(TAG, "Load SIMID controller v${controller.getVersion()} and creative from $creativeUri")
            controller.load(autoStart)

            simidControllers[adId] = controller

            // If onAdBegin already fired for this ad before we got here (race between the
            // ad-events thread and this UI-thread-deferred load), start the creative now.
            if (pendingAdStarts.remove(adId)) {
                Log.d(TAG, "Starting deferred SIMID creative for $adId")
                controller.start()
            }
        }
    }

    private fun getMediaState(): MediaState {
        return MediaState(
            "",
            player?.currentPosition!!.toFloat() / 1000.0F,
            player?.duration!!.toFloat() / 1000.0F,
            false,
            player?.isDeviceMuted,
            player?.isPlaying == false,
            player?.volume,
            true
        )
    }

    private fun addSimidWebView(adId: String, webView: WebView): Boolean {
        simidWebViews[adId] = webView
        playerContainer?.addView(webView)
        return true
    }

    private fun removeWebView(adId: String) {
        val webView = simidWebViews[adId]
        webView?.let {
            runOnUiThread {
                playerContainer?.removeView(webView)
            }
        }
    }

    private fun showSimidWebView(adId: String, show: Boolean) {
        val webView = simidWebViews[adId]
        webView?.let {
            runOnUiThread {
                // ensure the pause ad is on top of any other nonlinear ad
                if (activePauseAdId != null) {
                    webView.elevation = PAUSE_AD_ELEVATION
                    webView.bringToFront()
                }
                webView.visibility = if (show) View.VISIBLE else View.GONE
            }
            // trigger trackers
            if (show) {
                session?.sendTracker("impression", adId)
                session?.sendTracker("creativeView", adId)
            }
        }
    }

    private fun resizeSimid(adId: String, dimensions: Dimensions): Boolean {
        Log.d(TAG, "Resize SIMID: ${dimensions.toString()}")

        val webView = simidWebViews[adId] ?: return false

        // Check if requested SIMID dimensions is not outside original player dimensions
        val playerRect = Rect(playerContainer!!.left, playerContainer!!.top, playerContainer!!.width, playerContainer!!.height)
        val widthFits = dimensions.x + dimensions.width <= playerRect.width()
        val heightFits = dimensions.y + dimensions.height <= playerRect.height()
        if (!widthFits || !heightFits) {
            return false;
        }

        resizeView(webView, dimensions, false)
        return true
    }

    private fun resizePlayer(dimensions: Dimensions): Boolean {
        Log.d(TAG, "Resize player: ${dimensions.toString()}")
        val playerView = playerView ?: return false
        resizeView(playerView, dimensions, useAnimations)
        return true
    }

    private fun resizeView(view: View, dimensions: Dimensions, animate: Boolean) {
        runOnUiThread {
            if (!animate) {
                // Instant resize without animation
                (view.layoutParams as ViewGroup.MarginLayoutParams).apply {
                    leftMargin = dimensions.x
                    topMargin = dimensions.y
                    width = dimensions.width
                    height = dimensions.height
                }
                view.requestLayout()
            } else {
                // Animated resize
                val from = Rect(view.left, view.top, view.width, view.height)

                ValueAnimator.ofFloat(0f, 1f).apply {
                    this.duration = ANIMATION_DURATION_MS
                    this.interpolator = AccelerateDecelerateInterpolator()
                    addUpdateListener { va ->
                        val f = va.animatedFraction
                        (view.layoutParams as ViewGroup.MarginLayoutParams).apply {
                            leftMargin = (from.left + (dimensions.x - from.left) * f).toInt()
                            topMargin = (from.top + (dimensions.y - from.top) * f).toInt()
                            width = (from.width() + (dimensions.width - from.width()) * f).toInt()
                            height = (from.height() + (dimensions.height - from.height()) * f).toInt()
                        }
                        view.requestLayout()
                    }
                }.start()
            }
        }
    }

    private fun pauseMedia(): Boolean {
        Log.d(TAG, "Pause media")
        runOnUiThread {
            player?.pause()
        }
        return true
    }

    private fun playMedia(): Boolean {
        Log.d(TAG, "Play media")

        endPauseAd()

        runOnUiThread {
            player?.play()
        }
        return true
    }

    private fun openPage(uri: String) {
        Log.d(TAG, "Open page: $uri")

        val intent = Intent(Intent.ACTION_VIEW, uri.toUri())
        startActivity(intent)
    }

    private fun completeAd(adId: String, skipped: Boolean) {
        Log.d(TAG, "Complete ad $adId, skipped: $skipped")
        val adData = adDatas[adId]
        if (skipped && adData != null) {
            skipCurrentAd(adData)
        }
    }

    private fun skipCurrentAd(adData: AdData) {
        runOnUiThread {
            player!!.seekTo(adData.startPosition + adData.duration)
        }
    }

    private fun injectContentMetadata(adParameters: String): String {
        val params = try {
            JSONObject(adParameters)
        } catch (e: Exception) {
            // adParameters was not valid JSON — start from empty object
            JSONObject()
        }
        contentMetadata.forEach { (key, value) -> params.put(key, value) }
        params.put("durationRemaining", getRemainingDuration())
        return params.toString()
    }

    private fun getRemainingDuration(): String {
        val duration = player?.duration ?: return "..."
        if (duration <= 0) return "..."
        val remaining = maxOf(0L, duration - (player?.currentPosition ?: 0L)) / 1000
        return if (remaining < 60) "< 1 min" else "${remaining / 60} min"
    }

    fun setAdTypeCat(cat: String) {
        adTypeCat = cat
    }

    fun getContentMetadata(): Map<String, String> {
        return contentMetadata.toMap()
    }

    fun setContentMetadata(metadata: Map<String, String>) {
        contentMetadata = metadata.toMutableMap()
    }

    private fun onVideoPaused() {
        Log.d(TAG, "Video paused")
        pauseAdTimerRunnable?.let { pauseAdTimerHandler.removeCallbacks(it) }
        pauseAdTimerRunnable = Runnable {
            pauseAdTimerRunnable = null
            Log.d(TAG, "Request pause ads")
            session?.requestOutOfBandAds("pause", 0f, true, mapOf("cat" to adTypeCat))
        }
        pauseAdTimerHandler.postDelayed(pauseAdTimerRunnable!!, PAUSE_AD_DEBOUNCE_MS)
    }

    private fun onVideoPlay() {
        Log.d(TAG, "Video play event")
        pauseAdTimerRunnable?.let { pauseAdTimerHandler.removeCallbacks(it) }
        pauseAdTimerRunnable = null
        endPauseAd()
    }

    private fun endPauseAd() {
        Log.d(TAG, "Hide pause ad")
        activePauseAdBreak?.let { adBreakData ->
            Log.d(TAG, "Pause ad break found, removing it")
            session?.endOutOfBandAdBreak(adBreakData.id)
            activePauseAdBreak = null
            activePauseAdId = null
        }
    }
}
