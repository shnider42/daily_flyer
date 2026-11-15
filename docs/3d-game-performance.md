# 3D game performance

Skyward looked smoother in a small window than on a 2560×1440 desktop. A 1440p draw buffer at DPR 1 contains 3.69 million pixels, four times a 1280×720 buffer. At DPR 2 it reaches 14.75 million. Window size is part of the workload, even when the scene and simulation are identical.

## Rendering defaults

- Size the scene canvas for the layout in CSS. Give the 3D drawing buffer its own pixel budget. Effective scale is bounded by `sqrt(pixelBudget / (cssWidth * cssHeight))` as well as by device pixel ratio. Keep the HUD, pointer input, projection and touch targets in CSS pixels. Start Auto at a measured budget. Let Auto lower resolution after a sustained slowdown and raise it gradually after stable frames. Keep a predictable lower-cost setting and an explicit higher-quality setting. Budget the Canvas fallback separately.
- Scale presentation without changing the simulation step, input sensitivity, match clock or network updates. Sample actual foreground frame intervals for graphics quality. Leave paused, background and resume-gap frames out. Keep animation deltas and physics catch-up independently bounded.
- Compare the same scene at two internal resolutions without moving the camera. A strong cost change points toward pixel work such as shading, antialiasing, transparency or compositing. If cost barely changes, measure CPU work and scene complexity. Profile animation, simulation, rendering and network timing separately. JavaScript call time does not include all GPU and compositing work.
- Keep per-frame work bounded. Batch repeated geometry, avoid unnecessary full-screen passes and backdrop blurs over a moving canvas, and stream heavy scenery or terrain off the frame loop when practical. Compare representative views before and after changes so essential cues and readable terrain survive the performance work.

## Release check

After warm-up, record a 30-second foreground run per representative case. Use the same scene, camera or route, quality setting, and browser for before-and-after comparisons. Include the version, device/browser, graphics backend, CSS viewport, device pixel ratio, internal buffer size, average FPS, p50/p95 frame time and the largest stalls. Report refresh rates when they affect the comparison. Use 60 FPS (16.7 ms/frame) as a desktop target for action games and use 30 FPS (33.3 ms/frame) as an initial mobile compatibility target. Record the actual result and test conditions.

| Case | What to exercise |
| --- | --- |
| 2560×1440 desktop | Auto after warm-up, over a representative route with terrain changes and effects. Check High separately when reporting a High result |
| 1280×720 desktop | Same route and camera as 1440p. Check projection and pointer alignment after resizing |
| Phone | Portrait and landscape where supported. Check input and readability alongside frame cadence |
| Compatibility renderer | Force fallback if available. Record its own limits and verify that the game remains controllable |
| Multiplayer | Fill the room and sample the busiest expected play. Record host step cost, snapshot cadence and ping alongside render timing |

Real hardware browser timing, a headless rendering benchmark and a deterministic simulation test answer different questions. Label each result with its conditions. If hardware is unavailable, record which checks ran and which measurements still need a real device.

## Examples

- Skyward provides a copyable graphics report in **Setup → Sound & view** and regression tests for fixed-step flight across display rates. [Skyward source and run instructions](https://github.com/shnider42/daily_flyer/tree/feat/skyward-flight/games/skyward)
- Rendering fewer internal pixels while preserving CSS size is a standard WebGL optimization. [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#consider_rendering_to_a_smaller_back_buffer)

Daily Flyer games ship from separate feature branches. Link this guide from each existing 3D theme as it next changes. New theme branches from `master` get the repository instructions with the guide.
