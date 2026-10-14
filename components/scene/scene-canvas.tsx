"use client";

import { useEffect, useRef } from "react";
import type { HolmesScene } from "./holmes-scene";

/**
 * Mounts the WebGL scene behind the interface. Three.js is loaded lazily so
 * the first paint (title + search box) never waits on 700 KB of 3D engine.
 */
export function SceneCanvas({ onReady }: { onReady: (scene: HolmesScene | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let scene: HolmesScene | null = null;
    let cancelled = false;
    import("./holmes-scene")
      .then(({ HolmesScene }) => {
        if (cancelled || !ref.current) return;
        try {
          scene = new HolmesScene(ref.current);
          onReady(scene);
        } catch {
          onReady(null); // no WebGL: the interface works without the scene
        }
      })
      .catch(() => onReady(null));
    return () => {
      cancelled = true;
      scene?.dispose();
      onReady(null);
    };
  }, [onReady]);

  return <canvas ref={ref} className="scene-canvas" aria-hidden="true" />;
}
