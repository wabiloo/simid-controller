# SIMID SDKs

This repository provides an SDK with reference implementations for base SIMID controllers, for the following platforms:

- [Web](web/controller/README.md)
- [Android](android/controller/README.md)
- [iOS](ios/SimidController/README.md)

SIMID controllers are required in video player applications, to load and play SIMID ad creatives. Its primary role is to communicate with the SIMID creatives through the SIMID protocol.

## Sample applications

This SDK also provides sample applications to illustrate the integration and use of such SIMID controllers. Those are designed to be used within Broadpeak Click2 scenarios, in which:
- the Broadpeak Dynamic Ad Insertion (DAI) solution gets ads from the ad server, and originates ABR streams (HLS or DASH)
- the Broadpeak SmartLib SDK communicates with the Broadpeak DAI solution to acquire information about the ad break timings and creatives to load
- The SmartLib SDK notifies the application accordingly.


## Ad config

Aims:
- To avoid having to use my demo stack
  - But how possible would it be to serve clickable ones then?
- To have a single FADS endpoint that works for both on-zap and pre-roll use cases
- To have a single service per channel for on-zap and pre-roll

Config:
- Pre-roll on service, but QP passed to it ensures no ad returned when on-zap (eg. max-ads=0)
- On-zap uses Pause Ad service (bk-ooba=pause), but with additional QP to distinguish it from (actual) pause
  - FADS router to redirect to different collection
