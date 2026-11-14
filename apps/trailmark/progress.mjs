/**
 * Ordered hiking-route progress. This is separate from route-departure detection.
 * A map position alone cannot identify the traversal of a repeated/parallel path.
 * Only nearby, physically plausible route progress can advance checkpoints.
 */
import { distanceMeters, nearestOnRoute, routeLength } from './navigation.mjs';

const LIMITS = Object.freeze({
  accuracyM: 25,
  startRadiusM: 50,
  approachRadiusM: 30,
  checkpointAlongRadiusM: 40,
  passedDistanceM: 25,
  lookAheadM: 60,
  lookBehindM: 35,
  speedMps: 5,
  staleMs: 15000,
  futureToleranceMs: 2000,
  finishRadiusM: 20
});

/**
 * route = { coordinates, waypoints: [{id, coordinate, routeIndex, distanceAlongM}] }
 * update accepts {longitude, latitude, accuracy, timestamp}, with an optional now.
 * seek(along) is an explicit DEMO-ONLY evidence bypass; never use it for live GPS.
 */
export function createProgress(route) {
  const total = routeLength(route?.coordinates);
  if (total < 1) throw new TypeError('A progress route must be at least one meter long.');
  const coordinates = route.coordinates.map(coordinate => [coordinate[0], coordinate[1]]);
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceMeters(coordinates[i - 1], coordinates[i]));
  }
  const waypoints = (route.waypoints ?? []).map((waypoint, index) => {
    const routeIndex = waypoint.routeIndex;
    let distanceAlongM = waypoint.distanceAlongM;
    if (!Number.isFinite(distanceAlongM) && Number.isInteger(routeIndex) && routeIndex >= 0 && routeIndex < coordinates.length) {
      distanceAlongM = cumulative[routeIndex];
    }
    if (!Number.isFinite(distanceAlongM) || distanceAlongM < 0 || distanceAlongM > total + 1) {
      throw new TypeError(`Checkpoint ${index} needs a valid ordered distanceAlongM or routeIndex.`);
    }
    const coordinate = waypoint.coordinate ?? coordinates[routeIndex];
    // Use the geometry validator without finding a global nearest occurrence.
    distanceMeters(coordinate, coordinate);
    return { id: waypoint.id ?? String(index), coordinate: [...coordinate], distanceAlongM: Math.min(total, distanceAlongM) };
  });
  for (let i = 1; i < waypoints.length; i++) {
    if (waypoints[i].distanceAlongM < waypoints[i - 1].distanceAlongM) {
      throw new TypeError('Checkpoints must be ordered by distance along the route.');
    }
  }

  let started;
  let along;
  let nextIndex;
  let atCheckpoint;
  let complete;
  let nearStart;
  let reason;
  let approached;
  let lastSeenTimestamp;
  let lastMatchedTimestamp;
  let demoSeek;
  let positionConfirmed;

  function getSnapshot() {
    return { started, along, nextIndex, atCheckpoint, complete, nearStart, reason, total, demoSeek, positionConfirmed };
  }

  function reset() {
    started = false;
    along = 0;
    nextIndex = 0;
    atCheckpoint = false;
    complete = false;
    nearStart = false;
    reason = 'Checkpoint guidance starts after an accurate position near the route start.';
    approached = new Set();
    lastSeenTimestamp = -Infinity;
    lastMatchedTimestamp = null;
    demoSeek = false;
    positionConfirmed = false;
    return getSnapshot();
  }

  function hold(message) {
    positionConfirmed = false;
    atCheckpoint = false;
    nearStart = false;
    reason = message;
    return getSnapshot();
  }

  function candidates(location, accuracy, lower, upper) {
    const found = [];
    const corridor = Math.max(20, accuracy + 10);
    for (let i = 0; i < coordinates.length - 1; i++) {
      if (cumulative[i] > upper || cumulative[i + 1] < lower) continue;
      const match = nearestOnRoute(location, [coordinates[i], coordinates[i + 1]]);
      const candidateAlong = cumulative[i] + match.along;
      if (candidateAlong < lower - 0.05 || candidateAlong > upper + 0.05 || match.distance > corridor) continue;
      found.push({ along: candidateAlong, distance: match.distance });
    }
    if (!found.length) return null;
    const nearestDistance = Math.min(...found.map(candidate => candidate.distance));
    // If paths are indistinguishable at this accuracy, retain the earliest
    // plausible traversal rather than skipping ahead to the next parallel path.
    const ambiguousWithin = Math.min(8, accuracy / 2);
    return found
      .filter(candidate => candidate.distance <= nearestDistance + ambiguousWithin)
      .sort((a, b) => a.along - b.along || a.distance - b.distance)[0];
  }

  function update(fix, now = Date.now()) {
    positionConfirmed = false;
    if (!Number.isFinite(now)) throw new TypeError('now must be a finite timestamp.');
    if (!fix || !Number.isFinite(fix.longitude) || !Number.isFinite(fix.latitude) ||
        Math.abs(fix.longitude) > 180 || Math.abs(fix.latitude) > 90 ||
        !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || !Number.isFinite(fix.timestamp)) {
      return hold('A usable position is needed before checkpoint guidance can advance.');
    }
    if (fix.timestamp > now + LIMITS.futureToleranceMs || now - fix.timestamp > LIMITS.staleMs) {
      return hold('This position is out of date. Checkpoint progress is unchanged.');
    }
    if (fix.timestamp <= lastSeenTimestamp) {
      return hold('Waiting for a newer position. Checkpoint progress is unchanged.');
    }
    lastSeenTimestamp = fix.timestamp;
    if (fix.accuracy > LIMITS.accuracyM) {
      return hold('Location is too imprecise to identify the next junction.');
    }
    const location = [fix.longitude, fix.latitude];
    nearStart = distanceMeters(location, coordinates[0]) <= LIMITS.startRadiusM;
    atCheckpoint = false;
    if (complete) {
      positionConfirmed = distanceMeters(location, coordinates.at(-1)) <= Math.max(20, fix.accuracy + 10);
      reason = 'The selected route has been completed.';
      return getSnapshot();
    }
    if (!started) {
      if (!nearStart) {
        reason = 'You are away from the route start. Checkpoint order has not been assumed; use the map.';
        return getSnapshot();
      }
      // Even at a trailhead shared with the finish, only the outbound beginning
      // is considered. No full-route nearest projection is used here.
      const initial = candidates(location, fix.accuracy, 0, LIMITS.lookAheadM);
      if (!initial) {
        reason = 'You are near the start. Move onto the marked route to begin checkpoint guidance.';
        return getSnapshot();
      }
      started = true;
      along = initial.along;
      lastMatchedTimestamp = fix.timestamp;
    } else {
      const elapsedSeconds = lastMatchedTimestamp === null ? null : Math.max(0, (fix.timestamp - lastMatchedTimestamp) / 1000);
      const travelLimit = elapsedSeconds === null ? LIMITS.lookAheadM : Math.min(LIMITS.lookAheadM, elapsedSeconds * LIMITS.speedMps);
      const match = candidates(location, fix.accuracy, Math.max(0, along - LIMITS.lookBehindM), Math.min(total, along + travelLimit));
      if (!match) {
        reason = 'This position does not match the next nearby route section. Check the map before continuing.';
        return getSnapshot();
      }
      // A backwards reading cannot undo visited checkpoints or select the
      // earlier occurrence of a connector during the return traversal.
      if (match.along > along) {
        along = match.along;
        lastMatchedTimestamp = fix.timestamp;
      }
    }

    positionConfirmed = true;

    const current = waypoints[nextIndex];
    if (current) {
      const alreadyApproached = approached.has(nextIndex);
      const nearCheckpoint = distanceMeters(location, current.coordinate) <= LIMITS.approachRadiusM &&
        Math.abs(along - current.distanceAlongM) <= LIMITS.checkpointAlongRadiusM;
      if (alreadyApproached && along > current.distanceAlongM + LIMITS.passedDistanceM) {
        nextIndex++;
        reason = 'The approached junction is behind you. Showing the next checkpoint.';
      } else {
        if (nearCheckpoint) approached.add(nextIndex);
        atCheckpoint = nearCheckpoint;
        if (along > current.distanceAlongM + LIMITS.passedDistanceM) positionConfirmed = false;
        reason = nearCheckpoint ? 'Junction nearby. Check the map and trail markings before taking the turn.' :
          (along > current.distanceAlongM + LIMITS.passedDistanceM ?
            'This checkpoint was not observed on approach. Check the map; it has not been marked passed.' :
            'Following the selected route in order.');
      }
    } else {
      reason = 'The mapped checkpoints are behind you. Continue along the route to the finish.';
    }
    const nearFinish = distanceMeters(location, coordinates.at(-1)) <= LIMITS.finishRadiusM;
    if (along >= total - 15 && nearFinish && nextIndex === waypoints.length) {
      complete = true;
      atCheckpoint = false;
      reason = 'You have followed the selected route back to its finish.';
    }
    return getSnapshot();
  }

  /** Position a simulated hiker. Intentionally bypasses start and visit evidence. */
  function seek(distanceAlongM) {
    if (!Number.isFinite(distanceAlongM) || distanceAlongM < 0 || distanceAlongM > total) {
      throw new TypeError('Demo seek distance must lie within the route.');
    }
    reset();
    demoSeek = true;
    positionConfirmed = true;
    started = true;
    along = distanceAlongM;
    while (nextIndex < waypoints.length && waypoints[nextIndex].distanceAlongM + LIMITS.passedDistanceM < along) {
      approached.add(nextIndex++);
    }
    if (waypoints[nextIndex] && Math.abs(waypoints[nextIndex].distanceAlongM - along) <= LIMITS.approachRadiusM) {
      approached.add(nextIndex);
    }
    nearStart = along <= LIMITS.startRadiusM;
    complete = along >= total && nextIndex === waypoints.length;
    reason = 'Demo position selected. Checkpoint history here is simulated.';
    return getSnapshot();
  }

  reset();
  return { update, reset, getSnapshot, seek };
}
