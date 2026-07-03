# FieldCore

FieldCore is:

> A modular real-time FRC field physics simulator with sensor-level vision simulation for WPILib robot code.

FieldCore is not an AdvantageScope replacement, a pure replay viewer, or an official FIRST tool. Its value is a browser-based 3D physics world for FRC teams to test game piece, intake, shooter, and simulated vision flows against WPILib robot code through NetworkTables.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL and select `2026 REBUILT Field`.

## Current Scope

- Babylon.js scene with Havok physics initialization.
- Modular field system with a `frc2026` module using the 2026 AdvantageScope field GLB and separated Fuel game piece GLB.
- 2026 REBUILT manual-aligned field dimensions, Fuel size/mass, neutral-zone default Fuel layout, and 32 AprilTag targets.
- Robot box, intake trigger, dynamic Fuel game pieces, shooter projectile, scoring volume, and vision measurement pipeline.
- NetworkTables abstraction with a mock adapter and an NT4 WebSocket adapter scaffold.
- Integration docs aligned with a Limelight-style IO layer in WPILib robot code.

## Sources

- Official 2026 REBUILT Chinese manual: https://firstfrc.blob.core.windows.net/frc2026/Manual/Translations/2026GameManual-CS.pdf
- AdvantageScope source and custom asset behavior: https://github.com/Mechanical-Advantage/AdvantageScope
- 2026 field asset package: https://github.com/Mechanical-Advantage/AdvantageScopeAssets/releases/download/archive-v1/Field3d_2026FRCFieldV1.zip

## Important Pose Semantics

Do not use `/FieldCore/Sim/TrueRobotPose` to overwrite robot estimated pose. It is debug-only. Robot code should consume `/FieldCore/Vision/*` and call `poseEstimator.addVisionMeasurement(...)`.
