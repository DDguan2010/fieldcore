# Field Module Authoring

Field modules implement `FieldModule` and provide assets, field objects, default game pieces, scoring rules, and vision targets.

```ts
export interface FieldModule {
  id: string;
  name: string;
  season: number;
  gameName: string;

  loadAssets(ctx: AssetContext): Promise<FieldAssets>;
  createField(ctx: FieldCreationContext): FieldInstance;
  createDefaultGamePieces(ctx: FieldCreationContext): GamePieceInstance[];
  createScoringRules(): ScoringRule[];
  createVisionTargets(): VisionTarget[];
}
```

Core engine code must not hard-code season-specific rules. Keep field dimensions, scoring volumes, game piece dimensions, and AprilTag layouts in module config files.

For official FRC fields, verify dimensions and tag poses against FIRST game manuals, field drawings, CAD/STEP files, and AprilTag documentation.
