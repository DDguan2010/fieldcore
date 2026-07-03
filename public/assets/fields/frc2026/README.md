# frc2026 Assets

Asset paths:

- `field.glb` - 2026 REBUILT field model from the AdvantageScope asset package.
- `gamepiece.glb` - separated Fuel model from the same package.

The runtime still keeps procedural fallback geometry for development resilience, but the normal path loads these GLB files.

FieldCore mirrors AdvantageScope's 2026 asset organization: staged Fuel meshes embedded in `field.glb` are hidden at load time, and `gamepiece.glb` is used for dynamic Fuel bodies. AprilTag poses are generated from the AdvantageScope `config.json` and transformed into the FieldCore/WPILib meter-based coordinate convention.

Source package:

https://github.com/Mechanical-Advantage/AdvantageScopeAssets/releases/download/archive-v1/Field3d_2026FRCFieldV1.zip
