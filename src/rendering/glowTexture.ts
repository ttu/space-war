import * as THREE from 'three';

let glow: THREE.Texture | null = null;
let sphere: THREE.Texture | null = null;

/** Soft white radial falloff; tint via material color, use with AdditiveBlending. */
export function getGlowTexture(): THREE.Texture {
  if (glow) return glow;
  glow = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.2, 'rgba(255,255,255,0.55)'],
    [0.5, 'rgba(255,255,255,0.15)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  return glow;
}

/** Disc shading: bright upper-left highlight fading to a dark limb; tint via material color. */
export function getSphereTexture(): THREE.Texture {
  if (sphere) return sphere;
  sphere = radialTexture(
    [
      [0, 'rgb(255,255,255)'],
      [0.6, 'rgb(150,150,150)'],
      [1, 'rgb(40,40,40)'],
    ],
    0.35,
  );
  return sphere;
}

function radialTexture(stops: [number, string][], highlightOffset = 0.5): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const h = size * highlightOffset;
  const grad = ctx.createRadialGradient(h, h, 0, size / 2, size / 2, size / 2);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
