/**
 * Trailmark's local, deterministic route-proximity engine.
 * Coordinates use GeoJSON order [longitude, latitude]; all distances are meters.
 * Thresholds are provisional field-test settings, not a navigation guarantee.
 * The UI should render the internal `on-route` state as “Near selected route”.
 */

const R = 6371008.8;
const radians = value => value * Math.PI / 180;
const degrees = value => value * 180 / Math.PI;
const wrapRadians = value => ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const wrapLongitude = value => ((value + 180) % 360 + 360) % 360 - 180;

function point(value) {
  if (!Array.isArray(value) || value.length < 2 ||
      !Number.isFinite(value[0]) || !Number.isFinite(value[1]) ||
      Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
    throw new TypeError('Expected a finite [longitude, latitude] coordinate.');
  }
  return value;
}

function route(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError('A route needs at least two coordinates.');
  }
  value.forEach(point);
  return value;
}

export function distanceMeters(a, b) {
  point(a);
  point(b);
  const phiA = radians(a[1]);
  const phiB = radians(b[1]);
  const dPhi = phiB - phiA;
  const dLambda = wrapRadians(radians(b[0] - a[0]));
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phiA) * Math.cos(phiB) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function routeLength(coordinates) {
  route(coordinates);
  let length = 0;
  for (let i = 1; i < coordinates.length; i++) {
    length += distanceMeters(coordinates[i - 1], coordinates[i]);
  }
  return length;
}

/** Local projection is suitable for short hiking-route segments, not global routing. */
export function nearestOnRoute(location, coordinates) {
  point(location);
  route(coordinates);
  const lat = radians(location[1]);
  const cos = Math.max(1e-8, Math.cos(lat));
  let best = null;
  let total = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const ax = R * wrapRadians(radians(a[0] - location[0])) * cos;
    const ay = R * radians(a[1] - location[1]);
    // Unwrap each segment relative to its first point to avoid a dateline discontinuity.
    const bx = ax + R * wrapRadians(radians(b[0] - a[0])) * cos;
    const by = R * radians(b[1] - location[1]);
    const dx = bx - ax;
    const dy = by - ay;
    const denominator = dx * dx + dy * dy;
    const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator));
    const coordinate = [
      wrapLongitude(location[0] + degrees((ax + t * dx) / (R * cos))),
      location[1] + degrees((ay + t * dy) / R)
    ];
    const distance = distanceMeters(location, coordinate);
    const segmentLength = distanceMeters(a, b);
    if (!best || distance < best.distance) {
      best = { distance, coordinate, along: total + t * segmentLength, index: i };
    }
    total += segmentLength;
  }
  return { ...best, total };
}

const DEFAULTS = Object.freeze({
  mapUncertaintyM: 20,
  maxAccuracyM: 40,
  staleAfterMs: 15000,
  futureToleranceMs: 2000,
  confirmMs: 12000,
  confirmSamples: 3,
  recoveryMs: 5000,
  recoverySamples: 2,
  maxSampleGapMs: 10000,
  offRouteBaseM: 35,
  offRouteMarginM: 20,
  recoveryDistanceM: 18,
  recoveryAccuracyM: 25,
  jumpFloorM: 60,
  maxWalkingSpeedMps: 5
});

function options(config) {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) continue;
    if (!Number.isFinite(config[key]) || config[key] < 0) {
      throw new TypeError(`${key} must be a finite nonnegative number.`);
    }
    result[key] = config[key];
  }
  if (result.confirmSamples < 2 || result.recoverySamples < 2 ||
      !Number.isInteger(result.confirmSamples) || !Number.isInteger(result.recoverySamples)) {
    throw new TypeError('Confirmation requires an integer sample count of at least two.');
  }
  if (result.recoveryDistanceM >= result.offRouteBaseM) {
    throw new TypeError('Recovery distance must be smaller than the off-route base distance.');
  }
  return result;
}

function cloneFix(fix) {
  return fix ? { ...fix } : null;
}

/**
 * update(fix, now) accepts {longitude, latitude, accuracy, timestamp}.
 * now defaults to Date.now(); pass it explicitly for simulations and tests.
 * pause/resume are explicit: the engine has no document or browser dependencies.
 * alert is an edge event, present only on the update producing that transition.
 */
