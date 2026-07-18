export function createRideState() {
  return {
    distanceM: 0,
    speedMps: 0,
    gradePct: roadGradeAt(0),
    powerW: 0
  };
}

export function roadGradeAt(distanceM) {
  const base = Math.sin(distanceM * 0.012) * 4.2;
  const longWave = Math.sin(distanceM * 0.003 + 1.7) * 3.4;
  const rollers = Math.sin(distanceM * 0.041 + Math.sin(distanceM * 0.006) * 2) * 1.2;
  return clamp(base + longWave + rollers, -10, 10);
}

export function updateRideState(state, input, dtSeconds) {
  const dt = clamp(dtSeconds, 0, 0.08);
  const powerW = Number.isFinite(input.powerW) ? Math.max(0, input.powerW) : 0;
  const gradePct = roadGradeAt(state.distanceM);
  const speedMps = nextSpeed(state.speedMps, powerW, gradePct, dt);
  const distanceM = state.distanceM + speedMps * dt;

  return {
    distanceM,
    speedMps,
    gradePct: roadGradeAt(distanceM),
    powerW
  };
}

export function shouldSendGradeCommand(_previousGradePct, nextGradePct, nowMs, lastSentMs) {
  if (!Number.isFinite(nextGradePct)) {
    return false;
  }

  return !Number.isFinite(lastSentMs) || nowMs - lastSentMs >= 1000;
}

function nextSpeed(currentSpeedMps, powerW, gradePct, dtSeconds) {
  const massKg = 86;
  const rolling = 0.35;
  const aero = 0.018 * currentSpeedMps * currentSpeedMps;
  const gravity = 9.81 * (gradePct / 100) * 0.9;
  const drive = powerW / Math.max(3, currentSpeedMps * massKg);
  const acceleration = drive - rolling - aero - gravity;

  return clamp(currentSpeedMps + acceleration * dtSeconds, 0, 24);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
