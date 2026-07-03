import type { FieldCreationContext, FieldModule } from "../../../core/modules/FieldModule";
import { ModuleRegistry } from "../../../core/modules/ModuleRegistry";
import { loadFrc2026Assets } from "./assets";
import rulesConfig from "./rules.config.json";
import aprilTagsConfig from "./aprilTags.config.json";
import stagedFuelConfig from "./stagedFuel.config.json";

export const frc2026FieldModule: FieldModule = {
  id: "frc2026",
  name: "2026 REBUILT Field",
  season: 2026,
  gameName: "REBUILT",

  loadAssets: loadFrc2026Assets,

  createField(_ctx: FieldCreationContext) {
    return {
      id: "frc2026-field-instance",
      fieldObjectIds: ["field-floor", "field-wall-blue", "field-wall-red", "field-wall-left", "field-wall-right"],
      scoringVolumes: rulesConfig.scoringVolumes,
    };
  },

  createDefaultGamePieces(_ctx: FieldCreationContext) {
    return stagedFuelConfig.pieces.map((piece) => ({
      id: piece.id,
      pose: {
        translation: {
          ...piece.pose.translation,
          z: -piece.pose.translation.z,
        },
        rotation: {
          ...piece.pose.rotation,
          yaw: -piece.pose.rotation.yaw,
        },
      },
    }));
  },

  createScoringRules() {
    return [
      {
        id: "placeholder-score",
        label: "Placeholder score when a shot game piece enters a scoring volume",
      },
    ];
  },

  createVisionTargets() {
    return aprilTagsConfig.targets.map((tag) => ({
      id: tag.id,
      pose: tag.pose,
      sizeMeters: tag.sizeMeters,
    }));
  },
};

export const moduleRegistry = new ModuleRegistry();
moduleRegistry.register(frc2026FieldModule);
