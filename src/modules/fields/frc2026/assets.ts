import type { AssetContext, FieldAssets } from "../../../core/modules/FieldModule";

export async function loadFrc2026Assets(ctx: AssetContext): Promise<FieldAssets> {
  return {
    fieldModelUrl: `${ctx.baseUrl}/assets/fields/frc2026/field.glb`,
    gamePieceModelUrl: `${ctx.baseUrl}/assets/fields/frc2026/gamepiece.glb`,
  };
}
