# Breach 0.8.3 — audible music checks and discoverable campaign proposal

The 0.8.2 soundtrack was present, but its default fetch function was stored
and invoked as a BreachMusic method. Browsers rejected the receiver with
`Failed to execute fetch on Window: Illegal invocation`, silently preventing
in-game music downloads. The HTML audio listening room used a different path
and masked this gap in the earlier browser check. Bind the default fetch to
its global receiver; retain injectable fetchers for tests.

The entry conditions also made absence hard to diagnose. A first download could lose its encounter before decoding, then spend
two minutes of cooldown even though nothing had played. Start/Resume also only
resumed `suspended` AudioContexts, overlooking Safari's `interrupted` state.

- Prepare one likely mission cue during the silent opening after Start, when
  music and Sound are enabled. No menu preload and no automatic playback.
- Separate preparation from permission to play. A missed encounter can finish
  caching its cue, but cannot start late. Never-audible cancellation does not
  consume the playback cooldown. Played cues retain their full silence budget;
  failed encounter loads retain bounded retry behavior.
- Bound simultaneous preparations and decoded buffers to two each. Never
  preload the entire soundtrack. Context replacements reject stale work.
- Resume both suspended and interrupted contexts from existing user gestures.
  This handles the missing state; it is not proof against every iOS audio bug.
- Add an explicit eight-second Test music control in Settings. It uses the same
  Web Audio context, effects master and music volume as gameplay. It reports
  loading/failure, has a stop control, and is cancelled on settings close,
  resume, mute, backgrounding or navigation. It never changes saved settings or
  the mission cooldown. Check device volume/Silent Mode if even the test is quiet.
- Expose Soundtrack and Campaign Proposal links on the menu, label the proposal
  as planning, and show the precise 0.8.3 version on phones.

The campaign remains a design proposal. This patch does not introduce campaign
progress, new ending mechanics, or imply that chapter mode exists.

Validation: run the Breach JavaScript suite and static export checks. Targeted
coverage exercises stale decode cancellation, preparing without playing, shared
loads, retry after failure, preview lifetime and interrupted-context resumption.
Cloud Chrome verifies UI and Web Audio playback; a physical iPhone listening
check is still needed to confirm the user's exact device behavior.