export function createMonitor(config = {}) {
  const settings = options(config);
  let coordinates = null;
  let total = 0;
  let state;
  let reason;
  let lastFix;
  let lastGoodFix;
  let lastAssessment;
  let lastTimestamp;
  let awaitingSince;
  let requireFixAfter;
  let paused;
  let distance;
  let along;
  let nearestCoordinate;
  let accuracy;
  let pending;
  let recovering;
  let jumpCandidate;
  let lastKnownDistance;

  function clearConfirmation() {
    pending = null;
    recovering = null;
  }

  function snapshot(now = Date.now(), extras = {}) {
    return {
      state,
      reason,
      distance,
      along,
      total,
      accuracy,
      coordinate: nearestCoordinate ? [...nearestCoordinate] : null,
      lastFix: cloneFix(lastFix),
      lastGoodFix: cloneFix(lastGoodFix),
      lastAssessment,
      lastKnownDistance,
      fixAgeMs: lastFix ? Math.max(0, now - lastFix.timestamp) : null,
      offThreshold: accuracy === null ? null : Math.max(settings.offRouteBaseM, accuracy + settings.mapUncertaintyM + settings.offRouteMarginM),
      candidateSamples: pending?.count ?? 0,
      recoverySamples: recovering?.count ?? 0,
      candidateDurationMs: pending ? Math.max(0, pending.last - pending.start) : 0,
      alert: null,
      rejectedReason: null,
      ...extras
    };
  }

  function reset() {
    state = 'idle';
    reason = coordinates ? 'Start a hike to compare your position with the selected route.' : 'Select a mapped route before starting location monitoring.';
    lastFix = null;
    lastGoodFix = null;
    lastAssessment = null;
    lastTimestamp = -Infinity;
    awaitingSince = null;
    requireFixAfter = -Infinity;
    paused = false;
    distance = null;
    along = null;
    nearestCoordinate = null;
    accuracy = null;
    lastKnownDistance = null;
    jumpCandidate = null;
    clearConfirmation();
    return snapshot();
  }

  function setRoute(nextCoordinates) {
    if (nextCoordinates === null || nextCoordinates === undefined || nextCoordinates.length === 0) {
      coordinates = null;
      total = 0;
    } else {
      const next = route(nextCoordinates).map(p => [p[0], p[1]]);
      const nextTotal = routeLength(next);
      if (nextTotal < 1) throw new TypeError('A monitored route must be at least one meter long.');
      coordinates = next;
      total = nextTotal;
    }
    return reset();
  }

  function pause(now = Date.now()) {
    paused = true;
    clearConfirmation();
    jumpCandidate = null;
    state = 'paused';
    reason = 'Monitoring is paused. Keep the app visible for location updates.';
    return snapshot(now);
  }

  function resume(now = Date.now()) {
    paused = false;
    clearConfirmation();
    jumpCandidate = null;
    awaitingSince = now;
    requireFixAfter = now - settings.futureToleranceMs;
    distance = null;
    along = null;
    nearestCoordinate = null;
    state = coordinates ? 'acquiring' : 'idle';
    reason = coordinates ? 'Waiting for a fresh location before assessing the route.' : 'Select a mapped route before starting location monitoring.';
    return snapshot(now);
  }

  function tick(now = Date.now()) {
    if (paused || state === 'idle') return snapshot(now);
    const timestamp = state === 'acquiring' ? awaitingSince : (lastFix?.timestamp ?? awaitingSince);
    if (timestamp !== null && now - timestamp > settings.staleAfterMs) {
      clearConfirmation();
      jumpCandidate = null;
      state = 'stale';
      reason = 'Location is out of date. Waiting for a fresh position.';
      distance = null;
      along = null;
      nearestCoordinate = null;
    }
    return snapshot(now);
  }

  function observe(series, timestamp) {
    if (!series || timestamp - series.last > settings.maxSampleGapMs) {
      return { start: timestamp, last: timestamp, count: 1 };
    }
    return { start: series.start, last: timestamp, count: series.count + 1 };
  }

  function uncertain(message, now, rejectedReason) {
    clearConfirmation();
    state = 'uncertain';
    reason = message;
    distance = null;
    along = null;
    nearestCoordinate = null;
    return snapshot(now, { rejectedReason });
  }

  function update(input, now = Date.now()) {
    if (paused) return snapshot(now, { rejectedReason: 'paused' });
    if (!coordinates) return snapshot(now, { rejectedReason: 'no-route' });
    if (!Number.isFinite(now)) throw new TypeError('now must be a finite timestamp.');
    if (!input || !Number.isFinite(input.longitude) || !Number.isFinite(input.latitude) ||
        Math.abs(input.longitude) > 180 || Math.abs(input.latitude) > 90 ||
        !Number.isFinite(input.accuracy) || input.accuracy < 0 || !Number.isFinite(input.timestamp)) {
      awaitingSince ??= now;
      return uncertain('The location update was invalid. Waiting for a usable position.', now, 'invalid-fix');
    }
    if (input.timestamp > now + settings.futureToleranceMs) {
      tick(now);
      return snapshot(now, { rejectedReason: 'future-fix' });
    }
    if (input.timestamp <= lastTimestamp) {
      tick(now);
      return snapshot(now, { rejectedReason: input.timestamp === lastTimestamp ? 'duplicate-fix' : 'out-of-order-fix' });
    }
    if (now - input.timestamp > settings.staleAfterMs || input.timestamp < requireFixAfter) {
      clearConfirmation();
      tick(now);
      if (!lastFix) {
        state = 'stale';
        reason = 'The received location is out of date. Waiting for a fresh position.';
      }
      return snapshot(now, { rejectedReason: 'stale-fix' });
    }

    const fix = {
      longitude: input.longitude,
      latitude: input.latitude,
      accuracy: input.accuracy,
      timestamp: input.timestamp
    };
    lastTimestamp = fix.timestamp;
    lastFix = fix;
    accuracy = fix.accuracy;
    awaitingSince ??= now;
    if (accuracy > settings.maxAccuracyM) {
      jumpCandidate = null;
      return uncertain('Location accuracy is too low to assess the route. Wait for a clearer fix.', now, 'poor-accuracy');
    }

    const position = [fix.longitude, fix.latitude];
    if (lastGoodFix) {
      const elapsedSeconds = Math.max(0, (fix.timestamp - lastGoodFix.timestamp) / 1000);
      const displacement = distanceMeters(position, [lastGoodFix.longitude, lastGoodFix.latitude]);
      const jumpLimit = Math.max(settings.jumpFloorM, settings.maxWalkingSpeedMps * elapsedSeconds + lastGoodFix.accuracy + accuracy);
      if (displacement > jumpLimit) {
        const agreesWithCandidate = jumpCandidate &&
          fix.timestamp - jumpCandidate.timestamp <= settings.maxSampleGapMs &&
          distanceMeters(position, [jumpCandidate.longitude, jumpCandidate.latitude]) <= Math.max(20, accuracy + jumpCandidate.accuracy);
        if (!agreesWithCandidate) {
          jumpCandidate = fix;
          return uncertain('The GPS position jumped. Waiting for another agreeing fix.', now, 'position-jump');
        }
        // Only this agreeing sample counts; the rejected jump was never evidence.
        clearConfirmation();
      }
    }
    jumpCandidate = null;
    lastGoodFix = fix;
    const nearest = nearestOnRoute(position, coordinates);
    distance = nearest.distance;
    along = nearest.along;
    nearestCoordinate = nearest.coordinate;
    lastKnownDistance = distance;
    const offThreshold = Math.max(settings.offRouteBaseM, accuracy + settings.mapUncertaintyM + settings.offRouteMarginM);
    const near = distance <= settings.recoveryDistanceM && accuracy <= settings.recoveryAccuracyM;
    let alert = null;

    if (lastAssessment === 'off-route') {
      pending = null;
      if (near) {
        recovering = observe(recovering, fix.timestamp);
        if (recovering.count >= settings.recoverySamples && recovering.last - recovering.start >= settings.recoveryMs) {
          state = 'on-route';
          reason = 'Your recent positions are near the selected route.';
          lastAssessment = 'on-route';
          recovering = null;
          alert = 'returned';
        } else {
          state = 'checking';
          reason = 'You appear closer to the route. Checking another position.';
        }
      } else {
        recovering = null;
        state = 'off-route';
        reason = 'You appear away from the selected route. Stop and check the map.';
      }
    } else if (distance > offThreshold) {
      recovering = null;
      pending = observe(pending, fix.timestamp);
      if (pending.count >= settings.confirmSamples && pending.last - pending.start >= settings.confirmMs) {
        state = 'off-route';
        lastAssessment = 'off-route';
        reason = 'You appear away from the selected route. Stop and check the map.';
        pending = null;
        alert = 'off-route';
      } else {
        state = 'checking';
        reason = 'You may be away from the route. Checking recent positions.';
      }
    } else {
      pending = null;
      recovering = null;
      if (near) {
        state = 'on-route';
        lastAssessment = 'on-route';
        reason = 'Your position is near the selected route. Check signs at junctions.';
      } else {
        state = 'uncertain';
        reason = 'Position and map uncertainty are too close to assess this branch. Check the map and trail markings.';
      }
    }
    return snapshot(now, { alert });
  }

  setRoute(config.coordinates ?? null);
  return { update, tick, reset, pause, resume, setRoute };
}
