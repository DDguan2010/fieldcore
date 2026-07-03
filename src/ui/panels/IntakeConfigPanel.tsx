import { useState } from "react";
import { degreesToRadians, radiansToDegrees } from "../../core/math/pose";
import type { SimWorld } from "../../core/engine/SimWorld";

export function IntakeConfigPanel({ world }: { world: SimWorld }) {
  const [, rerender] = useState(0);
  const config = world.intakeConfig;
  const refresh = () => rerender((x) => x + 1);

  return (
    <details className="panel">
      <summary><h3>Intake Config</h3></summary>
      <div className="panel-body form-grid">
        <TextField label="Enabled Topic" value={config.enabledTopic} onChange={(value) => { config.enabledTopic = value; refresh(); }} />
        <NumberField label="Width (m)" value={config.sizeMeters.width} onChange={(value) => { config.sizeMeters.width = value; refresh(); }} />
        <NumberField label="Length (m)" value={config.sizeMeters.length} onChange={(value) => { config.sizeMeters.length = value; refresh(); }} />
        <NumberField label="Height (m)" value={config.sizeMeters.height} onChange={(value) => { config.sizeMeters.height = value; refresh(); }} />
        <NumberField label="Offset X (m)" value={config.offsetFromRobotCenter.translation.x} onChange={(value) => { config.offsetFromRobotCenter.translation.x = value; refresh(); }} />
        <NumberField label="Offset Y (m)" value={config.offsetFromRobotCenter.translation.y} onChange={(value) => { config.offsetFromRobotCenter.translation.y = value; refresh(); }} />
        <NumberField label="Offset Z (m)" value={config.offsetFromRobotCenter.translation.z} onChange={(value) => { config.offsetFromRobotCenter.translation.z = value; refresh(); }} />
        <NumberField label="Yaw Offset (deg)" value={radiansToDegrees(config.offsetFromRobotCenter.rotation.yaw)} onChange={(value) => { config.offsetFromRobotCenter.rotation.yaw = degreesToRadians(value); refresh(); }} />
        <NumberField label="Visual Yaw Offset (deg)" value={radiansToDegrees(config.visualYawOffsetRad)} onChange={(value) => { config.visualYawOffsetRad = degreesToRadians(value); refresh(); }} />
        <NumberField label="Capture Delay (s)" value={config.captureDelaySeconds} onChange={(value) => { config.captureDelaySeconds = value; refresh(); }} />
        <NumberField label="Max Held Count (0 = unlimited)" value={config.maxHeldCount} onChange={(value) => { config.maxHeldCount = value; refresh(); }} />
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
