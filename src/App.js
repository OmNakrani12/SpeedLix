import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import SpeedGauge from "./components/SpeedGauge";
import SpeedGraph from "./components/SpeedGraph";
import CompassCard from "./components/CompassCard";
import { playAlertChime, playClickBeep } from "./utils/audioAlert";
import logo from "./assets/image.png";

// Speed modes for dynamic styling and status chips
const SPEED_MODES = [
  { label: "IDLE", max: 5, color: "#64748b" },
  { label: "ECO", max: 40, color: "#10b981" },
  { label: "CRUISE", max: 80, color: "#06b6d4" },
  { label: "DYNAMIC", max: 120, color: "#f59e0b" },
  { label: "HIGHWAY", max: 999, color: "#ef4444" },
];

const UNIT_CONFIG = {
  kmh: { label: "km/h", distLabel: "km", maxGauge: 180, speedFactor: 1, distFactor: 0.001 },
  mph: { label: "mph", distLabel: "mi", maxGauge: 120, speedFactor: 0.621371, distFactor: 0.000621371 },
  ms: { label: "m/s", distLabel: "m", maxGauge: 50, speedFactor: 1 / 3.6, distFactor: 1 },
  knots: { label: "kn", distLabel: "NM", maxGauge: 100, speedFactor: 0.539957, distFactor: 0.000539957 },
};

