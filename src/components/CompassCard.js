import React from "react";

/**
 * Compass & Satellite Telemetry Card
 * Shows heading bearing, rotating compass dial, altitude, and GPS fix quality.
 */
export default function CompassCard({
  heading = null,
  altitude = null,
  accuracy = null,
  unit = "kmh",
  coords = { lat: null, lng: null },
}) {
  // Compute cardinal direction from heading degrees
  const getCardinal = (deg) => {
    if (deg === null || isNaN(deg)) return "—";
    const cardinals = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(((deg % 360) / 22.5)) % 16;
    return cardinals[index];
  };

  const cardinal = getCardinal(heading);
  const displayHeading = heading !== null && !isNaN(heading) ? `${Math.round(heading)}°` : "—";

  // Altitude formatting
  const displayAltitude = altitude !== null
    ? unit === "mph"
      ? `${(altitude * 3.28084).toFixed(0)} ft`
      : `${altitude.toFixed(0)} m`
    : "—";

  // GPS Accuracy quality tier
  let accuracyBadge = { label: "No Fix", color: "#94a3b8", quality: "idle" };
  if (accuracy !== null) {
    if (accuracy <= 6) {
      accuracyBadge = { label: `±${accuracy.toFixed(1)}m · Precision High`, color: "#10b981", quality: "excellent" };
    } else if (accuracy <= 15) {
      accuracyBadge = { label: `±${accuracy.toFixed(1)}m · Good`, color: "#38bdf8", quality: "good" };
    } else {
      accuracyBadge = { label: `±${accuracy.toFixed(0)}m · Weak`, color: "#f59e0b", quality: "weak" };
    }
  }

  return (
    <div className="telemetry-card compass-telemetry-card">
      <div className="compass-visual-section">
        {/* Compass dial */}
        <div className="compass-dial-wrap">
          <div
            className="compass-dial"
            style={{
              transform: `rotate(${heading !== null ? -heading : 0}deg)`,
              transition: "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            <span className="compass-point point-n">N</span>
            <span className="compass-point point-e">E</span>
            <span className="compass-point point-s">S</span>
            <span className="compass-point point-w">W</span>
            <div className="compass-center-cross" />
          </div>
          {/* Static heading arrow pointer */}
          <div className="compass-needle-pointer" />
        </div>

        <div className="compass-details">
          <div className="compass-heading-primary">
            <span className="heading-degrees">{displayHeading}</span>
            <span className="heading-cardinal">{cardinal}</span>
          </div>
          <span className="telemetry-label">Bearing / Heading</span>
        </div>
      </div>

      <div className="telemetry-subgrid">
        <div className="subgrid-item">
          <span className="subgrid-label">Altitude</span>
          <span className="subgrid-value">{displayAltitude}</span>
        </div>

        <div className="subgrid-item">
          <span className="subgrid-label">GPS Quality</span>
          <span className="subgrid-badge" style={{ color: accuracyBadge.color, borderColor: `${accuracyBadge.color}33` }}>
            <span className="badge-dot" style={{ background: accuracyBadge.color }} />
            {accuracyBadge.label}
          </span>
        </div>

        <div className="subgrid-item full-width">
          <span className="subgrid-label">Coordinates</span>
          <span className="subgrid-coords font-mono">
            {coords.lat !== null && coords.lng !== null
              ? `${coords.lat.toFixed(5)}°, ${coords.lng.toFixed(5)}°`
              : "Acquiring satellites..."}
          </span>
        </div>
      </div>
    </div>
  );
}
