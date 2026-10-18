import React from "react";

/**
 * Modern SVG Radial Speedometer Gauge
 * Features a 240° sweep, glowing gradient progress arc, precision ticks,
 * animated tip marker, digital readout, and dynamic speed glow.
 */
export default function SpeedGauge({
  speed = 0,
  maxSpeed = 180,
  unitLabel = "km/h",
  speedMode,
  acceleration = 0,
  speedLimit = null,
  isOverLimit = false,
}) {
  // Clamp display speed between 0 and maxSpeed for the arc
  const clampedSpeed = Math.max(0, Math.min(speed, maxSpeed));
  const progressRatio = maxSpeed > 0 ? clampedSpeed / maxSpeed : 0;

  // Arc geometry
  // 240-degree sweep: from 150 deg (bottom-left) to 390 deg (bottom-right)
  const radius = 130;
  const cx = 170;
  const cy = 170;
  const arcSweep = 240;
  const startAngle = 150; // degrees
  const arcLength = (arcSweep / 360) * (2 * Math.PI * radius);
  const strokeDashoffset = arcLength * (1 - progressRatio);

  // Helper to convert polar coordinates to cartesian SVG coords
  const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  // SVG arc path generator
  const describeArc = (x, y, r, startAng, endAng) => {
    const start = polarToCartesian(x, y, r, endAng);
    const end = polarToCartesian(x, y, r, startAng);
    const largeArcFlag = endAng - startAng <= 180 ? "0" : "1";
    return [
      "M",
      start.x,
      start.y,
      "A",
      r,
      r,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(" ");
  };

  // Base background track arc
  const trackPath = describeArc(cx, cy, radius, startAngle, startAngle + arcSweep);

  // Tip indicator position on active arc
  const currentAngle = startAngle + arcSweep * progressRatio;
  const tipPos = polarToCartesian(cx, cy, radius, currentAngle);

  // Generate clean automotive tick markers with round intervals
  let tickStep = 20;
  if (maxSpeed <= 50) tickStep = 10;
  else if (maxSpeed <= 120) tickStep = 20;
  else if (maxSpeed <= 200) tickStep = 20;

  const ticks = [];
  for (let val = 0; val <= maxSpeed; val += tickStep) {
    const ratio = val / maxSpeed;
    const tickAngle = startAngle + ratio * arcSweep;
    const pOuter = polarToCartesian(cx, cy, radius + 14, tickAngle);
    const pInner = polarToCartesian(cx, cy, radius + 6, tickAngle);
    const pText = polarToCartesian(cx, cy, radius + 27, tickAngle);

    ticks.push({
      value: val,
      isMajor: true,
      x1: pInner.x,
      y1: pInner.y,
      x2: pOuter.x,
      y2: pOuter.y,
      tx: pText.x,
      ty: pText.y,
    });

    // Sub-tick (minor midway marker)
    if (val + tickStep <= maxSpeed) {
      const midVal = val + tickStep / 2;
      const subRatio = midVal / maxSpeed;
      const subAngle = startAngle + subRatio * arcSweep;
      const subOuter = polarToCartesian(cx, cy, radius + 11, subAngle);
      const subInner = polarToCartesian(cx, cy, radius + 6, subAngle);
      ticks.push({
        value: null,
        isMajor: false,
        x1: subInner.x,
        y1: subInner.y,
        x2: subOuter.x,
        y2: subOuter.y,
      });
    }
  }

  // Format acceleration
  const accelText =
    acceleration > 0.1
      ? `+${acceleration.toFixed(1)}`
      : acceleration < -0.1
      ? `${acceleration.toFixed(1)}`
      : "0.0";
  const accelClass =
    acceleration > 0.1 ? "accel-pos" : acceleration < -0.1 ? "accel-neg" : "accel-zero";

  // Dynamic glow color
  const glowColor = isOverLimit
    ? "rgba(239, 68, 68, 0.4)"
    : speedMode?.color
    ? `${speedMode.color}33`
    : "rgba(56, 189, 248, 0.25)";

  return (
    <div className={`gauge-container ${isOverLimit ? "gauge-overspeed" : ""}`}>
      {/* Ambient background glow */}
      <div
        className="gauge-ambient-glow"
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
        }}
      />

      <svg
        viewBox="0 0 340 340"
        className="gauge-svg"
        aria-label={`Current speed: ${speed.toFixed(1)} ${unitLabel}`}
      >
        <defs>
          {/* Active speed gradient */}
          <linearGradient id="speedArcGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="35%" stopColor="#10b981" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="arcGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer decorative ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius + 32}
          fill="none"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth="1"
          strokeDasharray="3 6"
        />

        {/* Inner track border ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius - 12}
          fill="none"
          stroke="rgba(255, 255, 255, 0.03)"
          strokeWidth="1"
        />

        {/* Background track arc */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.09)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Active glowing progress arc */}
        <path
          d={trackPath}
          fill="none"
          stroke="url(#speedArcGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={strokeDashoffset}
          filter="url(#arcGlow)"
          className="gauge-active-arc"
        />

        {/* Tick markers */}
        {ticks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={
                t.isMajor
                  ? "rgba(255, 255, 255, 0.45)"
                  : "rgba(255, 255, 255, 0.18)"
              }
              strokeWidth={t.isMajor ? "2" : "1"}
              strokeLinecap="round"
            />
            {t.isMajor && (
              <text
                x={t.tx}
                y={t.ty}
                textAnchor="middle"
                dominantBaseline="central"
                className="gauge-tick-text"
              >
                {t.value}
              </text>
            )}
          </g>
        ))}

        {/* Glowing tip indicator dot */}
        {clampedSpeed > 0.5 && (
          <g>
            <circle
              cx={tipPos.x}
              cy={tipPos.y}
              r="7"
              fill="#ffffff"
              filter="url(#arcGlow)"
            />
            <circle
              cx={tipPos.x}
              cy={tipPos.y}
              r="3.5"
              fill={isOverLimit ? "#ef4444" : "#38bdf8"}
            />
          </g>
        )}
      </svg>

      {/* Central Digital HUD Display */}
      <div className="gauge-center-hud">
        {/* Speed Mode pill */}
        <div
          className="gauge-mode-chip"
          style={{
            borderColor: speedMode?.color || "#38bdf8",
            color: speedMode?.color || "#38bdf8",
          }}
        >
          <span
            className="gauge-mode-dot"
            style={{ background: speedMode?.color || "#38bdf8" }}
          />
          {speedMode?.label || "IDLE"}
        </div>

        {/* Massive numeric speed readout */}
        <div className="gauge-digital-speed">
          <span className="gauge-speed-number">{speed.toFixed(1)}</span>
        </div>

        {/* Unit badge */}
        <div className="gauge-unit-badge">{unitLabel}</div>

        {/* Telemetry pill (Acceleration & Speed Limit) */}
        <div className="gauge-sub-pills">
          <span className={`gauge-accel-pill ${accelClass}`} title="Rate of acceleration">
            {accelText} {unitLabel}/s
          </span>

          {speedLimit && (
            <span
              className={`gauge-limit-pill ${isOverLimit ? "limit-exceeded" : ""}`}
              title={`Speed Limit: ${Math.round(speedLimit)} ${unitLabel}`}
            >
              LIMIT {Math.round(speedLimit)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