function App() {
  // Primary States
  const [speedKmh, setSpeedKmh] = useState(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [acceleration, setAcceleration] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [status, setStatus] = useState("Ready to track");
  const [error, setError] = useState("");
  const [unit, setUnit] = useState("kmh");

  // Telemetry States
  const [heading, setHeading] = useState(null);
  const [altitude, setAltitude] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [speedHistory, setSpeedHistory] = useState([]);
  const [tripLogs, setTripLogs] = useState([]);

  // UX & Extra Features
  const [hudMode, setHudMode] = useState(false);
  const [simulatorMode, setSimulatorMode] = useState(false);
  const [simTargetSpeed, setSimTargetSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(80);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionDeniedGuide, setPermissionDeniedGuide] = useState(false);
  const [browserStateDenied, setBrowserStateDenied] = useState(false);

  // Refs for tracking calculation
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const prevPositionRef = useRef(null);
  const prevTimeRef = useRef(null);
  const lastSpeedRef = useRef(0);
  const startTimeRef = useRef(null);
  const alertPlayedRef = useRef(false);
  const simRafRef = useRef(null);

  // Compute unit labels & converted values
  const currentUnit = UNIT_CONFIG[unit] || UNIT_CONFIG.kmh;
  const displayedSpeed = speedKmh * currentUnit.speedFactor;
  const displayedMax = maxSpeedKmh * currentUnit.speedFactor;
  const displayedDistance = distanceMeters * currentUnit.distFactor;
  const avgKmh = elapsedSeconds > 0 ? (distanceMeters * 3.6) / elapsedSeconds : 0;
  const displayedAvg = avgKmh * currentUnit.speedFactor;
  const displayedSpeedLimit = speedLimit ? speedLimit * currentUnit.speedFactor : null;
  const isOverLimit = speedLimit !== null && speedKmh > speedLimit;

  // Selected mode
  const currentMode =
    SPEED_MODES.find((m) => speedKmh <= m.max) || SPEED_MODES[SPEED_MODES.length - 1];

  // Screen Wake Lock Handler
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockActive(false);
        });
      }
    } catch (err) {
      // Wake lock can fail if low battery or tab in background
    }
  };

  // Inspect browser geolocation permission state for guidance
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          if (result.state === "denied") {
            setBrowserStateDenied(true);
          }
          result.onchange = () => {
            if (result.state === "denied") {
              setBrowserStateDenied(true);
              setPermissionGranted(false);
              setTracking(false);
              setPermissionDeniedGuide(true);
            } else if (result.state === "granted") {
              setBrowserStateDenied(false);
              setPermissionDeniedGuide(false);
            }
          };
        })
        .catch(() => {});
    }
  }, []);

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Sound chime when exceeding speed limit
  useEffect(() => {
    if (isOverLimit && soundEnabled && tracking) {
      if (!alertPlayedRef.current) {
        playAlertChime();
        alertPlayedRef.current = true;
      }
    } else {
      alertPlayedRef.current = false;
    }
  }, [isOverLimit, soundEnabled, tracking]);

  // Bearing calculator
  const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  // Distance calculator (Haversine in meters)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
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

  // Exponential moving average filter with delta time for jitter-free speed
  const filterSpeed = (rawKmh, prevKmh, dt) => {
    if (rawKmh < 0.6) return 0;
    // Time constant tau = 0.8 seconds
    const alpha = 1 - Math.exp(-Math.max(dt, 0.1) / 0.8);
    return prevKmh + alpha * (rawKmh - prevKmh);
  };

  // Handle incoming GPS positions
  const handlePosition = useCallback(
    (pos) => {
      setStatus("GPS locked");
      setError("");
      const { latitude, longitude, accuracy, altitude: alt, heading: hdg, speed: rawSpeed } = pos.coords;
      const currentTime = pos.timestamp || Date.now();

      setGpsAccuracy(accuracy);
      if (alt !== null && alt !== undefined) setAltitude(alt);
      setCoords({ lat: latitude, lng: longitude });

      // Raw speed from GPS is in m/s
      const gpsSpeedKmh = rawSpeed !== null && rawSpeed >= 0 ? rawSpeed * 3.6 : null;

      let calculatedKmh = 0;
      let distDelta = 0;

      if (prevPositionRef.current && prevTimeRef.current) {
        const dt = Math.max((currentTime - prevTimeRef.current) / 1000, 0.1);
        distDelta = calculateDistance(
          prevPositionRef.current.lat,
          prevPositionRef.current.lng,
          latitude,
          longitude
        );

        // If GPS hardware provides speed, prefer it; otherwise calculate from delta coords
        const instantaneousKmh = gpsSpeedKmh !== null ? gpsSpeedKmh : (distDelta / dt) * 3.6;
        calculatedKmh = filterSpeed(instantaneousKmh, lastSpeedRef.current, dt);

        // Acceleration
        const accel = (calculatedKmh - lastSpeedRef.current) / dt;
        setAcceleration(accel);

        // Heading: use hardware if valid, else calculate from movement
        if (hdg !== null && !isNaN(hdg) && hdg >= 0) {
          setHeading(hdg);
        } else if (distDelta > 2) {
          const bearing = calculateBearing(
            prevPositionRef.current.lat,
            prevPositionRef.current.lng,
            latitude,
            longitude
          );
          setHeading(bearing);
        }
      } else if (gpsSpeedKmh !== null) {
        calculatedKmh = gpsSpeedKmh;
        if (hdg !== null && !isNaN(hdg) && hdg >= 0) setHeading(hdg);
      }

      const stableSpeed = calculatedKmh < 0.8 ? 0 : calculatedKmh;
      lastSpeedRef.current = stableSpeed;
      setSpeedKmh(stableSpeed);
      setMaxSpeedKmh((prev) => Math.max(prev, stableSpeed));

      if (distDelta > 0.5) {
        setDistanceMeters((prev) => prev + distDelta);
      }

      // Add to graph history
      setSpeedHistory((prev) => [...prev.slice(-39), stableSpeed * currentUnit.speedFactor]);

      // Add to trip log
      const logEntry = {
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        speed: stableSpeed * currentUnit.speedFactor,
        dist: distDelta * currentUnit.distFactor,
        lat: latitude,
        lng: longitude,
      };
      setTripLogs((prev) => [logEntry, ...prev.slice(0, 24)]);

      prevPositionRef.current = { lat: latitude, lng: longitude };
      prevTimeRef.current = currentTime;
    },
    [currentUnit]
  );

  const handleError = useCallback((err) => {
    if (err.code === 1) {
      setPermissionDeniedGuide(true);
      setBrowserStateDenied(true);
      setError("GPS location permission was denied by your browser or Windows location settings.");
      setStatus("Permission denied");
      setTracking(false);
    } else if (err.code === 2) {
      setError("Weak or unavailable GPS signal. Please move under open sky.");
      setStatus("Searching for satellites...");
    } else {
      setError("GPS timed out or unavailable.");
      setStatus("Signal error");
    }
  }, []);

  // Simulator / Test Drive Mode Animation Loop
  useEffect(() => {
    if (!simulatorMode) return;

    let lastSimTime = performance.now();
    let simLat = 37.7749;
    let simLng = -122.4194;
    let simHeading = 45;

    const simLoop = (now) => {
      const dt = Math.max((now - lastSimTime) / 1000, 0.016);
      lastSimTime = now;

      // Smooth vehicle acceleration physics towards simTargetSpeed
      const target = simTargetSpeed;
      const speedDiff = target - lastSpeedRef.current;
      const rate = speedDiff > 0 ? 18 * dt : -25 * dt; // Faster braking than acceleration
      let newSpeed = Math.abs(speedDiff) < Math.abs(rate) ? target : lastSpeedRef.current + rate;
      if (newSpeed < 0.2) newSpeed = 0;

      const accel = (newSpeed - lastSpeedRef.current) / dt;
      lastSpeedRef.current = newSpeed;

      setSpeedKmh(newSpeed);
      setMaxSpeedKmh((prev) => Math.max(prev, newSpeed));
      setAcceleration(accel);

      // Increment virtual distance (meters = speed in m/s * dt)
      const dist = (newSpeed / 3.6) * dt;
      setDistanceMeters((prev) => prev + dist);

      // Virtual heading gentle curve
      if (newSpeed > 2) {
        simHeading = (simHeading + 0.1) % 360;
        setHeading(simHeading);
        simLat += 0.000002 * (newSpeed / 50);
        simLng += 0.000002 * (newSpeed / 50);
        setCoords({ lat: simLat, lng: simLng });
      }

      setGpsAccuracy(2.4);
      setAltitude(62);
      setStatus("Simulator active (Test Drive)");

      // Periodic telemetry log for simulator
      if (!window._simLogCount) window._simLogCount = 0;
      window._simLogCount += dt;
      if (window._simLogCount >= 2.5 && newSpeed > 1) {
        window._simLogCount = 0;
        const entry = {
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          speed: newSpeed * currentUnit.speedFactor,
          dist: dist * currentUnit.distFactor,
          lat: simLat,
          lng: simLng,
        };
        setTripLogs((prev) => [entry, ...prev.slice(0, 24)]);
      }

      // Update graph
      setSpeedHistory((prev) => [...prev.slice(-39), newSpeed * currentUnit.speedFactor]);

      simRafRef.current = requestAnimationFrame(simLoop);
    };

    simRafRef.current = requestAnimationFrame(simLoop);

    return () => {
      if (simRafRef.current) cancelAnimationFrame(simRafRef.current);
    };
  }, [simulatorMode, simTargetSpeed, currentUnit]);

  // Geolocation watchPosition Effect
  useEffect(() => {
    if (!tracking || simulatorMode) return;

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser.");
      setStatus("Offline");
      setTracking(false);
      return;
    }

    setStatus("Searching for satellites...");
    setError("");
    startTimeRef.current = startTimeRef.current || Date.now();
    requestWakeLock();

    const watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000,
    });

    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      releaseWakeLock();
    };
  }, [tracking, simulatorMode, handlePosition, handleError]);

  // Trip Timer Effect
  useEffect(() => {
    if (!tracking && !simulatorMode) return;

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [tracking, simulatorMode]);

  // Start an active tracking session after permission is verified
  const startTrackingSession = () => {
    prevPositionRef.current = null;
    prevTimeRef.current = null;
    startTimeRef.current = startTimeRef.current || Date.now();
    setStatus("GPS locked. Tracking active");
    setError("");
    setTracking(true);
    requestWakeLock();
  };

  // Request browser location permission explicitly with two-stage fallback
  const requestGpsPermission = () => {
    setShowPermissionModal(false);
    setStatus("Connecting to GPS...");
    setError("");

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser.");
      setStatus("Offline");
      return;
    }

    // Two-stage location request: attempts high accuracy first, then falls back to standard accuracy
    const attemptFix = (useHighAccuracy = true) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermissionGranted(true);
          setPermissionDeniedGuide(false);
          setBrowserStateDenied(false);
          handlePosition(pos);
          startTrackingSession();
        },
        (err) => {
          // If high accuracy failed (position unavailable / timeout) on desktop/laptop without dedicated GPS, retry with standard accuracy
          if (useHighAccuracy && (err.code === 2 || err.code === 3)) {
            setStatus("Retrying with standard network location...");
            attemptFix(false);
            return;
          }

          setPermissionGranted(false);
          setTracking(false);

          if (err.code === 1) {
            // PERMISSION_DENIED
            setPermissionDeniedGuide(true);
            setBrowserStateDenied(true);
            setError("GPS location permission was denied by your browser or operating system.");
            setStatus("Permission blocked");
          } else if (err.code === 2) {
            setError("⚠️ GPS signal unavailable. Please ensure location services are enabled.");
            setStatus("No GPS fix");
          } else {
            setError("⚠️ Location request timed out.");
            setStatus("Location error");
          }
        },
        {
          enableHighAccuracy: useHighAccuracy,
          maximumAge: useHighAccuracy ? 0 : 10000,
          timeout: useHighAccuracy ? 8000 : 15000,
        }
      );
    };

    attemptFix(true);
  };

  // Start / Pause Toggle - Requires permission before starting
  const toggleTracking = () => {
    playClickBeep(750);
    if (simulatorMode) {
      setSimulatorMode(false);
    }

    if (tracking) {
      setTracking(false);
      setStatus("Tracking paused");
      releaseWakeLock();
      return;
    }

    // Require explicit permission before starting tracking!
    if (!permissionGranted) {
      setShowPermissionModal(true);
      return;
    }

    startTrackingSession();
  };

  // Reset Trip
  const resetDashboard = () => {
    playClickBeep(500);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();

    prevPositionRef.current = null;
    prevTimeRef.current = null;
    lastSpeedRef.current = 0;
    startTimeRef.current = null;

    setTracking(false);
    setPermissionGranted(false);
    setShowPermissionModal(false);
    setSimulatorMode(false);
    setSimTargetSpeed(0);
    setSpeedKmh(0);
    setMaxSpeedKmh(0);
    setDistanceMeters(0);
    setElapsedSeconds(0);
    setAcceleration(0);
    setAltitude(null);
    setHeading(null);
    setGpsAccuracy(null);
    setCoords({ lat: null, lng: null });
    setSpeedHistory([]);
    setTripLogs([]);
    setError("");
    setStatus("Ready to track");
  };

  // Unit Cycle
  const cycleUnit = () => {
    playClickBeep(650);
    const unitKeys = Object.keys(UNIT_CONFIG);
    const nextIdx = (unitKeys.indexOf(unit) + 1) % unitKeys.length;
    setUnit(unitKeys[nextIdx]);
  };

  // Toggle Test Drive Simulator
  const toggleSimulator = () => {
    playClickBeep(800);
    if (!simulatorMode) {
      setTracking(false);
      setSimulatorMode(true);
      setSimTargetSpeed(60);
      setStatus("Simulator active (Test Drive)");
      setError("");
    } else {
      setSimulatorMode(false);
      setSimTargetSpeed(0);
      setSpeedKmh(0);
      setStatus("Ready to track");
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggleTracking();
      } else if (e.key === "r" || e.key === "R") {
        resetDashboard();
      } else if (e.key === "u" || e.key === "U") {
        cycleUnit();
      } else if (e.key === "h" || e.key === "H") {
        setHudMode((prev) => !prev);
      } else if (e.key === "s" || e.key === "S") {
        toggleSimulator();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Export trip logs as CSV
  const exportTripCsv = () => {
    playClickBeep(900);
    if (tripLogs.length === 0) {
      alert("No trip records available to export yet.");
      return;
    }
    const headers = ["Timestamp", `Speed (${currentUnit.label})`, `Distance (${currentUnit.distLabel})`, "Latitude", "Longitude"];
    const rows = tripLogs.map((log) => [
      `"${log.time}"`,
      log.speed.toFixed(2),
      log.dist.toFixed(4),
      log.lat ?? "",
      log.lng ?? "",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `speedlix_trip_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format trip elapsed time
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`speedlix-shell ${hudMode ? "hud-active-mode" : ""}`}>
      {/* Top Navigation Bar */}
      <header className="speedlix-nav">
        <div className="nav-brand-group">
          <img src={logo} alt="SpeedLix" className="speedlix-logo" />
          <div className="brand-meta">
            <span className="brand-app-title">SpeedLix</span>
            <span className="brand-badge-tag">TELEMETRY PRO</span>
          </div>
        </div>

        {/* Live Status and GPS indicator */}
        <div className="nav-status-pill">
          <span
            className={`status-pulse-dot ${
              tracking || simulatorMode ? "pulse-active" : "pulse-idle"
            }`}
          />
          <span className="status-text">{status}</span>
          {wakeLockActive && (
            <span className="wakelock-pill" title="Screen awake active">
              ⚡ AWAKE
            </span>
          )}
        </div>

        {/* Global Toolbar Controls */}
        <div className="nav-tools">
          {/* Unit Switcher */}
          <button
            className="tool-btn unit-selector-btn"
            onClick={cycleUnit}
            title="Switch unit (KM/H, MPH, M/S, Knots)"
          >
            <span className="tool-btn-label">Unit</span>
            <span className="tool-btn-value font-mono">{currentUnit.label.toUpperCase()}</span>
          </button>

          {/* Sound Alert Toggle */}
          <button
            className={`tool-btn icon-tool-btn ${soundEnabled ? "tool-active" : ""}`}
            onClick={() => {
              playClickBeep(soundEnabled ? 400 : 700);
              setSoundEnabled(!soundEnabled);
            }}
            title={soundEnabled ? "Mute audio alerts" : "Enable speed limit sound alert"}
          >
            {soundEnabled ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" opacity="0.3" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
                <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* HUD Mirror Mode Toggle */}
          <button
            className={`tool-btn icon-tool-btn ${hudMode ? "tool-active hud-on" : ""}`}
            onClick={() => {
              playClickBeep(850);
              setHudMode(!hudMode);
            }}
            title="Toggle Windshield HUD Mirror Mode [H]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 15l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="tool-btn-text">HUD</span>
          </button>

          {/* Simulator / Test Drive Mode */}
          <button
            className={`tool-btn test-drive-btn ${simulatorMode ? "simulator-active" : ""}`}
            onClick={toggleSimulator}
            title="Toggle Test Drive / Simulation Mode [S]"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
            </svg>
            <span>{simulatorMode ? "Exit Sim" : "Test Drive"}</span>
          </button>
        </div>
      </header>

      {/* Simulator Control Dock (appears when Simulator Mode is on) */}
      {simulatorMode && (
        <section className="simulator-dock">
          <div className="sim-dock-header">
            <div className="sim-title-group">
              <span className="sim-badge">TEST DRIVE ENGINE</span>
              <span className="sim-help">Smooth throttle & physics simulation for desktop & indoor testing</span>
            </div>
            <div className="sim-presets">
              {[0, 30, 60, 90, 130, 170].map((spd) => (
                <button
                  key={spd}
                  className={`sim-preset-btn ${simTargetSpeed === spd ? "preset-selected" : ""}`}
                  onClick={() => setSimTargetSpeed(spd)}
                >
                  {spd === 0 ? "Brake" : `${spd} ${currentUnit.label}`}
                </button>
              ))}
            </div>
          </div>
          <div className="sim-slider-row">
            <span className="sim-slider-label">Throttle:</span>
            <input
              type="range"
              min="0"
              max={currentUnit.maxGauge}
              value={simTargetSpeed}
              onChange={(e) => setSimTargetSpeed(Number(e.target.value))}
              className="sim-slider"
            />
            <span className="sim-slider-val font-mono">{simTargetSpeed} {currentUnit.label}</span>
          </div>
        </section>
      )}

      {/* Error alert toast */}
      {error && (
        <div className="speedlix-error-toast" role="alert">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Overspeed Alert Banner */}
      {isOverLimit && (
        <div className="speedlix-overspeed-banner">
          <span className="overspeed-pulsing-icon">⚠️</span>
          <span className="overspeed-text">
            SPEED LIMIT EXCEEDED ({displayedSpeed.toFixed(0)} / {displayedSpeedLimit ? Math.round(displayedSpeedLimit) : ""} {currentUnit.label})
          </span>
        </div>
      )}

      {/* Permission Denied Recovery Helper Banner */}
      {permissionDeniedGuide && (
        <section className="permission-helper-banner">
          <div className="helper-header">
            <div className="helper-title-wrap">
              <div className="helper-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <h3 className="helper-title">Location Access Blocked</h3>
                <span className="helper-badge">BROWSER / WINDOWS PERMISSION DENIED</span>
              </div>
            </div>
            <button
              className="helper-dismiss-btn"
              onClick={() => setPermissionDeniedGuide(false)}
              title="Dismiss"
            >
              ✕ Dismiss
            </button>
          </div>

          <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: "1.5" }}>
            The browser reported that location access is currently blocked. To enable live GPS speed tracking, please follow these quick steps:
          </p>

          <div className="helper-steps-grid">
            <div className="helper-step-box">
              <span className="step-label">Step 1 · Browser Address Bar</span>
              <p className="step-instruction">
                Click the <strong>padlock (🔒)</strong> or <strong>tune (🎛️)</strong> icon on the left of <strong>localhost:3000</strong> in your browser address bar. Set <strong>Location</strong> to <strong>Allow</strong>.
              </p>
            </div>

            <div className="helper-step-box">
              <span className="step-label">Step 2 · Windows OS Settings</span>
              <p className="step-instruction">
                Open <strong>Windows Settings → Privacy & Security → Location</strong>. Make sure <strong>"Location services"</strong> and <strong>"Let desktop apps access your location"</strong> are <strong>ON</strong>.
              </p>
            </div>
          </div>

          <div className="helper-actions">
            <button
              className="helper-retry-btn"
              onClick={() => {
                setPermissionDeniedGuide(false);
                requestGpsPermission();
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>Try Again</span>
            </button>

            <button
              className="helper-sim-btn"
              onClick={() => {
                setPermissionDeniedGuide(false);
                toggleSimulator();
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
              </svg>
              <span>Continue with Test Drive (Simulation)</span>
            </button>
          </div>
        </section>
      )}

      {/* GPS Location Permission Modal */}
      {showPermissionModal && (
        <div className="permission-modal-overlay" onClick={() => setShowPermissionModal(false)}>
          <div className="permission-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="permission-icon-wrap">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>

            <h2 className="permission-modal-title">GPS Permission Required</h2>
            <p className="permission-modal-desc">
              SpeedLix needs access to your device's high-precision GPS to calculate your live speed, distance, heading, and elevation in real time.
            </p>

            {browserStateDenied && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "0.82rem",
                  color: "#fca5a5",
                  textAlign: "left",
                  lineHeight: "1.4",
                }}
              >
                ⚠️ Location is currently blocked in your browser address bar. Click the lock/tune icon next to the URL to set Location to "Allow" before proceeding.
              </div>
            )}

            <div className="permission-features-list">
              <div className="permission-feature-item">
                <span className="permission-feature-icon">✓</span>
                <span>Calculates live velocity & acceleration</span>
              </div>
              <div className="permission-feature-item">
                <span className="permission-feature-icon">✓</span>
                <span>Tracks trip distance & compass bearing</span>
              </div>
              <div className="permission-feature-item">
                <span className="permission-feature-icon">✓</span>
                <span>100% Private — processed on-device only</span>
              </div>
            </div>

            <div className="permission-modal-actions">
              <button className="permission-allow-btn" onClick={requestGpsPermission}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Allow GPS & Start Tracking</span>
              </button>

              <button
                className="permission-cancel-btn"
                onClick={() => {
                  setShowPermissionModal(false);
                  playClickBeep(450);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Cockpit Layout */}
      <main className="cockpit-grid">
        {/* HERO SECTION: The Precision SVG Speedometer */}
        <section className="cockpit-hero-card">
          <SpeedGauge
            speed={displayedSpeed}
            maxSpeed={currentUnit.maxGauge}
            unitLabel={currentUnit.label}
            speedMode={currentMode}
            acceleration={acceleration * currentUnit.speedFactor}
            speedLimit={displayedSpeedLimit}
            isOverLimit={isOverLimit}
          />

          {/* Action Bar Under Gauge */}
          <div className="cockpit-action-bar">
            <button
              className={`action-btn action-main-btn ${
                tracking ? "action-pause-state" : "action-start-state"
              }`}
              onClick={toggleTracking}
              title="Spacebar to toggle"
            >
              <span className="btn-icon">
                {tracking ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </span>
              <span>{tracking ? "Pause Trip" : "Start Tracking"}</span>
            </button>

            <button
              className="action-btn action-sub-btn"
              onClick={resetDashboard}
              title="Reset Trip Stats [R]"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Reset</span>
            </button>

            {/* Speed Limit Selector Popover / Dropdown */}
            <div className="limit-selector-dropdown">
              <span className="limit-dropdown-label">Limit:</span>
              <select
                value={speedLimit || 0}
                onChange={(e) => {
                  playClickBeep(600);
                  const val = Number(e.target.value);
                  setSpeedLimit(val === 0 ? null : val);
                }}
                className="limit-select font-mono"
              >
                <option value="0">Off</option>
                <option value="30">30 km/h</option>
                <option value="50">50 km/h</option>
                <option value="80">80 km/h</option>
                <option value="100">100 km/h</option>
                <option value="120">120 km/h</option>
                <option value="140">140 km/h</option>
              </select>
            </div>
          </div>
        </section>

        {/* METRICS & TELEMETRY SECTION */}
        <section className="cockpit-side-section">
          {/* 4 Primary Trip Stats */}
          <div className="metrics-quad-grid">
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-title">Distance</span>
                <span className="stat-icon-wrap dist-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                </span>
              </div>
              <div className="stat-card-body">
                <span className="stat-number font-mono">{displayedDistance.toFixed(2)}</span>
                <span className="stat-unit">{currentUnit.distLabel}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-title">Max Speed</span>
                <span className="stat-icon-wrap max-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </span>
              </div>
              <div className="stat-card-body">
                <span className="stat-number font-mono">{displayedMax.toFixed(1)}</span>
                <span className="stat-unit">{currentUnit.label}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-title">Average Speed</span>
                <span className="stat-icon-wrap avg-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                    <path d="M12 12l3-3" />
                  </svg>
                </span>
              </div>
              <div className="stat-card-body">
                <span className="stat-number font-mono">{displayedAvg.toFixed(1)}</span>
                <span className="stat-unit">{currentUnit.label}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-title">Trip Duration</span>
                <span className="stat-icon-wrap time-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
              </div>
              <div className="stat-card-body">
                <span className="stat-number font-mono">{formatTime(elapsedSeconds)}</span>
                <span className="stat-unit">elapsed</span>
              </div>
            </div>
          </div>

          {/* Compass, Elevation & Satellite Fix Card */}
          <CompassCard
            heading={heading}
            altitude={altitude}
            accuracy={gpsAccuracy}
            unit={unit}
            coords={coords}
          />

          {/* Live Velocity Sparkline Chart */}
          <SpeedGraph
            history={speedHistory}
            unitLabel={currentUnit.label}
            maxObserved={displayedMax}
          />
        </section>
      </main>

      {/* TRIP LOGS & TELEMETRY TABLE */}
      <section className="cockpit-footer-logs">
        <div className="logs-panel-header">
          <div className="logs-title-group">
            <span className="logs-title">Live Telemetry Feed</span>
            <span className="logs-count">{tripLogs.length} entries captured</span>
          </div>
          <div className="logs-actions">
            <button
              className="export-btn"
              onClick={exportTripCsv}
              disabled={tripLogs.length === 0}
              title="Download telemetry checkpoints as CSV"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
            {tripLogs.length > 0 && (
              <button
                className="clear-logs-btn"
                onClick={() => setTripLogs([])}
                title="Clear current log list"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="logs-table-wrapper">
          {tripLogs.length === 0 ? (
            <div className="logs-empty-state">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <p>No trip records yet. Press "Start Tracking" or "Test Drive" to record real-time velocity checkpoints.</p>
            </div>
          ) : (
            <div className="logs-table">
              <div className="logs-header-row font-mono">
                <span>TIME</span>
                <span>SPEED ({currentUnit.label})</span>
                <span>DELTA ({currentUnit.distLabel})</span>
                <span>LAT / LNG</span>
              </div>
              {tripLogs.map((item, idx) => (
                <div className="logs-data-row font-mono" key={idx}>
                  <span className="log-time-col">{item.time}</span>
                  <span className="log-speed-col">{item.speed.toFixed(1)}</span>
                  <span className="log-dist-col">{item.dist.toFixed(4)}</span>
                  <span className="log-coords-col">
                    {item.lat !== null && item.lng !== null
                      ? `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer Info & Shortcuts */}
      <footer className="cockpit-footer-bar">
        <div className="footer-shortcuts">
          <span className="shortcut-pill"><kbd>Space</kbd> Start/Pause</span>
          <span className="shortcut-pill"><kbd>R</kbd> Reset</span>
          <span className="shortcut-pill"><kbd>U</kbd> Unit</span>
          <span className="shortcut-pill"><kbd>H</kbd> HUD Mode</span>
          <span className="shortcut-pill"><kbd>S</kbd> Test Drive</span>
        </div>
        <div className="footer-copyright">
          <span>SpeedLix · High-Accuracy GPS Cockpit · Built by Om Nakrani</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
