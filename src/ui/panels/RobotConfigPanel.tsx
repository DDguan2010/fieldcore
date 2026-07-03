import { useState } from "react";
import type { SimWorld } from "../../core/engine/SimWorld";
import type { RobotMotionMode } from "../../core/objects/RobotObject";

export function RobotConfigPanel({ world }: { world: SimWorld }) {
  const [, rerender] = useState(0);
  const [poseX, setPoseX] = useState(8.27);
  const [poseY, setPoseY] = useState(4.03);
  const [poseYawDeg, setPoseYawDeg] = useState(0);
  const config = world.robotConfig;
  const set = (key: keyof typeof config, value: number | string) => {
    Object.assign(config, { [key]: value });
    rerender((x) => x + 1);
  };

  return (
    <details className="panel">
      <summary><h3>Robot Config</h3></summary>
      <div className="panel-body form-grid">
        <div className="field-row">
          <label>Motion Mode</label>
          <select
            value={world.robot.motionMode}
            onChange={(event) => {
              world.robot.motionMode = event.target.value as RobotMotionMode;
              rerender((x) => x + 1);
            }}
          >
            <option value="physics-from-module-states">Physics (module states)</option>
            <option value="networktables-pose">Follow NT PoseEstimate</option>
          </select>
        </div>
        <p className="form-message">
          Physics mode: PoseEstimate initializes once, then module states/chassis speeds drive the physical robot.
          NT pose mode: robot follows /FieldCore/Robot/PoseEstimate every frame.
        </p>
        <NumberField label="Width (m)" value={config.widthMeters} onChange={(v) => set("widthMeters", v)} />
        <NumberField label="Length (m)" value={config.lengthMeters} onChange={(v) => set("lengthMeters", v)} />
        <NumberField label="Height (m)" value={config.heightMeters} onChange={(v) => set("heightMeters", v)} />
        <NumberField label="Mass (kg)" value={config.massKg} onChange={(v) => set("massKg", v)} />
        <NumberField label="Bumper Height (m)" value={config.bumperHeightMeters} onChange={(v) => set("bumperHeightMeters", v)} />
        <div className="field-row">
          <label>Color</label>
          <input value={config.color} onChange={(event) => set("color", event.target.value)} />
        </div>
        <NumberField label="Field X (m)" value={poseX} onChange={setPoseX} />
        <NumberField label="Field Y (m)" value={poseY} onChange={setPoseY} />
        <NumberField label="Yaw (deg)" value={poseYawDeg} onChange={setPoseYawDeg} />
        <button onClick={() => world.setRobotPoseFromWallBlue(poseX, poseY, (poseYawDeg * Math.PI) / 180)}>
          Apply Robot Pose
        </button>
      </div>
    </details>
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
