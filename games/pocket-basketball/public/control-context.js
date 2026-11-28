/** One source of truth for the input meanings and their on-screen labels. */
export function controlContext(game) {
  if (!game) return { offense: true, canShoot: false, token: 'lobby' };
  const { ball, human, phase } = game;
  const carrier = game.carrier();
  const ownBall = human >= 0 && carrier?.team === human;
  const ownPass = ball.flight?.kind === 'pass' && ball.flight.team === human;
  const ownRestart = game.inOffense() && (phase === 'inbound' || phase === 'freeThrow');
  // A pass remains our team's play. A shot or loose ball is a recovery situation;
  // a held defensive input must never queue a shot for the eventual rebounder.
  const offense = ownBall || ownPass || ownRestart;
  const liveCarrier = phase === 'live' && ownBall && ball.owner === game.controlled;
  const freeThrow = phase === 'freeThrow' && game.freeThrows?.team === human &&
    !ball.flight && game.phaseTime <= 0;
  const shotGuard = liveCarrier && game.elapsed < game.shootGraceUntil;
  return {
    offense,
    canShoot: !shotGuard && (freeThrow || (liveCarrier && carrier.actionCooldown <= 0)),
    shotGuard,
    possessionEpoch: game.possessionEpoch,
    token: `${game.possessionEpoch}/${game.controlled}/${ball.owner}/${phase}/${offense}`,
  };
}
