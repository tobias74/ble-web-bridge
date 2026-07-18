import { Activity, Bike, Link, Pause, Play, Radio, Route, Send, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createRideScene } from './rideScene.js';
import { createRideState, shouldSendGradeCommand, updateRideState } from './simulation.js';
import { getDefaultRelayUrl, getLatest, resolvePowerInput, sendBikeGrade, trimTrailingSlash } from './relayClient.js';

const POLL_INTERVAL_MS = 1000;
const HUD_INTERVAL_MS = 140;

export default function App() {
  const [relayUrl, setRelayUrl] = useState(() => localStorage.getItem('ble-demo-relay-url') || getDefaultRelayUrl());
  const [sessionCode, setSessionCode] = useState(() => localStorage.getItem('ble-demo-session-code') || '');
  const [polling, setPolling] = useState(false);
  const [manualPowerW, setManualPowerW] = useState(150);
  const [sendGrade, setSendGrade] = useState(false);
  const [hud, setHud] = useState(() => ({
    mode: 'manual',
    status: 'manual fallback',
    powerW: 150,
    speedMps: 0,
    gradePct: 0,
    distanceM: 0,
    cadenceRpm: null,
    heartBpm: null,
    sourceLabel: 'manual slider',
    commandStatus: 'off'
  }));

  const canvasHostRef = useRef(null);
  const sceneRef = useRef(null);
  const rideRef = useRef(createRideState());
  const latestRef = useRef(null);
  const telemetryRef = useRef(resolvePowerInput(null, manualPowerW));
  const commandRef = useRef({
    lastGrade: null,
    lastSentAt: null,
    inFlight: false
  });

  useEffect(() => {
    localStorage.setItem('ble-demo-relay-url', trimTrailingSlash(relayUrl));
  }, [relayUrl]);

  useEffect(() => {
    localStorage.setItem('ble-demo-session-code', sessionCode.trim().toUpperCase());
  }, [sessionCode]);

  useEffect(() => {
    telemetryRef.current = resolvePowerInput(latestRef.current, manualPowerW);
  }, [manualPowerW]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) {
      return undefined;
    }

    const scene = createRideScene(host);
    sceneRef.current = scene;
    let frameId = 0;
    let lastTime = performance.now();

    const resizeObserver = new ResizeObserver(() => scene.resize());
    resizeObserver.observe(host);

    function animate(now) {
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      const input = telemetryRef.current;
      rideRef.current = updateRideState(rideRef.current, input, dt);
      scene.update(rideRef.current, now / 1000);
      maybeSendGrade();
      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!polling) {
      return undefined;
    }

    let stopped = false;

    async function pollOnce() {
      if (!sessionCode.trim()) {
        latestRef.current = null;
        telemetryRef.current = resolvePowerInput(null, manualPowerW);
        return;
      }

      try {
        const latest = await getLatest(trimTrailingSlash(relayUrl), sessionCode.trim().toUpperCase());
        if (stopped) {
          return;
        }

        latestRef.current = latest;
        telemetryRef.current = resolvePowerInput(latest, manualPowerW);
      } catch (error) {
        if (stopped) {
          return;
        }

        latestRef.current = null;
        telemetryRef.current = {
          ...resolvePowerInput(null, manualPowerW),
          error: error.message
        };
      }
    }

    pollOnce();
    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [manualPowerW, polling, relayUrl, sessionCode]);

  useEffect(() => {
    const interval = setInterval(() => {
      const ride = rideRef.current;
      const telemetry = telemetryRef.current;
      setHud({
        mode: telemetry.mode,
        status: statusText(telemetry),
        powerW: telemetry.powerW,
        speedMps: telemetry.speedMps || ride.speedMps,
        gradePct: ride.gradePct,
        distanceM: ride.distanceM,
        cadenceRpm: telemetry.cadenceRpm,
        heartBpm: telemetry.heartBpm,
        sourceLabel: telemetry.source ? `${telemetry.source.protocol} · ${telemetry.source.deviceName || telemetry.source.deviceId}` : 'manual slider',
        commandStatus: commandRef.current.status || (sendGrade ? 'ready' : 'off')
      });
    }, HUD_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sendGrade]);

  async function maybeSendGrade() {
    if (!sendGrade || !polling || !sessionCode.trim()) {
      return;
    }

    const command = commandRef.current;
    const now = Date.now();
    const gradePct = rideRef.current.gradePct;
    if (command.inFlight || !shouldSendGradeCommand(command.lastGrade, gradePct, now, command.lastSentAt)) {
      return;
    }

    command.inFlight = true;
    command.status = 'sending';

    try {
      const response = await sendBikeGrade(trimTrailingSlash(relayUrl), sessionCode.trim().toUpperCase(), gradePct);
      command.status = response.status || 'sent';
      command.lastGrade = gradePct;
      command.lastSentAt = now;
    } catch (error) {
      command.status = error.message;
      command.lastSentAt = now;
    } finally {
      command.inFlight = false;
    }
  }

  return (
    <main className="game-shell">
      <div className="scene-host" ref={canvasHostRef} />

      <section className="hud top-left" aria-label="BLE Bridge demo controls">
        <div className="brand-line">
          <Bike size={22} />
          <div>
            <h1>Bridge Ride</h1>
            <p>{hud.status}</p>
          </div>
        </div>

        <label className="field">
          <span>Relay URL</span>
          <input value={relayUrl} onChange={(event) => setRelayUrl(event.target.value)} />
        </label>

        <label className="field">
          <span>Session code</span>
          <input value={sessionCode} onChange={(event) => setSessionCode(event.target.value.toUpperCase())} placeholder="BLUE-4821" />
        </label>

        <div className="button-row">
          <button className="primary-button" onClick={() => setPolling((value) => !value)}>
            {polling ? <Pause size={18} /> : <Play size={18} />}
            <span>{polling ? 'Pause polling' : 'Start polling'}</span>
          </button>
        </div>

        <label className="range-field">
          <span>Manual power</span>
          <strong>{manualPowerW} W</strong>
          <input
            type="range"
            min="0"
            max="500"
            step="5"
            value={manualPowerW}
            onChange={(event) => setManualPowerW(Number(event.target.value))}
          />
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={sendGrade}
            onChange={(event) => setSendGrade(event.target.checked)}
          />
          <span>Send road grade to bike</span>
        </label>
      </section>

      <section className="hud bottom-strip" aria-label="Ride metrics">
        <Metric icon={<Zap size={18} />} label="Power" value={formatMetric(hud.powerW, 'W', 0)} />
        <Metric icon={<Activity size={18} />} label="Speed" value={formatMetric(hud.speedMps * 3.6, 'km/h', 1)} />
        <Metric icon={<Route size={18} />} label="Grade" value={formatMetric(hud.gradePct, '%', 1)} />
        <Metric icon={<Radio size={18} />} label="Source" value={hud.sourceLabel} />
        <Metric icon={<Link size={18} />} label="Distance" value={formatMetric(hud.distanceM / 1000, 'km', 2)} />
        <Metric icon={<Send size={18} />} label="Command" value={hud.commandStatus} />
      </section>
    </main>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusText(telemetry) {
  if (telemetry.error) {
    return `manual fallback: ${telemetry.error}`;
  }

  if (telemetry.mode === 'relay') {
    return 'live relay power';
  }

  return telemetry.fallbackReason === 'no_power_source' ? 'manual fallback: no power source' : 'manual fallback';
}

function formatMetric(value, unit, digits) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return `${value.toFixed(digits)} ${unit}`.trim();
}
