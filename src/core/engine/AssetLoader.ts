import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

export interface GlbLoadResult {
  meshes: AbstractMesh[];
  loaded: boolean;
  error?: string;
}

export async function tryLoadGlb(scene: Scene, url: string): Promise<GlbLoadResult> {
  try {
    const lastSlash = url.lastIndexOf("/");
    const rootUrl = lastSlash >= 0 ? `${url.slice(0, lastSlash + 1)}` : "";
    const fileName = lastSlash >= 0 ? url.slice(lastSlash + 1) : url;
    const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
    return { meshes: result.meshes, loaded: true };
  } catch (error) {
    return {
      meshes: [],
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
