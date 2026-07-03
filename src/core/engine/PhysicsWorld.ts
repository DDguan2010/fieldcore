import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/pass.fragment";
import "@babylonjs/core/Shaders/pbr.fragment";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";

export class PhysicsWorld {
  readonly engine: Engine;
  readonly scene: Scene;
  physicsReady = false;
  physicsError: string | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });
    this.scene = new Scene(this.engine);
  }

  async initializePhysics() {
    try {
      const havok = await HavokPhysics({
        locateFile: () => "/assets/havok/HavokPhysics.wasm",
      });
      const plugin = new HavokPlugin(true, havok);
      this.scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
      this.physicsReady = true;
    } catch (error) {
      this.physicsError = error instanceof Error ? error.message : String(error);
      this.physicsReady = false;
    }
  }

  dispose() {
    this.scene.dispose();
    this.engine.dispose();
  }
}
