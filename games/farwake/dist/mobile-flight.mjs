/** Touch heading guidance expressed only as ordinary thrust and turn inputs. */
import { getShipClass } from './fleet.mjs';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const MOBILE_HEADING_DEADZONE = .04;

/**
 * Stick coordinates match the world: right is +x and down is +y.
 * Guidance never edits a ship pose or velocity. Releasing the stick removes
 * guidance, leaving the existing inertia and flight-assist physics in charge.
 */
export function mobileFlightInput(stick = {}, ship = {}, { flightAssist = true } = {}) {
  const x = clamp(finite(stick.x), -1, 1), y = clamp(finite(stick.y), -1, 1);
  const strength = Math.min(1, Math.hypot(x, y));
  if (strength <= MOBILE_HEADING_DEADZONE) return { thrust: 0, turn: 0 };
  const stats = getShipClass(ship.classId || ship.shipClassId || ship.shipClass).stats;
  const acceleration = Math.max(.05, finite(ship.angularAcceleration, finite(ship.turn, stats.angularAcceleration)));
  const rateLimit = Math.max(.05, finite(ship.maxAngularVelocity, stats.maxAngularVelocity));
  const damping = Math.max(0, finite(ship.angularDamping, stats.angularDamping)) * (flightAssist ? 1 : .2);
  const angle = finite(ship.angle), angularVelocity = finite(ship.angularVelocity);
  const requested = Math.atan2(y, x), error = Math.atan2(Math.sin(requested - angle), Math.cos(requested - angle));

  // Critically damped heading guidance, limited by each hull's actual turn rate.
  // Angular-rate feedback begins braking before the nose passes its heading.
  const response = Math.min(3, Math.sqrt(acceleration) * 1.4);
  const desiredRate = clamp(error * response * .5, -rateLimit, rateLimit);
  const turn = clamp((2 * response * (desiredRate - angularVelocity) + damping * angularVelocity) / acceleration, -1, 1);
  // Turn toward the requested direction before adding speed away from it.
  const alignment = Math.abs(error) >= Math.PI / 2 ? 0 : Math.cos(error);
  return { thrust: strength * alignment, turn };
}
