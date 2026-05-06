import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import logo from "./assets/image.png";

const SPEED_MODES = [
  { label: "Idle", max: 5, color: "#22c55e" },
  { label: "Cruise", max: 40, color: "#38bdf8" },
  { label: "Highway", max: 80, color: "#f59e0b" },
  { label: "Industrial", max: 999, color: "#ef4444" },
];

function App() {
  const [speed, setSpeed] = useState(0);
  const [status, setStatus] = useState("System idle");
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [unit, setUnit] = useState("kmh");
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [acceleration, setAcceleration] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [position, setPosition] = useState({ lat: null, lng: null });
  const [alert, setAlert] = useState("");
  const [log, setLog] = useState([]);

  const watchIdRef = useRef(null);
  const prevPositionRef = useRef(null);
  const prevTimeRef = useRef(null);
  const lastSpeedRef = useRef(0);
  const startTimeRef = useRef(null);

  const unitOptions = ["kmh", "mph", "ms"];
  const unitLabel = unit === "mph" ? "mph" : unit === "ms" ? "m/s" : "km/h";
  const distanceLabel = unit === "mph" ? "mi" : unit === "ms" ? "m" : "km";
  const gaugeMax = unit === "mph" ? 120 : unit === "ms" ? 50 : 180;

  const requestPermission = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation unsupported in this browser.");
      setStatus("Offline");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPermissionGranted(true);
        setError("");
        prevPositionRef.current = null;
        prevTimeRef.current = null;
        startTimeRef.current = null;
        setStatus("Permission granted. Starting track...");
        setTracking(true);
      },
      (err) => {
        if (err.code === 1) {
          setError("❌ GPS permission denied. Please enable in settings.");
          setStatus("Permission blocked");
        } else if (err.code === 2) {
          setError("⚠️ GPS signal unavailable. Try moving to open sky.");
          setStatus("No fix");
        } else {
          setError("⚠️ Unable to access GPS.");
          setStatus("Error");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  };

  useEffect(() => {
    if (!tracking) return;
    if (!("geolocation" in navigator)) {
      setError("Geolocation unsupported in this browser.");
      setStatus("Offline");
      setTracking(false);
      return;
    }

    setError("");
    setStatus("Initializing GPS...");
    startTimeRef.current = startTimeRef.current || Date.now();

    const watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [tracking]);

  useEffect(() => {
    if (!tracking) return;
    const timer = setInterval(() => {
      if (!startTimeRef.current) return;
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [tracking]);

  const handlePosition = (positionEvent) => {
    setStatus("GPS signal locked");
    setGpsAccuracy(positionEvent.coords.accuracy);
    const { latitude, longitude } = positionEvent.coords;
    const currentTime = positionEvent.timestamp;
    setPosition({ lat: latitude, lng: longitude });

    const gpsSpeedKmh =
      positionEvent.coords.speed !== null && positionEvent.coords.speed >= 0
        ? positionEvent.coords.speed * 3.6
        : null;

    if (prevPositionRef.current && prevTimeRef.current) {
      const distance = getDistance(
        prevPositionRef.current.lat,
        prevPositionRef.current.lng,
        latitude,
        longitude
      );
      const deltaTime = Math.max((currentTime - prevTimeRef.current) / 1000, 0.001);
      const measuredKmh =
        gpsSpeedKmh !== null ? gpsSpeedKmh : (distance / deltaTime) * 3.6;
      const filteredSpeed = smoothSpeed(measuredKmh, lastSpeedRef.current);
      const stableSpeed = filteredSpeed < 0.2 ? 0 : filteredSpeed;

      setSpeed(stableSpeed);
      setDistanceMeters((prev) => prev + distance);
      setMaxSpeed((prev) => Math.max(prev, measuredKmh));
      setAcceleration((stableSpeed - lastSpeedRef.current) / deltaTime);
      lastSpeedRef.current = stableSpeed;
      setAlert(getAlert(stableSpeed));
      pushLogEntry(stableSpeed, distance);
    } else if (gpsSpeedKmh !== null) {
      const filteredSpeed = smoothSpeed(gpsSpeedKmh, lastSpeedRef.current);
      const stableSpeed = filteredSpeed < 0.2 ? 0 : filteredSpeed;

      setSpeed(stableSpeed);
      setMaxSpeed((prev) => Math.max(prev, gpsSpeedKmh));
      setAcceleration(0);
      lastSpeedRef.current = stableSpeed;
      setAlert(getAlert(stableSpeed));
      pushLogEntry(stableSpeed, 0);
    } else {
      setSpeed(0);
      setAcceleration(0);
      setAlert("");
      lastSpeedRef.current = 0;
    }

    prevPositionRef.current = { lat: latitude, lng: longitude };
    prevTimeRef.current = currentTime;
  };

  const handleError = (err) => {
  setTracking(false);

  if (err.code === 1) {
    setError("❌ GPS permission denied. Enable location services.");
    setStatus("Permission blocked");
  } else if (err.code === 2) {
    setError("⚠️ GPS signal lost. Move to open sky.");
    setStatus("No fix");
  } else {
    setError("⚠️ Unable to read position.");
    setStatus("Error");
  }
};

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (angle) => (angle * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getAlert = (kmh) => {
    if (kmh >= 110) return "🚨 Industrial overspeed detected. Reduce pace.";
    if (kmh >= 70) return "⚠️ High-speed mode active. Stay vigilant.";
    return "";
  };

  const smoothSpeed = (current, previous) => previous + (current - previous) * 0.5;

  const getRawMaxSpeed = (kmh) => kmh;

  const pushLogEntry = (speedKmh, distanceMetersDelta) => {
    const entry = {
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      speed: convertSpeed(speedKmh),
      distance: convertDistance(distanceMetersDelta),
    };

    setLog((current) => [entry, ...current].slice(0, 5));
  };

  const toggleTracking = () => {
    if (tracking) {
      setTracking(false);
      setStatus("Paused");
      return;
    }

    if (!permissionGranted) {
      requestPermission();
      return;
    }

    prevPositionRef.current = null;
    prevTimeRef.current = null;
    setStatus("Starting tracking...");
    setTracking(true);
  };

  const resetDashboard = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    prevPositionRef.current = null;
    prevTimeRef.current = null;
    lastSpeedRef.current = 0;
    startTimeRef.current = null;
    setTracking(false);
    setSpeed(0);
    setDistanceMeters(0);
    setMaxSpeed(0);
    setElapsedSeconds(0);
    setAcceleration(0);
    setGpsAccuracy(null);
    setPosition({ lat: null, lng: null });
    setAlert("");
    setLog([]);
    setError("");
    setStatus("System idle");
  };

  const convertSpeed = (kmh) =>
    unit === "mph" ? kmh * 0.621371 : unit === "ms" ? kmh / 3.6 : kmh;
  const convertDistance = (meters) =>
    unit === "mph"
      ? meters * 0.000621371
      : unit === "ms"
      ? meters
      : meters * 0.001;

  const displayedSpeed = convertSpeed(speed);
  const displayedMax = convertSpeed(maxSpeed);
  const averageKmh = elapsedSeconds > 0 ? (distanceMeters * 3.6) / elapsedSeconds : 0;
  const displayedAverage = unit === "ms" ? averageKmh / 3.6 : convertSpeed(averageKmh);
  const displayedDistance = convertDistance(distanceMeters);
  const gaugeAngle = Math.min((displayedSpeed / gaugeMax) * 180, 180);
  const selectedMode = SPEED_MODES.find((mode) => speed <= mode.max) || SPEED_MODES[SPEED_MODES.length - 1];
  const formattedTime = new Date(elapsedSeconds * 1000).toISOString().substr(11, 8);
  const markers =
    unit === "mph"
      ? [0, 20, 40, 60, 80, 100, 120]
      : unit === "ms"
      ? [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
      : [0, 20, 40, 60, 80, 100, 120, 140, 160, 180];

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="brand-section">
          <img
            src={logo}
            alt="SpeedLix Logo"
            className="brand-logo"
          />

          <div>

            <p className="subtitle">
              Live GPS tracking · distance · velocity · telemetry
            </p>
          </div>
        </div>
        <div className="hero-actions">
          <button className="button button-secondary" onClick={() => {
            const nextIndex = (unitOptions.indexOf(unit) + 1) % unitOptions.length;
            setUnit(unitOptions[nextIndex]);
          }}>
            Unit: {unitLabel}
          </button>
          <button className={`button ${tracking ? "button-warn" : "button-primary"}`} onClick={toggleTracking}>
            {tracking ? "Pause" : "Start"}
          </button>
          <button className="button button-secondary" onClick={resetDashboard}>Reset</button>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel panel-large">
          <div className="gauge-card">
            <div className="gauge-header">
              <div>
                <span className="gauge-title">Velocity</span>
                <span className="gauge-subtitle">{unitLabel} · analog readout</span>
              </div>
              <span className="mode-chip" style={{ background: selectedMode.color }}>{selectedMode.label}</span>
            </div>

            <div className="gauge-shell">
              <SpeedGauge angle={gaugeAngle} markers={markers} max={gaugeMax} />
              <div className="digital-display">
                <span className="speed-value">{displayedSpeed.toFixed(1)}</span>
                <span className="speed-unit">{unitLabel}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="panel metrics-panel">
          <div className="metric-card">
            <span>Distance</span>
            <strong>{displayedDistance.toFixed(2)} {distanceLabel}</strong>
          </div>
          <div className="metric-card">
            <span>Max Speed</span>
            <strong>{displayedMax.toFixed(1)} {unitLabel}</strong>
          </div>
          <div className="metric-card">
            <span>Average Speed</span>
            <strong>{displayedAverage.toFixed(1)} {unitLabel}</strong>
          </div>
          <div className="metric-card">
            <span>Run Time</span>
            <strong>{formattedTime}</strong>
          </div>
          <div className="metric-card">
            <span>Acceleration</span>
            <strong>{acceleration.toFixed(2)} {unit === "mph" ? "mph/s" : "km/h²"}</strong>
          </div>
          <div className="metric-card">
            <span>GPS Accuracy</span>
            <strong>{gpsAccuracy ? `${gpsAccuracy.toFixed(1)} m` : "waiting..."}</strong>
          </div>
        </section>

        <section className="panel status-panel">
          <div className="status-row">
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          <div className="status-row">
            <span>Coordinates</span>
            <strong>{position.lat ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : "waiting..."}</strong>
          </div>
          <div className="status-row">
            <span>Telemetry</span>
            <strong>{tracking ? "active" : "inactive"}</strong>
          </div>
          <div className="status-row">
            <span>Alerts</span>
            <strong className={alert ? "alert-text" : "quiet-text"}>{alert || "none"}</strong>
          </div>
          {error && <div className="status-error">{error}</div>}
        </section>

        <section className="panel log-panel">
          <div className="panel-title">Telemetry Log</div>
          <div className="log-list">
            {log.length === 0 ? (
              <div className="log-empty">No records yet. Start tracking to populate the log.</div>
            ) : (
              log.map((item, index) => (
                <div className="log-item" key={index}>
                  <span>{item.time}</span>
                  <span>{item.speed.toFixed(1)} {unitLabel}</span>
                  <span>{item.distance.toFixed(3)} {distanceLabel}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

const SpeedGauge = ({ angle, markers, max }) => {
  return (
    <div className="speed-meter">
      <div className="dial">
        <div className="needle" style={{ transform: `rotate(${angle - 90}deg)` }} />
        <div className="dial-center" />
        {markers.map((value) => {
          const percent = value / max;
          const rotation = percent * 180 - 90;
          return (
            <div
              key={value}
              className="tick"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <span>{value}</span>
            </div>
          );
        })}
      </div>
      <div className="gauge-footer">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

export default App;
