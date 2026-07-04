import { useState } from "react";
import type { SimWorld } from "../../core/engine/SimWorld";

export function ShooterConfigPanel({ world }: { world: SimWorld }) {
  const [, rerender] = useState(0);
  const config = world.shooterConfig;
  const refresh = () => rerender((x) => x + 1);

  return (
    <details className="panel">
      <summary><h3>Shooter Config</h3></summary>
      <div className="panel-body form-grid">
        <TextField label="Enabled Topic" value={config.enabledTopic} onChange={(value) => { config.enabledTopic = value; refresh(); }} />
        <TextField label="Shoot Command Topic" value={config.shootCommandTopic} onChange={(value) => { config.shootCommandTopic = value; refresh(); }} />
        <NumberField label="Base Speed (m/s)" value={config.baseLaunchSpeedMetersPerSecond} onChange={(value) => { config.baseLaunchSpeedMetersPerSecond = value; refresh(); }} />
        <NumberField label="RPM Scale" value={config.rpmToLaunchSpeedScale} onChange={(value) => { config.rpmToLaunchSpeedScale = value; refresh(); }} />
        <NumberField label="Shots Per Second" value={config.shotsPerSecond} onChange={(value) => { config.shotsPerSecond = value; refresh(); }} />
        <NumberField label="Shot Arc Angle (deg)" value={config.launchAngleOffsetDeg} onChange={(value) => { config.launchAngleOffsetDeg = value; refresh(); }} />
        <NumberField label="Spread Std Dev (deg)" value={config.spreadStdDevDeg} onChange={(value) => { config.spreadStdDevDeg = value; refresh(); }} />
        <NumberField label="Latency (s)" value={config.latencySeconds} onChange={(value) => { config.latencySeconds = value; refresh(); }} />
      </div>
    </details>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input type="number" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}
