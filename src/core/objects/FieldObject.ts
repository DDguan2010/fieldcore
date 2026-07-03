import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { zeroPose3d } from "../math/pose";
import { BaseSimObject } from "./SimObject";

export class FieldObject extends BaseSimObject {
  constructor(id: string, mesh: Mesh, moduleId: string) {
    super(id, "field", zeroPose3d(), { label: id, moduleId }, mesh);
  }
}
