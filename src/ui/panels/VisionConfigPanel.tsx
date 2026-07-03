import { useState } from "react";
import type { SimWorld } from "../../core/engine/SimWorld";

export function VisionConfigPanel({ world }: { world: SimWorld }) {
  const [, rerender] = useState(0);
  const config = world.visionConfig;
  const refresh = () => rerender((x) => x + 1);

  return (
    <details className="panel">
      <summary><h3>Vision Config</h3></summary>
      <div className="panel-body form-grid">
        <TextField label="Limelight Table" value={config.limelightTableName} onChange={(value) => { config.limelightTableName = value; refresh(); }} />
        <NumberField label="Horizontal FOV (deg)" value={config.horizontalFovDeg} onChange={(value) => { config.horizontalFovDeg = value; refresh(); }} />
        <NumberField label="Vertical FOV (deg)" value={config.verticalFovDeg} onChange={(value) => { config.verticalFovDeg = value; refresh(); }} />
        <NumberField label="Max Distance (m)" value={config.maxDistanceMeters} onChange={(value) => { config.maxDistanceMeters = value; refresh(); }} />
        <NumberField label="Latency Mean (s)" value={config.latencyMeanSeconds} onChange={(value) => { config.latencyMeanSeconds = value; refresh(); }} />
        <NumberField label="Latency Std Dev (s)" value={config.latencyStdDevSeconds} onChange={(value) => { config.latencyStdDevSeconds = value; refresh(); }} />
        <NumberField label="Position Noise (m)" value={config.positionStdDevMeters} onChange={(value) => { config.positionStdDevMeters = value; refresh(); }} />
        <NumberField label="Rotation Noise (rad)" value={config.rotationStdDevRad} onChange={(value) => { config.rotationStdDevRad = value; refresh(); }} />
        <NumberField label="Dropout Probability" value={config.dropoutProbability} onChange={(value) => { config.dropoutProbability = value; refresh(); }} />
        <button onClick={() => { config.continuousPoseOutput = !config.continuousPoseOutput; refresh(); }}>
          Continuous Pose {config.continuousPoseOutput ? "On" : "Off"}
        </button>
        <button onClick={() => { config.noiseEnabled = !config.noiseEnabled; refresh(); }}>
          Noise {config.noiseEnabled ? "On" : "Off"}
        </button>
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
