import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// THREE.CapsuleGeometry duplicates every UV-seam vertex (measured: 194 boundary
// edges on the default radius/segments below) -- same benign pattern as box/
// cylinder/sphere/torus, all of which weld cleanly to 0 given a CORRECT weld.
// (A naive vertex-only mergeVertices() reports 64 'non-manifold' edges here, but
// that is a counting artifact, not a real defect: it double-counts a handful of
// near-pole triangles that become degenerate once two of their three corners
// coincide -- confirmed by replicating subdivideCatmullClark's own degenerate-
// triangle-aware vertex identity, which finds a perfectly ordinary 2-manifold.)
// A capsule is the primary shape for skinned limbs/torso (PLAN_1.5), and skinning
// weight computation is O(vertices x bones), so fewer, guaranteed-simple vertices
// is worth having regardless -- authored as a deterministic, closed-by-
// construction mesh instead: shared pole vertices, and
// the radial index taken `% radialSegments` so the seam is never a duplicate
// vertex in the first place, rather than something to weld away afterward.
// Adapted from forge/stage5_rig/emit_rig.py's buildWatertightCapsule (verified
// there: 0 boundary edges, 0 non-manifold edges, deterministic across repeated
// runs) -- ported here rather than imported because this factory and the rig
// emitter are separate generated-output surfaces with no shared runtime module;
// see forge/tests/test_primitive_watertightness.py for the measured proof, and
// coordinate with the rig owner before changing either copy independently.
function buildWatertightCapsule(
  radius: number,
  cylLength: number,
  capSegments: number,
  radialSegments: number,
  heightSegments: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const halfCyl = cylLength / 2;
  const totalSpan = 2 * (Math.PI / 2 * radius) + Math.max(0, cylLength);
  const vOf = (fromBottom: number) => (totalSpan > 0 ? fromBottom / totalSpan : 0);

  const bottomPoleIndex = positions.length / 3;
  positions.push(0, -halfCyl - radius, 0);
  uvs.push(0.5, vOf(0));

  const ringStarts: number[] = [];
  const ringV: number[] = [];
  for (let ring = 1; ring <= capSegments; ring += 1) {
    const phi = (Math.PI / 2) * (ring / capSegments);
    const y = -halfCyl - radius * Math.cos(phi);
    const r = radius * Math.sin(phi);
    const start = positions.length / 3;
    ringStarts.push(start);
    ringV.push(vOf(radius * phi));
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const theta = (radial / radialSegments) * Math.PI * 2;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
      uvs.push(radial / radialSegments, vOf(radius * phi));
    }
  }

  const cylinderRingStarts: number[] = [];
  if (cylLength > 0) {
    for (let step = 1; step <= heightSegments; step += 1) {
      const y = -halfCyl + (cylLength * step) / heightSegments;
      const start = positions.length / 3;
      cylinderRingStarts.push(start);
      const v = vOf(radius * (Math.PI / 2) + halfCyl + y);
      for (let radial = 0; radial < radialSegments; radial += 1) {
        const theta = (radial / radialSegments) * Math.PI * 2;
        positions.push(radius * Math.cos(theta), y, radius * Math.sin(theta));
        uvs.push(radial / radialSegments, v);
      }
    }
  }

  const topRingStarts: number[] = [];
  for (let ring = capSegments - 1; ring >= 1; ring -= 1) {
    const phi = (Math.PI / 2) * (ring / capSegments);
    const y = halfCyl + radius * Math.cos(phi);
    const r = radius * Math.sin(phi);
    const start = positions.length / 3;
    topRingStarts.push(start);
    const v = vOf(radius * (Math.PI / 2) + Math.max(0, cylLength) + radius * (Math.PI / 2 - phi));
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const theta = (radial / radialSegments) * Math.PI * 2;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
      uvs.push(radial / radialSegments, v);
    }
  }

  const topPoleIndex = positions.length / 3;
  positions.push(0, halfCyl + radius, 0);
  uvs.push(0.5, vOf(totalSpan));

  const firstBottomRing = ringStarts[0];
  for (let radial = 0; radial < radialSegments; radial += 1) {
    const next = (radial + 1) % radialSegments;
    indices.push(bottomPoleIndex, firstBottomRing + radial, firstBottomRing + next);
  }

  const allRings = [...ringStarts, ...cylinderRingStarts, ...topRingStarts];
  for (let i = 0; i < allRings.length - 1; i += 1) {
    const a = allRings[i];
    const b = allRings[i + 1];
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      indices.push(a + radial, a + next, b + next);
      indices.push(a + radial, b + next, b + radial);
    }
  }

  const lastRing = allRings[allRings.length - 1];
  for (let radial = 0; radial < radialSegments; radial += 1) {
    const next = (radial + 1) % radialSegments;
    indices.push(topPoleIndex, lastRing + next, lastRing + radial);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

// Plan 1.3 F.6 — sweep a thin 2D cross-section along a 3D spine so a curved
// form (hooked blade, handle) reads correctly from EVERY camera angle, not just
// the reference angle a flat extrude happens to match. Uses ExtrudeGeometry's
// native extrudePath; bevelEnabled: false keeps sharp tips (same rule as F.5).
function buildCurveSweepGeometry(
  sweep: { spine: [number, number, number][]; crossSection: { points: [number, number][] }; closed?: boolean },
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const cs = sweep.crossSection.points;
  if (cs.length > 0) {
    shape.moveTo(cs[0][0], cs[0][1]);
    for (let i = 1; i < cs.length; i += 1) shape.lineTo(cs[i][0], cs[i][1]);
    shape.closePath();
  }
  const spine = sweep.spine.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const path = new THREE.CatmullRomCurve3(spine, sweep.closed ?? false);
  return new THREE.ExtrudeGeometry(shape, {
    extrudePath: path,
    steps: Math.max(24, spine.length * 8),
    bevelEnabled: false,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Operator Rabbit
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createOperatorRabbitModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Operator Rabbit";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "SKIPPED: flat-colour textureless mascot route; no photo projection. Proportions/silhouette derived from the admitted front mask."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["matte-white-resin"] = createSculptMaterial(
    "matte-white-resin",
    {"id": "matte-white-resin", "name": "Matte white resin (body)", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#F5F5F4", "color": "#F5F5F4", "albedo": {"dominant": "#F5F5F4", "secondary": ["#EDEAE2", "#FFFFFF"], "samplingNotes": "palette extraction on operator-rabbit-front.png isolated mask (deterministic low-pass isolator)"}, "colorVariation": {"palette": ["#F5F5F4", "#EDEAE2", "#FFFFFF"], "pattern": "flat", "amplitude": 0.03, "heightCorrelation": 0.0}, "roughness": {"base": 0.62, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "chest-soft-ao", "description": "Soft contact shading under ear anchors and around the neck collar", "type": "multiply", "weights": {"head": 0.12, "torso": 0.1}, "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.4, "grazing": 0.2}}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Matte white resin (body); sampled from operator-rabbit-front.png.", "textureless": {"declared": true, "evidence": ["operator-rabbit-front.png flat-colour brand-shape mascot: foreground 0.1854, no grain/print/pores in visible faces", "intake assessment records palette-only albedo (white/gray body, emerald headset, soft pink inner ears); identity is silhouette/proportion/colour boundaries", "styleHeads 2.0 chibi figurine route  —  surface is smooth primer-resin with zero relief; no texel-bearing surface expected"]}},
    options
  );
  materialMap["soft-pink-inner-ear"] = createSculptMaterial(
    "soft-pink-inner-ear",
    {"id": "soft-pink-inner-ear", "name": "Soft pink inner ear", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#B79D9A", "color": "#B79D9A", "albedo": {"dominant": "#B79D9A", "secondary": ["#C7A7A2", "#9B8580"], "samplingNotes": "palette extraction on operator-rabbit-front.png isolated mask (deterministic low-pass isolator)"}, "colorVariation": {"palette": ["#B79D9A", "#C7A7A2", "#9B8580"], "pattern": "flat", "amplitude": 0.03, "heightCorrelation": 0.0}, "roughness": {"base": 0.5, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "inner-ear-gather", "description": "Converging gather shading inside the ear void", "type": "multiply", "weights": {"inner-ear-left": 0.18, "inner-ear-right": 0.18}, "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.1}}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Soft pink inner ear; sampled from operator-rabbit-front.png.", "textureless": {"declared": true, "evidence": ["operator-rabbit-front.png flat-colour brand-shape mascot: foreground 0.1854, no grain/print/pores in visible faces", "intake assessment records palette-only albedo (white/gray body, emerald headset, soft pink inner ears); identity is silhouette/proportion/colour boundaries", "styleHeads 2.0 chibi figurine route  —  surface is smooth primer-resin with zero relief; no texel-bearing surface expected"]}},
    options
  );
  materialMap["emerald-headset"] = createSculptMaterial(
    "emerald-headset",
    {"id": "emerald-headset", "name": "Emerald headset plastic", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#157C50", "color": "#157C50", "albedo": {"dominant": "#157C50", "secondary": ["#0F5C39", "#1B8F5F"], "samplingNotes": "palette extraction on operator-rabbit-front.png isolated mask (deterministic low-pass isolator)"}, "colorVariation": {"palette": ["#157C50", "#0F5C39", "#1B8F5F"], "pattern": "flat", "amplitude": 0.03, "heightCorrelation": 0.0}, "roughness": {"base": 0.3, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "cup-inner-shadow", "description": "Radial falloff inside each cup opening toward the ear seat", "type": "multiply", "weights": {"cup-left": 0.3, "cup-right": 0.3}, "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.1}}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Emerald headset plastic; sampled from operator-rabbit-front.png.", "textureless": {"declared": true, "evidence": ["operator-rabbit-front.png flat-colour brand-shape mascot: foreground 0.1854, no grain/print/pores in visible faces", "intake assessment records palette-only albedo (white/gray body, emerald headset, soft pink inner ears); identity is silhouette/proportion/colour boundaries", "styleHeads 2.0 chibi figurine route  —  surface is smooth primer-resin with zero relief; no texel-bearing surface expected"]}},
    options
  );
  materialMap["headset-padding"] = createSculptMaterial(
    "headset-padding",
    {"id": "headset-padding", "name": "Dark headset padding / mic", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#0C2E1D", "color": "#0C2E1D", "albedo": {"dominant": "#0C2E1D", "secondary": ["#1A5C38", "#081F14"], "samplingNotes": "palette extraction on operator-rabbit-front.png isolated mask (deterministic low-pass isolator)"}, "colorVariation": {"palette": ["#0C2E1D", "#1A5C38", "#081F14"], "pattern": "flat", "amplitude": 0.03, "heightCorrelation": 0.0}, "roughness": {"base": 0.55, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "band-under-sweep", "description": "Sweep shadow under the band crown where it rests on the head", "type": "multiply", "weights": {"headband": 0.2}, "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.4, "grazing": 0.2}}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Dark headset padding / mic; sampled from operator-rabbit-front.png.", "textureless": {"declared": true, "evidence": ["operator-rabbit-front.png flat-colour brand-shape mascot: foreground 0.1854, no grain/print/pores in visible faces", "intake assessment records palette-only albedo (white/gray body, emerald headset, soft pink inner ears); identity is silhouette/proportion/colour boundaries", "styleHeads 2.0 chibi figurine route  —  surface is smooth primer-resin with zero relief; no texel-bearing surface expected"]}},
    options
  );
  materialMap["ink-eye"] = createSculptMaterial(
    "ink-eye",
    {"id": "ink-eye", "name": "Ink black eye", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#1B1B19", "color": "#1B1B19", "albedo": {"dominant": "#1B1B19", "secondary": ["#2E2E28", "#0E0E0C"], "samplingNotes": "palette extraction on operator-rabbit-front.png isolated mask (deterministic low-pass isolator)"}, "colorVariation": {"palette": ["#1B1B19", "#2E2E28", "#0E0E0C"], "pattern": "flat", "amplitude": 0.03, "heightCorrelation": 0.0}, "roughness": {"base": 0.25, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "eye-lid-wrap", "description": "Slight occlusion where the eyes recess into the face", "type": "multiply", "weights": {"eye-left": 0.15, "eye-right": 0.15}, "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.0}}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Ink black eye; sampled from operator-rabbit-front.png.", "textureless": {"declared": true, "evidence": ["operator-rabbit-front.png flat-colour brand-shape mascot: foreground 0.1854, no grain/print/pores in visible faces", "intake assessment records palette-only albedo (white/gray body, emerald headset, soft pink inner ears); identity is silhouette/proportion/colour boundaries", "styleHeads 2.0 chibi figurine route  —  surface is smooth primer-resin with zero relief; no texel-bearing surface expected"]}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Operator Rabbit (fullbody)__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 1.4, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Operator Rabbit (fullbody)", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.6, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Full-body mascot lockup proxy; boxes the whole rabbit for hero placement and whole-object motion.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 1.1, "height": 2.8, "depth": 0.9, "units": "relative", "confidence": 0.6}, "transform": {"position": [0, 1.4, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "assembly", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-body", "localPosition": [0, 1.4, 0]}, {"id": "socket-head", "localPosition": [0, 2.2, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1.1, 2.8, 0.9], "isTrigger": false, "notes": "Operator Rabbit (fullbody)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_root_0.userData.actionProfile = {"animationRole": "assembly", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-body", "localPosition": [0, 1.4, 0]}, {"id": "socket-head", "localPosition": [0, 2.2, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1.1, 2.8, 0.9], "isTrigger": false, "notes": "Operator Rabbit (fullbody)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Operator Rabbit (fullbody)";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Operator Rabbit (fullbody)", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.6, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Full-body mascot lockup proxy; boxes the whole rabbit for hero placement and whole-object motion.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 1.1, "height": 2.8, "depth": 0.9, "units": "relative", "confidence": 0.6}, "transform": {"position": [0, 1.4, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "assembly", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-body", "localPosition": [0, 1.4, 0]}, {"id": "socket-head", "localPosition": [0, 2.2, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1.1, 2.8, 0.9], "isTrigger": false, "notes": "Operator Rabbit (fullbody)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1.1, 2.8, 0.9], "isTrigger": false, "notes": "Operator Rabbit (fullbody)"};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);
  const socket_root_socket_body_0 = new THREE.Object3D();
  socket_root_socket_body_0.name = "socket-body";
  socket_root_socket_body_0.position.set(0.0, 1.4, 0.0);
  socket_root_socket_body_0.rotation.set(0, 0, 0);
  socket_root_socket_body_0.userData.socket = {"id": "socket-body", "localPosition": [0, 1.4, 0]};
  node_root_0.add(socket_root_socket_body_0);
  sockets["root:socket-body"] = socket_root_socket_body_0;
  const socket_root_socket_head_1 = new THREE.Object3D();
  socket_root_socket_head_1.name = "socket-head";
  socket_root_socket_head_1.position.set(0.0, 2.2, 0.0);
  socket_root_socket_head_1.rotation.set(0, 0, 0);
  socket_root_socket_head_1.userData.socket = {"id": "socket-head", "localPosition": [0, 2.2, 0]};
  node_root_0.add(socket_root_socket_head_1);
  sockets["root:socket-head"] = socket_root_socket_head_1;

  const endpoint_torso_1 = makeAttachmentEndpoint(null);
  const node_torso_1 = new THREE.Group();
  node_torso_1.name = "Bellied rounded torso__pivot";
  node_torso_1.scale.set(1, 1, 1);
  if (endpoint_torso_1) {
    node_torso_1.position.copy(endpoint_torso_1.start);
    node_torso_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_torso_1.position.set(0.0, 1.28, 0.0);
    node_torso_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_torso_1.userData.sculptComponent = {"id": "torso", "name": "Bellied rounded torso", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.7, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Wide egg/bellied body mass, widest at mid height, narrowing to hips; top merges into the head mass.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "socket-body", "localStart": [0, 1.28, 0], "localEnd": [0, 1.28, 0], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.8, "height": 0.62, "depth": 0.5, "units": "relative", "confidence": 0.7}, "transform": {"position": [0, 1.28, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-head-seat", "localPosition": [0, 0.31, 0.02]}, {"id": "socket-leg-left", "localPosition": [-0.18, -0.31, 0.03]}, {"id": "socket-leg-right", "localPosition": [0.18, -0.31, 0.03]}, {"id": "socket-arm-left", "localPosition": [-0.45, -0.02, 0.05]}, {"id": "socket-arm-right", "localPosition": [0.45, -0.02, 0.05]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.8, 0.62, 0.5], "isTrigger": false, "notes": "Bellied rounded torso"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "torso", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "torso-belly-swell", "name": "Widest belly point at mid height", "type": "ridge", "evidenceRefs": ["operator-front"]}, {"id": "neck-collar", "name": "Collared neck transition on the torso", "type": "seam", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_torso_1.userData.actionProfile = {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-head-seat", "localPosition": [0, 0.31, 0.02]}, {"id": "socket-leg-left", "localPosition": [-0.18, -0.31, 0.03]}, {"id": "socket-leg-right", "localPosition": [0.18, -0.31, 0.03]}, {"id": "socket-arm-left", "localPosition": [-0.45, -0.02, 0.05]}, {"id": "socket-arm-right", "localPosition": [0.45, -0.02, 0.05]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.8, 0.62, 0.5], "isTrigger": false, "notes": "Bellied rounded torso"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "torso", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["root"] ?? root).add(node_torso_1);
  nodes["torso"] = node_torso_1;
  const mesh_torso_1Geometry = endpoint_torso_1
    ? new THREE.CylinderGeometry(endpoint_torso_1.endRadius, endpoint_torso_1.baseRadius, endpoint_torso_1.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_torso_1) {
    mesh_torso_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_torso_1 = new THREE.Mesh(
    mesh_torso_1Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_torso_1.name = "Bellied rounded torso";
  if (endpoint_torso_1) {
    mesh_torso_1.position.copy(endpoint_torso_1.midpoint);
    mesh_torso_1.quaternion.copy(endpoint_torso_1.quaternion);
  }
  mesh_torso_1.castShadow = options.castShadow ?? true;
  mesh_torso_1.receiveShadow = options.receiveShadow ?? true;
  mesh_torso_1.userData.sculptComponent = {"id": "torso", "name": "Bellied rounded torso", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.7, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Wide egg/bellied body mass, widest at mid height, narrowing to hips; top merges into the head mass.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "socket-body", "localStart": [0, 1.28, 0], "localEnd": [0, 1.28, 0], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.8, "height": 0.62, "depth": 0.5, "units": "relative", "confidence": 0.7}, "transform": {"position": [0, 1.28, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-head-seat", "localPosition": [0, 0.31, 0.02]}, {"id": "socket-leg-left", "localPosition": [-0.18, -0.31, 0.03]}, {"id": "socket-leg-right", "localPosition": [0.18, -0.31, 0.03]}, {"id": "socket-arm-left", "localPosition": [-0.45, -0.02, 0.05]}, {"id": "socket-arm-right", "localPosition": [0.45, -0.02, 0.05]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.8, 0.62, 0.5], "isTrigger": false, "notes": "Bellied rounded torso"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "torso", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "torso-belly-swell", "name": "Widest belly point at mid height", "type": "ridge", "evidenceRefs": ["operator-front"]}, {"id": "neck-collar", "name": "Collared neck transition on the torso", "type": "seam", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_torso_1.add(mesh_torso_1);
  meshes["torso"] = mesh_torso_1;
  colliders["torso"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.8, 0.62, 0.5], "isTrigger": false, "notes": "Bellied rounded torso"};
  destructionGroups["torso"] ??= [];
  destructionGroups["torso"].push(node_torso_1);
  const socket_torso_socket_head_seat_0 = new THREE.Object3D();
  socket_torso_socket_head_seat_0.name = "socket-head-seat";
  socket_torso_socket_head_seat_0.position.set(0.0, 0.31, 0.02);
  socket_torso_socket_head_seat_0.rotation.set(0, 0, 0);
  socket_torso_socket_head_seat_0.userData.socket = {"id": "socket-head-seat", "localPosition": [0, 0.31, 0.02]};
  node_torso_1.add(socket_torso_socket_head_seat_0);
  sockets["torso:socket-head-seat"] = socket_torso_socket_head_seat_0;
  const socket_torso_socket_leg_left_1 = new THREE.Object3D();
  socket_torso_socket_leg_left_1.name = "socket-leg-left";
  socket_torso_socket_leg_left_1.position.set(-0.18, -0.31, 0.03);
  socket_torso_socket_leg_left_1.rotation.set(0, 0, 0);
  socket_torso_socket_leg_left_1.userData.socket = {"id": "socket-leg-left", "localPosition": [-0.18, -0.31, 0.03]};
  node_torso_1.add(socket_torso_socket_leg_left_1);
  sockets["torso:socket-leg-left"] = socket_torso_socket_leg_left_1;
  const socket_torso_socket_leg_right_2 = new THREE.Object3D();
  socket_torso_socket_leg_right_2.name = "socket-leg-right";
  socket_torso_socket_leg_right_2.position.set(0.18, -0.31, 0.03);
  socket_torso_socket_leg_right_2.rotation.set(0, 0, 0);
  socket_torso_socket_leg_right_2.userData.socket = {"id": "socket-leg-right", "localPosition": [0.18, -0.31, 0.03]};
  node_torso_1.add(socket_torso_socket_leg_right_2);
  sockets["torso:socket-leg-right"] = socket_torso_socket_leg_right_2;
  const socket_torso_socket_arm_left_3 = new THREE.Object3D();
  socket_torso_socket_arm_left_3.name = "socket-arm-left";
  socket_torso_socket_arm_left_3.position.set(-0.45, -0.02, 0.05);
  socket_torso_socket_arm_left_3.rotation.set(0, 0, 0);
  socket_torso_socket_arm_left_3.userData.socket = {"id": "socket-arm-left", "localPosition": [-0.45, -0.02, 0.05]};
  node_torso_1.add(socket_torso_socket_arm_left_3);
  sockets["torso:socket-arm-left"] = socket_torso_socket_arm_left_3;
  const socket_torso_socket_arm_right_4 = new THREE.Object3D();
  socket_torso_socket_arm_right_4.name = "socket-arm-right";
  socket_torso_socket_arm_right_4.position.set(0.45, -0.02, 0.05);
  socket_torso_socket_arm_right_4.rotation.set(0, 0, 0);
  socket_torso_socket_arm_right_4.userData.socket = {"id": "socket-arm-right", "localPosition": [0.45, -0.02, 0.05]};
  node_torso_1.add(socket_torso_socket_arm_right_4);
  sockets["torso:socket-arm-right"] = socket_torso_socket_arm_right_4;

  const endpoint_head_2 = makeAttachmentEndpoint(null);
  const node_head_2 = new THREE.Group();
  node_head_2.name = "Rounded head mass__pivot";
  node_head_2.scale.set(1, 1, 1);
  if (endpoint_head_2) {
    node_head_2.position.copy(endpoint_head_2.start);
    node_head_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_head_2.position.set(0.0, 0.67, 0.0);
    node_head_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_head_2.userData.sculptComponent = {"id": "head", "name": "Rounded head mass", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.8, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Compact rounded head; ears and headset seat into its top/sides and the lower edge settles into the torso without a visible neck.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-head-seat", "localStart": [0, 0.31, 0.02], "localEnd": [0, 0.31, 0.02], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.66, "height": 0.62, "depth": 0.5, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.67, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-ear-left", "localPosition": [-0.22, 0.28, 0.0]}, {"id": "socket-ear-right", "localPosition": [0.22, 0.28, 0.0]}, {"id": "socket-headband", "localPosition": [0, 0.1, 0.0]}, {"id": "socket-cup-left", "localPosition": [-0.36, -0.08, 0.05]}, {"id": "socket-cup-right", "localPosition": [0.36, -0.08, 0.05]}, {"id": "socket-mic-root", "localPosition": [0.32, -0.14, 0.08]}, {"id": "socket-eye-left", "localPosition": [-0.15, -0.05, 0.24]}, {"id": "socket-eye-right", "localPosition": [0.15, -0.05, 0.24]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.66, 0.62, 0.5], "isTrigger": false, "notes": "Rounded head mass"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "head-rounded-mass", "name": "Rounded head mass merging ears into jaw", "type": "ridge", "evidenceRefs": ["operator-front"]}, {"id": "ear-anchor-left", "name": "Clean junction where the left ear meets the crown", "type": "seam", "evidenceRefs": ["operator-rabbit-front"]}, {"id": "ear-anchor-right", "name": "Clean junction where the right ear meets the crown", "type": "seam", "evidenceRefs": ["operator-rabbit-front"]}, {"id": "facing-eye-pair", "name": "Forward glass eyes on the blank face field", "type": "gloss", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_head_2.userData.actionProfile = {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-ear-left", "localPosition": [-0.22, 0.28, 0.0]}, {"id": "socket-ear-right", "localPosition": [0.22, 0.28, 0.0]}, {"id": "socket-headband", "localPosition": [0, 0.1, 0.0]}, {"id": "socket-cup-left", "localPosition": [-0.36, -0.08, 0.05]}, {"id": "socket-cup-right", "localPosition": [0.36, -0.08, 0.05]}, {"id": "socket-mic-root", "localPosition": [0.32, -0.14, 0.08]}, {"id": "socket-eye-left", "localPosition": [-0.15, -0.05, 0.24]}, {"id": "socket-eye-right", "localPosition": [0.15, -0.05, 0.24]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.66, 0.62, 0.5], "isTrigger": false, "notes": "Rounded head mass"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["torso"] ?? root).add(node_head_2);
  nodes["head"] = node_head_2;
  const mesh_head_2Geometry = endpoint_head_2
    ? new THREE.CylinderGeometry(endpoint_head_2.endRadius, endpoint_head_2.baseRadius, endpoint_head_2.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_head_2) {
    mesh_head_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_head_2 = new THREE.SkinnedMesh(
    mesh_head_2Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_head_2.name = "Rounded head mass";
  if (endpoint_head_2) {
    mesh_head_2.position.copy(endpoint_head_2.midpoint);
    mesh_head_2.quaternion.copy(endpoint_head_2.quaternion);
  }
  mesh_head_2.castShadow = options.castShadow ?? true;
  mesh_head_2.receiveShadow = options.receiveShadow ?? true;
  mesh_head_2.userData.sculptComponent = {"id": "head", "name": "Rounded head mass", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.8, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Compact rounded head; ears and headset seat into its top/sides and the lower edge settles into the torso without a visible neck.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-head-seat", "localStart": [0, 0.31, 0.02], "localEnd": [0, 0.31, 0.02], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.66, "height": 0.62, "depth": 0.5, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.67, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-ear-left", "localPosition": [-0.22, 0.28, 0.0]}, {"id": "socket-ear-right", "localPosition": [0.22, 0.28, 0.0]}, {"id": "socket-headband", "localPosition": [0, 0.1, 0.0]}, {"id": "socket-cup-left", "localPosition": [-0.36, -0.08, 0.05]}, {"id": "socket-cup-right", "localPosition": [0.36, -0.08, 0.05]}, {"id": "socket-mic-root", "localPosition": [0.32, -0.14, 0.08]}, {"id": "socket-eye-left", "localPosition": [-0.15, -0.05, 0.24]}, {"id": "socket-eye-right", "localPosition": [0.15, -0.05, 0.24]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.66, 0.62, 0.5], "isTrigger": false, "notes": "Rounded head mass"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "head-rounded-mass", "name": "Rounded head mass merging ears into jaw", "type": "ridge", "evidenceRefs": ["operator-front"]}, {"id": "ear-anchor-left", "name": "Clean junction where the left ear meets the crown", "type": "seam", "evidenceRefs": ["operator-rabbit-front"]}, {"id": "ear-anchor-right", "name": "Clean junction where the right ear meets the crown", "type": "seam", "evidenceRefs": ["operator-rabbit-front"]}, {"id": "facing-eye-pair", "name": "Forward glass eyes on the blank face field", "type": "gloss", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_head_2.add(mesh_head_2);
  meshes["head"] = mesh_head_2;
  colliders["head"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.66, 0.62, 0.5], "isTrigger": false, "notes": "Rounded head mass"};
  destructionGroups["head"] ??= [];
  destructionGroups["head"].push(node_head_2);
  const socket_head_socket_ear_left_0 = new THREE.Object3D();
  socket_head_socket_ear_left_0.name = "socket-ear-left";
  socket_head_socket_ear_left_0.position.set(-0.22, 0.28, 0.0);
  socket_head_socket_ear_left_0.rotation.set(0, 0, 0);
  socket_head_socket_ear_left_0.userData.socket = {"id": "socket-ear-left", "localPosition": [-0.22, 0.28, 0.0]};
  node_head_2.add(socket_head_socket_ear_left_0);
  sockets["head:socket-ear-left"] = socket_head_socket_ear_left_0;
  const socket_head_socket_ear_right_1 = new THREE.Object3D();
  socket_head_socket_ear_right_1.name = "socket-ear-right";
  socket_head_socket_ear_right_1.position.set(0.22, 0.28, 0.0);
  socket_head_socket_ear_right_1.rotation.set(0, 0, 0);
  socket_head_socket_ear_right_1.userData.socket = {"id": "socket-ear-right", "localPosition": [0.22, 0.28, 0.0]};
  node_head_2.add(socket_head_socket_ear_right_1);
  sockets["head:socket-ear-right"] = socket_head_socket_ear_right_1;
  const socket_head_socket_headband_2 = new THREE.Object3D();
  socket_head_socket_headband_2.name = "socket-headband";
  socket_head_socket_headband_2.position.set(0.0, 0.1, 0.0);
  socket_head_socket_headband_2.rotation.set(0, 0, 0);
  socket_head_socket_headband_2.userData.socket = {"id": "socket-headband", "localPosition": [0, 0.1, 0.0]};
  node_head_2.add(socket_head_socket_headband_2);
  sockets["head:socket-headband"] = socket_head_socket_headband_2;
  const socket_head_socket_cup_left_3 = new THREE.Object3D();
  socket_head_socket_cup_left_3.name = "socket-cup-left";
  socket_head_socket_cup_left_3.position.set(-0.36, -0.08, 0.05);
  socket_head_socket_cup_left_3.rotation.set(0, 0, 0);
  socket_head_socket_cup_left_3.userData.socket = {"id": "socket-cup-left", "localPosition": [-0.36, -0.08, 0.05]};
  node_head_2.add(socket_head_socket_cup_left_3);
  sockets["head:socket-cup-left"] = socket_head_socket_cup_left_3;
  const socket_head_socket_cup_right_4 = new THREE.Object3D();
  socket_head_socket_cup_right_4.name = "socket-cup-right";
  socket_head_socket_cup_right_4.position.set(0.36, -0.08, 0.05);
  socket_head_socket_cup_right_4.rotation.set(0, 0, 0);
  socket_head_socket_cup_right_4.userData.socket = {"id": "socket-cup-right", "localPosition": [0.36, -0.08, 0.05]};
  node_head_2.add(socket_head_socket_cup_right_4);
  sockets["head:socket-cup-right"] = socket_head_socket_cup_right_4;
  const socket_head_socket_mic_root_5 = new THREE.Object3D();
  socket_head_socket_mic_root_5.name = "socket-mic-root";
  socket_head_socket_mic_root_5.position.set(0.32, -0.14, 0.08);
  socket_head_socket_mic_root_5.rotation.set(0, 0, 0);
  socket_head_socket_mic_root_5.userData.socket = {"id": "socket-mic-root", "localPosition": [0.32, -0.14, 0.08]};
  node_head_2.add(socket_head_socket_mic_root_5);
  sockets["head:socket-mic-root"] = socket_head_socket_mic_root_5;
  const socket_head_socket_eye_left_6 = new THREE.Object3D();
  socket_head_socket_eye_left_6.name = "socket-eye-left";
  socket_head_socket_eye_left_6.position.set(-0.15, -0.05, 0.24);
  socket_head_socket_eye_left_6.rotation.set(0, 0, 0);
  socket_head_socket_eye_left_6.userData.socket = {"id": "socket-eye-left", "localPosition": [-0.15, -0.05, 0.24]};
  node_head_2.add(socket_head_socket_eye_left_6);
  sockets["head:socket-eye-left"] = socket_head_socket_eye_left_6;
  const socket_head_socket_eye_right_7 = new THREE.Object3D();
  socket_head_socket_eye_right_7.name = "socket-eye-right";
  socket_head_socket_eye_right_7.position.set(0.15, -0.05, 0.24);
  socket_head_socket_eye_right_7.rotation.set(0, 0, 0);
  socket_head_socket_eye_right_7.userData.socket = {"id": "socket-eye-right", "localPosition": [0.15, -0.05, 0.24]};
  node_head_2.add(socket_head_socket_eye_right_7);
  sockets["head:socket-eye-right"] = socket_head_socket_eye_right_7;

  const endpoint_ear_left_3 = makeAttachmentEndpoint(null);
  const node_ear_left_3 = new THREE.Group();
  node_ear_left_3.name = "Left ear (broader, slightly shorter)__pivot";
  node_ear_left_3.scale.set(1, 1, 1);
  if (endpoint_ear_left_3) {
    node_ear_left_3.position.copy(endpoint_ear_left_3.start);
    node_ear_left_3.rotation.set(0.0, -0.08, 0.0);
  } else {
    node_ear_left_3.position.set(-0.22, 0.28, -0.01);
    node_ear_left_3.rotation.set(0.0, -0.08, 0.0);
  }
  node_ear_left_3.userData.sculptComponent = {"id": "ear-left", "name": "Left ear (broader, slightly shorter)", "level": "meso", "role": "appendage", "importance": 0.9, "confidence": 0.7, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Tall broad rounded ear seated into the head top; subtle outward lean; the headset band passes in front of its inner base.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-ear-left", "localStart": [-0.22, 0.28, 0.0], "localEnd": [-0.24, 0.7, 0.02], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.17, "height": 0.5, "depth": 0.11, "units": "relative", "confidence": 0.7}, "transform": {"position": [-0.22, 0.28, -0.01], "rotation": [0, -0.08, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.17, 0.5, 0.11], "isTrigger": false, "notes": "Left ear (broader, slightly shorter)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "ear-left-base-behind-band", "name": "Headset band arcs in front of the inner ear base", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_ear_left_3.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.17, 0.5, 0.11], "isTrigger": false, "notes": "Left ear (broader, slightly shorter)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["head"] ?? root).add(node_ear_left_3);
  nodes["ear-left"] = node_ear_left_3;
  const mesh_ear_left_3Geometry = endpoint_ear_left_3
    ? new THREE.CylinderGeometry(endpoint_ear_left_3.endRadius, endpoint_ear_left_3.baseRadius, endpoint_ear_left_3.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_ear_left_3) {
    mesh_ear_left_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ear_left_3 = new THREE.SkinnedMesh(
    mesh_ear_left_3Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_left_3.name = "Left ear (broader, slightly shorter)";
  if (endpoint_ear_left_3) {
    mesh_ear_left_3.position.copy(endpoint_ear_left_3.midpoint);
    mesh_ear_left_3.quaternion.copy(endpoint_ear_left_3.quaternion);
  }
  mesh_ear_left_3.castShadow = options.castShadow ?? true;
  mesh_ear_left_3.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_left_3.userData.sculptComponent = {"id": "ear-left", "name": "Left ear (broader, slightly shorter)", "level": "meso", "role": "appendage", "importance": 0.9, "confidence": 0.7, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Tall broad rounded ear seated into the head top; subtle outward lean; the headset band passes in front of its inner base.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-ear-left", "localStart": [-0.22, 0.28, 0.0], "localEnd": [-0.24, 0.7, 0.02], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.17, "height": 0.5, "depth": 0.11, "units": "relative", "confidence": 0.7}, "transform": {"position": [-0.22, 0.28, -0.01], "rotation": [0, -0.08, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.17, 0.5, 0.11], "isTrigger": false, "notes": "Left ear (broader, slightly shorter)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "ear-left-base-behind-band", "name": "Headset band arcs in front of the inner ear base", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_ear_left_3.add(mesh_ear_left_3);
  meshes["ear-left"] = mesh_ear_left_3;
  colliders["ear-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.17, 0.5, 0.11], "isTrigger": false, "notes": "Left ear (broader, slightly shorter)"};
  destructionGroups["ear-left"] ??= [];
  destructionGroups["ear-left"].push(node_ear_left_3);

  const endpoint_ear_right_4 = makeAttachmentEndpoint(null);
  const node_ear_right_4 = new THREE.Group();
  node_ear_right_4.name = "Right ear (taller, straighter)__pivot";
  node_ear_right_4.scale.set(1, 1, 1);
  if (endpoint_ear_right_4) {
    node_ear_right_4.position.copy(endpoint_ear_right_4.start);
    node_ear_right_4.rotation.set(0.0, 0.05, 0.0);
  } else {
    node_ear_right_4.position.set(0.22, 0.28, -0.01);
    node_ear_right_4.rotation.set(0.0, 0.05, 0.0);
  }
  node_ear_right_4.userData.sculptComponent = {"id": "ear-right", "name": "Right ear (taller, straighter)", "level": "meso", "role": "appendage", "importance": 0.9, "confidence": 0.7, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Tall near-straight ear seated into the head top; the headset cup hugs its outer base.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-ear-right", "localStart": [0.22, 0.28, 0.0], "localEnd": [0.23, 0.82, 0.02], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.16, "height": 0.6, "depth": 0.1, "units": "relative", "confidence": 0.7}, "transform": {"position": [0.22, 0.28, -0.01], "rotation": [0, 0.05, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.16, 0.6, 0.1], "isTrigger": false, "notes": "Right ear (taller, straighter)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_ear_right_4.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.16, 0.6, 0.1], "isTrigger": false, "notes": "Right ear (taller, straighter)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["head"] ?? root).add(node_ear_right_4);
  nodes["ear-right"] = node_ear_right_4;
  const mesh_ear_right_4Geometry = endpoint_ear_right_4
    ? new THREE.CylinderGeometry(endpoint_ear_right_4.endRadius, endpoint_ear_right_4.baseRadius, endpoint_ear_right_4.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_ear_right_4) {
    mesh_ear_right_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ear_right_4 = new THREE.SkinnedMesh(
    mesh_ear_right_4Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_right_4.name = "Right ear (taller, straighter)";
  if (endpoint_ear_right_4) {
    mesh_ear_right_4.position.copy(endpoint_ear_right_4.midpoint);
    mesh_ear_right_4.quaternion.copy(endpoint_ear_right_4.quaternion);
  }
  mesh_ear_right_4.castShadow = options.castShadow ?? true;
  mesh_ear_right_4.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_right_4.userData.sculptComponent = {"id": "ear-right", "name": "Right ear (taller, straighter)", "level": "meso", "role": "appendage", "importance": 0.9, "confidence": 0.7, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Tall near-straight ear seated into the head top; the headset cup hugs its outer base.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-ear-right", "localStart": [0.22, 0.28, 0.0], "localEnd": [0.23, 0.82, 0.02], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.16, "height": 0.6, "depth": 0.1, "units": "relative", "confidence": 0.7}, "transform": {"position": [0.22, 0.28, -0.01], "rotation": [0, 0.05, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.16, 0.6, 0.1], "isTrigger": false, "notes": "Right ear (taller, straighter)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_ear_right_4.add(mesh_ear_right_4);
  meshes["ear-right"] = mesh_ear_right_4;
  colliders["ear-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.16, 0.6, 0.1], "isTrigger": false, "notes": "Right ear (taller, straighter)"};
  destructionGroups["ear-right"] ??= [];
  destructionGroups["ear-right"].push(node_ear_right_4);

  const endpoint_inner_ear_left_5 = makeAttachmentEndpoint(null);
  const node_inner_ear_left_5 = new THREE.Group();
  node_inner_ear_left_5.name = "Left inner ear (soft pink)__pivot";
  node_inner_ear_left_5.scale.set(1, 1, 1);
  if (endpoint_inner_ear_left_5) {
    node_inner_ear_left_5.position.copy(endpoint_inner_ear_left_5.start);
    node_inner_ear_left_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_inner_ear_left_5.position.set(0.0, -0.03, 0.035);
    node_inner_ear_left_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_inner_ear_left_5.userData.sculptComponent = {"id": "inner-ear-left", "name": "Left inner ear (soft pink)", "level": "meso", "role": "detail", "importance": 0.6, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "surface-relief", "topologyRationale": "Shallow soft-pink pad on the inner front face of the left ear; reads as the inner ear channel.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "ear-left", "attachment": {"parentSocket": "socket-ear-left", "localStart": [-0.22, 0.28, 0.0], "localEnd": [-0.24, 0.7, 0.02], "contactType": "embed", "embedDepth": 0.0, "gapTolerance": 0.01}, "dimensions": {"width": 0.09, "height": 0.26, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.0, -0.03, 0.035], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.26, 0.03], "isTrigger": false, "notes": "Left inner ear (soft pink)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-ear-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "soft-pink-inner-ear"}}, "material": "soft-pink-inner-ear", "materialLayers": ["soft-pink-inner-ear"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "inner-ear-pink-l", "name": "Soft pink inner ear channel on left ear", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 157, 154, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(183, 157, 154, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_inner_ear_left_5.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.26, 0.03], "isTrigger": false, "notes": "Left inner ear (soft pink)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-ear-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "soft-pink-inner-ear"}};
  (nodes["ear-left"] ?? root).add(node_inner_ear_left_5);
  nodes["inner-ear-left"] = node_inner_ear_left_5;
  const mesh_inner_ear_left_5Geometry = endpoint_inner_ear_left_5
    ? new THREE.CylinderGeometry(endpoint_inner_ear_left_5.endRadius, endpoint_inner_ear_left_5.baseRadius, endpoint_inner_ear_left_5.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_inner_ear_left_5) {
    mesh_inner_ear_left_5Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_inner_ear_left_5 = new THREE.Mesh(
    mesh_inner_ear_left_5Geometry,
    materialMap["soft-pink-inner-ear"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_inner_ear_left_5.name = "Left inner ear (soft pink)";
  if (endpoint_inner_ear_left_5) {
    mesh_inner_ear_left_5.position.copy(endpoint_inner_ear_left_5.midpoint);
    mesh_inner_ear_left_5.quaternion.copy(endpoint_inner_ear_left_5.quaternion);
  }
  mesh_inner_ear_left_5.castShadow = options.castShadow ?? true;
  mesh_inner_ear_left_5.receiveShadow = options.receiveShadow ?? true;
  mesh_inner_ear_left_5.userData.sculptComponent = {"id": "inner-ear-left", "name": "Left inner ear (soft pink)", "level": "meso", "role": "detail", "importance": 0.6, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "surface-relief", "topologyRationale": "Shallow soft-pink pad on the inner front face of the left ear; reads as the inner ear channel.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "ear-left", "attachment": {"parentSocket": "socket-ear-left", "localStart": [-0.22, 0.28, 0.0], "localEnd": [-0.24, 0.7, 0.02], "contactType": "embed", "embedDepth": 0.0, "gapTolerance": 0.01}, "dimensions": {"width": 0.09, "height": 0.26, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.0, -0.03, 0.035], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.26, 0.03], "isTrigger": false, "notes": "Left inner ear (soft pink)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-ear-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "soft-pink-inner-ear"}}, "material": "soft-pink-inner-ear", "materialLayers": ["soft-pink-inner-ear"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "inner-ear-pink-l", "name": "Soft pink inner ear channel on left ear", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 157, 154, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(183, 157, 154, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_inner_ear_left_5.add(mesh_inner_ear_left_5);
  meshes["inner-ear-left"] = mesh_inner_ear_left_5;
  colliders["inner-ear-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.26, 0.03], "isTrigger": false, "notes": "Left inner ear (soft pink)"};
  destructionGroups["inner-ear-left"] ??= [];
  destructionGroups["inner-ear-left"].push(node_inner_ear_left_5);

  const endpoint_inner_ear_right_6 = makeAttachmentEndpoint(null);
  const node_inner_ear_right_6 = new THREE.Group();
  node_inner_ear_right_6.name = "Right inner ear (soft pink)__pivot";
  node_inner_ear_right_6.scale.set(1, 1, 1);
  if (endpoint_inner_ear_right_6) {
    node_inner_ear_right_6.position.copy(endpoint_inner_ear_right_6.start);
    node_inner_ear_right_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_inner_ear_right_6.position.set(0.0, -0.02, 0.035);
    node_inner_ear_right_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_inner_ear_right_6.userData.sculptComponent = {"id": "inner-ear-right", "name": "Right inner ear (soft pink)", "level": "meso", "role": "detail", "importance": 0.6, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "surface-relief", "topologyRationale": "Shallow soft-pink pad on the inner front face of the right ear; reads as the inner ear channel.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "ear-right", "attachment": {"parentSocket": "socket-ear-right", "localStart": [0.22, 0.28, 0.0], "localEnd": [0.23, 0.82, 0.02], "contactType": "embed", "embedDepth": 0.0, "gapTolerance": 0.01}, "dimensions": {"width": 0.08, "height": 0.3, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.0, -0.02, 0.035], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.08, 0.3, 0.03], "isTrigger": false, "notes": "Right inner ear (soft pink)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-ear-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "soft-pink-inner-ear"}}, "material": "soft-pink-inner-ear", "materialLayers": ["soft-pink-inner-ear"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 157, 154, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(183, 157, 154, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_inner_ear_right_6.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.08, 0.3, 0.03], "isTrigger": false, "notes": "Right inner ear (soft pink)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-ear-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "soft-pink-inner-ear"}};
  (nodes["ear-right"] ?? root).add(node_inner_ear_right_6);
  nodes["inner-ear-right"] = node_inner_ear_right_6;
  const mesh_inner_ear_right_6Geometry = endpoint_inner_ear_right_6
    ? new THREE.CylinderGeometry(endpoint_inner_ear_right_6.endRadius, endpoint_inner_ear_right_6.baseRadius, endpoint_inner_ear_right_6.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_inner_ear_right_6) {
    mesh_inner_ear_right_6Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_inner_ear_right_6 = new THREE.Mesh(
    mesh_inner_ear_right_6Geometry,
    materialMap["soft-pink-inner-ear"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_inner_ear_right_6.name = "Right inner ear (soft pink)";
  if (endpoint_inner_ear_right_6) {
    mesh_inner_ear_right_6.position.copy(endpoint_inner_ear_right_6.midpoint);
    mesh_inner_ear_right_6.quaternion.copy(endpoint_inner_ear_right_6.quaternion);
  }
  mesh_inner_ear_right_6.castShadow = options.castShadow ?? true;
  mesh_inner_ear_right_6.receiveShadow = options.receiveShadow ?? true;
  mesh_inner_ear_right_6.userData.sculptComponent = {"id": "inner-ear-right", "name": "Right inner ear (soft pink)", "level": "meso", "role": "detail", "importance": 0.6, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "surface-relief", "topologyRationale": "Shallow soft-pink pad on the inner front face of the right ear; reads as the inner ear channel.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "ear-right", "attachment": {"parentSocket": "socket-ear-right", "localStart": [0.22, 0.28, 0.0], "localEnd": [0.23, 0.82, 0.02], "contactType": "embed", "embedDepth": 0.0, "gapTolerance": 0.01}, "dimensions": {"width": 0.08, "height": 0.3, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.0, -0.02, 0.035], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.08, 0.3, 0.03], "isTrigger": false, "notes": "Right inner ear (soft pink)"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-ear-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "soft-pink-inner-ear"}}, "material": "soft-pink-inner-ear", "materialLayers": ["soft-pink-inner-ear"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 157, 154, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(183, 157, 154, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_inner_ear_right_6.add(mesh_inner_ear_right_6);
  meshes["inner-ear-right"] = mesh_inner_ear_right_6;
  colliders["inner-ear-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.08, 0.3, 0.03], "isTrigger": false, "notes": "Right inner ear (soft pink)"};
  destructionGroups["inner-ear-right"] ??= [];
  destructionGroups["inner-ear-right"].push(node_inner_ear_right_6);

  const endpoint_headband_7 = makeAttachmentEndpoint(null);
  const node_headband_7 = new THREE.Group();
  node_headband_7.name = "Emerald headset band__pivot";
  node_headband_7.scale.set(1, 1, 1);
  if (endpoint_headband_7) {
    node_headband_7.position.copy(endpoint_headband_7.start);
    node_headband_7.rotation.set(1.2, 0.0, 0.0);
  } else {
    node_headband_7.position.set(0.0, 0.1, -0.02);
    node_headband_7.rotation.set(1.2, 0.0, 0.0);
  }
  node_headband_7.userData.sculptComponent = {"id": "headband", "name": "Emerald headset band", "level": "meso", "role": "ring", "importance": 0.85, "confidence": 0.7, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Emerald curved arc spanning the head crown between the two ear cups; characteristic top silhouette notch between the ears.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-headband", "localStart": [0, 0.1, 0.0], "localEnd": [0, 0.1, 0.0], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.52, "height": 0.3, "depth": 0.4, "units": "relative", "confidence": 0.7}, "transform": {"position": [0, 0.1, -0.02], "rotation": [1.2, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.52, 0.3, 0.4], "isTrigger": false, "notes": "Emerald headset band"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "headband", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "headset-band-arc", "name": "Emerald arc across the crown, cupping between ears", "type": "ridge", "evidenceRefs": ["operator-front"]}, {"id": "band-arc", "name": "Crown arc of the headband", "type": "bevel", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(21, 124, 80, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(21, 124, 80, 1.0)", "position": 1}]}}};
  node_headband_7.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.52, 0.3, 0.4], "isTrigger": false, "notes": "Emerald headset band"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "headband", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}};
  (nodes["head"] ?? root).add(node_headband_7);
  nodes["headband"] = node_headband_7;
  const mesh_headband_7Geometry = endpoint_headband_7
    ? new THREE.CylinderGeometry(endpoint_headband_7.endRadius, endpoint_headband_7.baseRadius, endpoint_headband_7.length, 32, 12)
    : new THREE.TorusGeometry(0.45, 0.08, 24, 96);
  if (!endpoint_headband_7) {
    mesh_headband_7Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_headband_7 = new THREE.Mesh(
    mesh_headband_7Geometry,
    materialMap["emerald-headset"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_headband_7.name = "Emerald headset band";
  if (endpoint_headband_7) {
    mesh_headband_7.position.copy(endpoint_headband_7.midpoint);
    mesh_headband_7.quaternion.copy(endpoint_headband_7.quaternion);
  }
  mesh_headband_7.castShadow = options.castShadow ?? true;
  mesh_headband_7.receiveShadow = options.receiveShadow ?? true;
  mesh_headband_7.userData.sculptComponent = {"id": "headband", "name": "Emerald headset band", "level": "meso", "role": "ring", "importance": 0.85, "confidence": 0.7, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Emerald curved arc spanning the head crown between the two ear cups; characteristic top silhouette notch between the ears.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-headband", "localStart": [0, 0.1, 0.0], "localEnd": [0, 0.1, 0.0], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.52, "height": 0.3, "depth": 0.4, "units": "relative", "confidence": 0.7}, "transform": {"position": [0, 0.1, -0.02], "rotation": [1.2, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.52, 0.3, 0.4], "isTrigger": false, "notes": "Emerald headset band"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "headband", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "headset-band-arc", "name": "Emerald arc across the crown, cupping between ears", "type": "ridge", "evidenceRefs": ["operator-front"]}, {"id": "band-arc", "name": "Crown arc of the headband", "type": "bevel", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(21, 124, 80, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(21, 124, 80, 1.0)", "position": 1}]}}};
  node_headband_7.add(mesh_headband_7);
  meshes["headband"] = mesh_headband_7;
  colliders["headband"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.52, 0.3, 0.4], "isTrigger": false, "notes": "Emerald headset band"};
  destructionGroups["headband"] ??= [];
  destructionGroups["headband"].push(node_headband_7);

  const endpoint_cup_left_8 = makeAttachmentEndpoint(null);
  const node_cup_left_8 = new THREE.Group();
  node_cup_left_8.name = "Emerald ear cup L__pivot";
  node_cup_left_8.scale.set(1, 1, 1);
  if (endpoint_cup_left_8) {
    node_cup_left_8.position.copy(endpoint_cup_left_8.start);
    node_cup_left_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_cup_left_8.position.set(-0.36, -0.08, 0.05);
    node_cup_left_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_cup_left_8.userData.sculptComponent = {"id": "cup-left", "name": "Emerald ear cup L", "level": "meso", "role": "detail", "importance": 0.7, "confidence": 0.7, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Emerald rounded ear cup hugging the left ear base; dark padded rim toward the head.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-cup-left", "localStart": [-0.36, -0.08, 0.05], "localEnd": [-0.36, -0.08, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.24, "height": 0.18, "depth": 0.16, "units": "relative", "confidence": 0.7}, "transform": {"position": [-0.36, -0.08, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup L"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cup-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "emerald-cup-left", "name": "Emerald left ear cup at ear base", "type": "patch", "evidenceRefs": ["operator-front"]}, {"id": "pad-rim", "name": "Pad rim opening to the ear seat", "type": "ridge", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(21, 124, 80, 1.0)", "secondaryAlbedo": "rgba(12, 46, 29, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(21, 124, 80, 1.0)", "position": 0}, {"color": "rgba(12, 46, 29, 1.0)", "position": 1}]}}};
  node_cup_left_8.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup L"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cup-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}};
  (nodes["head"] ?? root).add(node_cup_left_8);
  nodes["cup-left"] = node_cup_left_8;
  const mesh_cup_left_8Geometry = endpoint_cup_left_8
    ? new THREE.CylinderGeometry(endpoint_cup_left_8.endRadius, endpoint_cup_left_8.baseRadius, endpoint_cup_left_8.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_cup_left_8) {
    mesh_cup_left_8Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_cup_left_8 = new THREE.Mesh(
    mesh_cup_left_8Geometry,
    materialMap["emerald-headset"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cup_left_8.name = "Emerald ear cup L";
  if (endpoint_cup_left_8) {
    mesh_cup_left_8.position.copy(endpoint_cup_left_8.midpoint);
    mesh_cup_left_8.quaternion.copy(endpoint_cup_left_8.quaternion);
  }
  mesh_cup_left_8.castShadow = options.castShadow ?? true;
  mesh_cup_left_8.receiveShadow = options.receiveShadow ?? true;
  mesh_cup_left_8.userData.sculptComponent = {"id": "cup-left", "name": "Emerald ear cup L", "level": "meso", "role": "detail", "importance": 0.7, "confidence": 0.7, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Emerald rounded ear cup hugging the left ear base; dark padded rim toward the head.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-cup-left", "localStart": [-0.36, -0.08, 0.05], "localEnd": [-0.36, -0.08, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.24, "height": 0.18, "depth": 0.16, "units": "relative", "confidence": 0.7}, "transform": {"position": [-0.36, -0.08, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup L"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cup-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "emerald-cup-left", "name": "Emerald left ear cup at ear base", "type": "patch", "evidenceRefs": ["operator-front"]}, {"id": "pad-rim", "name": "Pad rim opening to the ear seat", "type": "ridge", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(21, 124, 80, 1.0)", "secondaryAlbedo": "rgba(12, 46, 29, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(21, 124, 80, 1.0)", "position": 0}, {"color": "rgba(12, 46, 29, 1.0)", "position": 1}]}}};
  node_cup_left_8.add(mesh_cup_left_8);
  meshes["cup-left"] = mesh_cup_left_8;
  colliders["cup-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup L"};
  destructionGroups["cup-left"] ??= [];
  destructionGroups["cup-left"].push(node_cup_left_8);

  const endpoint_cup_right_9 = makeAttachmentEndpoint(null);
  const node_cup_right_9 = new THREE.Group();
  node_cup_right_9.name = "Emerald ear cup R__pivot";
  node_cup_right_9.scale.set(1, 1, 1);
  if (endpoint_cup_right_9) {
    node_cup_right_9.position.copy(endpoint_cup_right_9.start);
    node_cup_right_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_cup_right_9.position.set(0.36, -0.08, 0.05);
    node_cup_right_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_cup_right_9.userData.sculptComponent = {"id": "cup-right", "name": "Emerald ear cup R", "level": "meso", "role": "detail", "importance": 0.7, "confidence": 0.7, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Emerald rounded ear cup hugging the right ear base; boom-mic arm emerges from its lower front edge.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-cup-right", "localStart": [0.36, -0.08, 0.05], "localEnd": [0.36, -0.08, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.24, "height": 0.18, "depth": 0.16, "units": "relative", "confidence": 0.7}, "transform": {"position": [0.36, -0.08, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-mic-pivot", "localPosition": [0.33, -0.18, 0.1]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup R"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cup-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "emerald-cup-right", "name": "Emerald right ear cup at ear base", "type": "patch", "evidenceRefs": ["operator-front"]}, {"id": "mic-arm-pivot", "name": "Boom-mic arm pivot at lower front of right cup", "type": "groove", "evidenceRefs": ["operator-front"]}, {"id": "mic-mount", "name": "Boom mic mount on the right cup", "type": "mount", "evidenceRefs": ["operator-rabbit-front"]}, {"id": "pad-rim", "name": "Pad rim opening to the ear seat", "type": "ridge", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(21, 124, 80, 1.0)", "secondaryAlbedo": "rgba(12, 46, 29, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(21, 124, 80, 1.0)", "position": 0}, {"color": "rgba(12, 46, 29, 1.0)", "position": 1}]}}};
  node_cup_right_9.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-mic-pivot", "localPosition": [0.33, -0.18, 0.1]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup R"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cup-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}};
  (nodes["head"] ?? root).add(node_cup_right_9);
  nodes["cup-right"] = node_cup_right_9;
  const mesh_cup_right_9Geometry = endpoint_cup_right_9
    ? new THREE.CylinderGeometry(endpoint_cup_right_9.endRadius, endpoint_cup_right_9.baseRadius, endpoint_cup_right_9.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_cup_right_9) {
    mesh_cup_right_9Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_cup_right_9 = new THREE.Mesh(
    mesh_cup_right_9Geometry,
    materialMap["emerald-headset"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cup_right_9.name = "Emerald ear cup R";
  if (endpoint_cup_right_9) {
    mesh_cup_right_9.position.copy(endpoint_cup_right_9.midpoint);
    mesh_cup_right_9.quaternion.copy(endpoint_cup_right_9.quaternion);
  }
  mesh_cup_right_9.castShadow = options.castShadow ?? true;
  mesh_cup_right_9.receiveShadow = options.receiveShadow ?? true;
  mesh_cup_right_9.userData.sculptComponent = {"id": "cup-right", "name": "Emerald ear cup R", "level": "meso", "role": "detail", "importance": 0.7, "confidence": 0.7, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Emerald rounded ear cup hugging the right ear base; boom-mic arm emerges from its lower front edge.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-cup-right", "localStart": [0.36, -0.08, 0.05], "localEnd": [0.36, -0.08, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.24, "height": 0.18, "depth": 0.16, "units": "relative", "confidence": 0.7}, "transform": {"position": [0.36, -0.08, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-mic-pivot", "localPosition": [0.33, -0.18, 0.1]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup R"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cup-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "emerald-cup-right", "name": "Emerald right ear cup at ear base", "type": "patch", "evidenceRefs": ["operator-front"]}, {"id": "mic-arm-pivot", "name": "Boom-mic arm pivot at lower front of right cup", "type": "groove", "evidenceRefs": ["operator-front"]}, {"id": "mic-mount", "name": "Boom mic mount on the right cup", "type": "mount", "evidenceRefs": ["operator-rabbit-front"]}, {"id": "pad-rim", "name": "Pad rim opening to the ear seat", "type": "ridge", "evidenceRefs": ["operator-rabbit-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(21, 124, 80, 1.0)", "secondaryAlbedo": "rgba(12, 46, 29, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(21, 124, 80, 1.0)", "position": 0}, {"color": "rgba(12, 46, 29, 1.0)", "position": 1}]}}};
  node_cup_right_9.add(mesh_cup_right_9);
  meshes["cup-right"] = mesh_cup_right_9;
  colliders["cup-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.24, 0.18, 0.16], "isTrigger": false, "notes": "Emerald ear cup R"};
  destructionGroups["cup-right"] ??= [];
  destructionGroups["cup-right"].push(node_cup_right_9);
  const socket_cup_right_socket_mic_pivot_0 = new THREE.Object3D();
  socket_cup_right_socket_mic_pivot_0.name = "socket-mic-pivot";
  socket_cup_right_socket_mic_pivot_0.position.set(0.33, -0.18, 0.1);
  socket_cup_right_socket_mic_pivot_0.rotation.set(0, 0, 0);
  socket_cup_right_socket_mic_pivot_0.userData.socket = {"id": "socket-mic-pivot", "localPosition": [0.33, -0.18, 0.1]};
  node_cup_right_9.add(socket_cup_right_socket_mic_pivot_0);
  sockets["cup-right:socket-mic-pivot"] = socket_cup_right_socket_mic_pivot_0;

  const attachment_boom_mic_10 = {"parentSocket": "socket-mic-root", "localStart": [0.32, -0.14, 0.08], "localEnd": [0.02, -0.32, 0.24], "contactType": "socket-joint", "baseRadius": 0.03, "endRadius": 0.018, "embedDepth": 0.02, "gapTolerance": 0.01};
  const endpoint_boom_mic_10 = makeAttachmentEndpoint(attachment_boom_mic_10);
  const node_boom_mic_10 = new THREE.Group();
  node_boom_mic_10.name = "Emerald boom-mic arm__pivot";
  node_boom_mic_10.scale.set(1, 1, 1);
  if (endpoint_boom_mic_10) {
    node_boom_mic_10.position.copy(endpoint_boom_mic_10.start);
    node_boom_mic_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boom_mic_10.position.set(0.18, -0.22, 0.16);
    node_boom_mic_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_boom_mic_10.userData.sculptComponent = {"id": "boom-mic", "name": "Emerald boom-mic arm", "level": "meso", "role": "tube", "importance": 0.8, "confidence": 0.65, "primitive": "curve-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Thin emerald arm curving from the right ear cup around the jaw to the muzzle, ending in the dark mic capsule; adjust-mic anchor.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-mic-root", "localStart": [0.32, -0.14, 0.08], "localEnd": [0.02, -0.32, 0.24], "contactType": "socket-joint", "baseRadius": 0.03, "endRadius": 0.018, "embedDepth": 0.02, "gapTolerance": 0.01}, "dimensions": {"width": 0.05, "height": 0.52, "depth": 0.05, "units": "relative", "confidence": 0.65}, "transform": {"position": [0.18, -0.22, 0.16], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.65}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-mic-cap", "localPosition": [0.02, -0.32, 0.24]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.05, 0.52, 0.05], "isTrigger": false, "notes": "Emerald boom-mic arm"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boom-mic", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "boom-mic-arm", "name": "Boom-mic arm sweeping under the jaw to the muzzle", "type": "ridge", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(21, 124, 80, 1.0)", "secondaryAlbedo": "rgba(12, 46, 29, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(21, 124, 80, 1.0)", "position": 0}, {"color": "rgba(12, 46, 29, 1.0)", "position": 1}]}}};
  node_boom_mic_10.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.65}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-mic-cap", "localPosition": [0.02, -0.32, 0.24]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.05, 0.52, 0.05], "isTrigger": false, "notes": "Emerald boom-mic arm"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boom-mic", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}};
  (nodes["head"] ?? root).add(node_boom_mic_10);
  nodes["boom-mic"] = node_boom_mic_10;
  const mesh_boom_mic_10Geometry = endpoint_boom_mic_10
    ? new THREE.CylinderGeometry(endpoint_boom_mic_10.endRadius, endpoint_boom_mic_10.baseRadius, endpoint_boom_mic_10.length, 32, 12)
    : buildCurveSweepGeometry({"spine": [[-0.5, -0.4, 0.0], [-0.1, 0.1, 0.0], [0.3, 0.2, 0.0], [0.6, -0.1, 0.0]], "crossSection": {"points": [[-0.04, -0.02], [0.04, -0.02], [0.04, 0.02], [-0.04, 0.02]]}, "closed": false});
  if (!endpoint_boom_mic_10) {
    mesh_boom_mic_10Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_boom_mic_10 = new THREE.SkinnedMesh(
    mesh_boom_mic_10Geometry,
    materialMap["emerald-headset"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boom_mic_10.name = "Emerald boom-mic arm";
  if (endpoint_boom_mic_10) {
    mesh_boom_mic_10.position.copy(endpoint_boom_mic_10.midpoint);
    mesh_boom_mic_10.quaternion.copy(endpoint_boom_mic_10.quaternion);
  }
  mesh_boom_mic_10.castShadow = options.castShadow ?? true;
  mesh_boom_mic_10.receiveShadow = options.receiveShadow ?? true;
  mesh_boom_mic_10.userData.sculptComponent = {"id": "boom-mic", "name": "Emerald boom-mic arm", "level": "meso", "role": "tube", "importance": 0.8, "confidence": 0.65, "primitive": "curve-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Thin emerald arm curving from the right ear cup around the jaw to the muzzle, ending in the dark mic capsule; adjust-mic anchor.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-mic-root", "localStart": [0.32, -0.14, 0.08], "localEnd": [0.02, -0.32, 0.24], "contactType": "socket-joint", "baseRadius": 0.03, "endRadius": 0.018, "embedDepth": 0.02, "gapTolerance": 0.01}, "dimensions": {"width": 0.05, "height": 0.52, "depth": 0.05, "units": "relative", "confidence": 0.65}, "transform": {"position": [0.18, -0.22, 0.16], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.65}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "socket-mic-cap", "localPosition": [0.02, -0.32, 0.24]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.05, 0.52, 0.05], "isTrigger": false, "notes": "Emerald boom-mic arm"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boom-mic", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "emerald-headset"}}, "material": "emerald-headset", "materialLayers": ["emerald-headset"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "boom-mic-arm", "name": "Boom-mic arm sweeping under the jaw to the muzzle", "type": "ridge", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(21, 124, 80, 1.0)", "secondaryAlbedo": "rgba(12, 46, 29, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(21, 124, 80, 1.0)", "position": 0}, {"color": "rgba(12, 46, 29, 1.0)", "position": 1}]}}};
  node_boom_mic_10.add(mesh_boom_mic_10);
  meshes["boom-mic"] = mesh_boom_mic_10;
  colliders["boom-mic"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.05, 0.52, 0.05], "isTrigger": false, "notes": "Emerald boom-mic arm"};
  destructionGroups["boom-mic"] ??= [];
  destructionGroups["boom-mic"].push(node_boom_mic_10);
  const socket_boom_mic_socket_mic_cap_0 = new THREE.Object3D();
  socket_boom_mic_socket_mic_cap_0.name = "socket-mic-cap";
  socket_boom_mic_socket_mic_cap_0.position.set(0.02, -0.32, 0.24);
  socket_boom_mic_socket_mic_cap_0.rotation.set(0, 0, 0);
  socket_boom_mic_socket_mic_cap_0.userData.socket = {"id": "socket-mic-cap", "localPosition": [0.02, -0.32, 0.24]};
  node_boom_mic_10.add(socket_boom_mic_socket_mic_cap_0);
  sockets["boom-mic:socket-mic-cap"] = socket_boom_mic_socket_mic_cap_0;

  const endpoint_mic_cap_11 = makeAttachmentEndpoint(null);
  const node_mic_cap_11 = new THREE.Group();
  node_mic_cap_11.name = "Dark mic capsule__pivot";
  node_mic_cap_11.scale.set(1, 1, 1);
  if (endpoint_mic_cap_11) {
    node_mic_cap_11.position.copy(endpoint_mic_cap_11.start);
    node_mic_cap_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_mic_cap_11.position.set(0.0, 0.0, 0.0);
    node_mic_cap_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_mic_cap_11.userData.sculptComponent = {"id": "mic-cap", "name": "Dark mic capsule", "level": "micro", "role": "detail", "importance": 0.55, "confidence": 0.6, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Small dark rounded microphone capsule at the muzzle end of the boom arm.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "boom-mic", "attachment": {"parentSocket": "socket-mic-cap", "localStart": [0.02, -0.32, 0.24], "localEnd": [0.02, -0.32, 0.24], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.06, "height": 0.06, "depth": 0.06, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.0, 0.0, 0.0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.06, 0.06, 0.06], "isTrigger": false, "notes": "Dark mic capsule"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "mic-cap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "headset-padding"}}, "material": "headset-padding", "materialLayers": ["headset-padding"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "mic-capsule", "name": "Dark mic capsule under the muzzle", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(21, 124, 80, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(21, 124, 80, 1.0)", "position": 1}]}}};
  node_mic_cap_11.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.06, 0.06, 0.06], "isTrigger": false, "notes": "Dark mic capsule"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "mic-cap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "headset-padding"}};
  (nodes["boom-mic"] ?? root).add(node_mic_cap_11);
  nodes["mic-cap"] = node_mic_cap_11;
  const mesh_mic_cap_11Geometry = endpoint_mic_cap_11
    ? new THREE.CylinderGeometry(endpoint_mic_cap_11.endRadius, endpoint_mic_cap_11.baseRadius, endpoint_mic_cap_11.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_mic_cap_11) {
    mesh_mic_cap_11Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_mic_cap_11 = new THREE.Mesh(
    mesh_mic_cap_11Geometry,
    materialMap["headset-padding"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mic_cap_11.name = "Dark mic capsule";
  if (endpoint_mic_cap_11) {
    mesh_mic_cap_11.position.copy(endpoint_mic_cap_11.midpoint);
    mesh_mic_cap_11.quaternion.copy(endpoint_mic_cap_11.quaternion);
  }
  mesh_mic_cap_11.castShadow = options.castShadow ?? true;
  mesh_mic_cap_11.receiveShadow = options.receiveShadow ?? true;
  mesh_mic_cap_11.userData.sculptComponent = {"id": "mic-cap", "name": "Dark mic capsule", "level": "micro", "role": "detail", "importance": 0.55, "confidence": 0.6, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Small dark rounded microphone capsule at the muzzle end of the boom arm.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "boom-mic", "attachment": {"parentSocket": "socket-mic-cap", "localStart": [0.02, -0.32, 0.24], "localEnd": [0.02, -0.32, 0.24], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.06, "height": 0.06, "depth": 0.06, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.0, 0.0, 0.0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.06, 0.06, 0.06], "isTrigger": false, "notes": "Dark mic capsule"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "mic-cap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "headset-padding"}}, "material": "headset-padding", "materialLayers": ["headset-padding"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "mic-capsule", "name": "Dark mic capsule under the muzzle", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(21, 124, 80, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(21, 124, 80, 1.0)", "position": 1}]}}};
  node_mic_cap_11.add(mesh_mic_cap_11);
  meshes["mic-cap"] = mesh_mic_cap_11;
  colliders["mic-cap"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.06, 0.06, 0.06], "isTrigger": false, "notes": "Dark mic capsule"};
  destructionGroups["mic-cap"] ??= [];
  destructionGroups["mic-cap"].push(node_mic_cap_11);

  const endpoint_eye_left_12 = makeAttachmentEndpoint(null);
  const node_eye_left_12 = new THREE.Group();
  node_eye_left_12.name = "Ink eye L__pivot";
  node_eye_left_12.scale.set(1, 1, 1);
  if (endpoint_eye_left_12) {
    node_eye_left_12.position.copy(endpoint_eye_left_12.start);
    node_eye_left_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_left_12.position.set(-0.15, -0.05, 0.24);
    node_eye_left_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_left_12.userData.sculptComponent = {"id": "eye-left", "name": "Ink eye L", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Small dark eye dot slightly proud of the head front face.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-eye-left", "localStart": [-0.15, -0.05, 0.24], "localEnd": [-0.15, -0.05, 0.24], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.09, "height": 0.06, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [-0.15, -0.05, 0.24], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye L"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ink-eye"}}, "material": "ink-eye", "materialLayers": ["ink-eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eye-left", "name": "Small dark eye dot left of muzzle", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(240, 245, 244, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(240, 245, 244, 1.0)", "position": 1}]}}};
  node_eye_left_12.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye L"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ink-eye"}};
  (nodes["head"] ?? root).add(node_eye_left_12);
  nodes["eye-left"] = node_eye_left_12;
  const mesh_eye_left_12Geometry = endpoint_eye_left_12
    ? new THREE.CylinderGeometry(endpoint_eye_left_12.endRadius, endpoint_eye_left_12.baseRadius, endpoint_eye_left_12.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_eye_left_12) {
    mesh_eye_left_12Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_eye_left_12 = new THREE.Mesh(
    mesh_eye_left_12Geometry,
    materialMap["ink-eye"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_left_12.name = "Ink eye L";
  if (endpoint_eye_left_12) {
    mesh_eye_left_12.position.copy(endpoint_eye_left_12.midpoint);
    mesh_eye_left_12.quaternion.copy(endpoint_eye_left_12.quaternion);
  }
  mesh_eye_left_12.castShadow = options.castShadow ?? true;
  mesh_eye_left_12.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_left_12.userData.sculptComponent = {"id": "eye-left", "name": "Ink eye L", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Small dark eye dot slightly proud of the head front face.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-eye-left", "localStart": [-0.15, -0.05, 0.24], "localEnd": [-0.15, -0.05, 0.24], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.09, "height": 0.06, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [-0.15, -0.05, 0.24], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye L"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ink-eye"}}, "material": "ink-eye", "materialLayers": ["ink-eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eye-left", "name": "Small dark eye dot left of muzzle", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(240, 245, 244, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(240, 245, 244, 1.0)", "position": 1}]}}};
  node_eye_left_12.add(mesh_eye_left_12);
  meshes["eye-left"] = mesh_eye_left_12;
  colliders["eye-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye L"};
  destructionGroups["eye-left"] ??= [];
  destructionGroups["eye-left"].push(node_eye_left_12);

  const endpoint_eye_right_13 = makeAttachmentEndpoint(null);
  const node_eye_right_13 = new THREE.Group();
  node_eye_right_13.name = "Ink eye R__pivot";
  node_eye_right_13.scale.set(1, 1, 1);
  if (endpoint_eye_right_13) {
    node_eye_right_13.position.copy(endpoint_eye_right_13.start);
    node_eye_right_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_right_13.position.set(0.15, -0.05, 0.24);
    node_eye_right_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_right_13.userData.sculptComponent = {"id": "eye-right", "name": "Ink eye R", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Small dark eye dot slightly proud of the head front face.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-eye-right", "localStart": [0.15, -0.05, 0.24], "localEnd": [0.15, -0.05, 0.24], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.09, "height": 0.06, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.15, -0.05, 0.24], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye R"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ink-eye"}}, "material": "ink-eye", "materialLayers": ["ink-eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eye-right", "name": "Small dark eye dot right of muzzle", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(240, 245, 244, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(240, 245, 244, 1.0)", "position": 1}]}}};
  node_eye_right_13.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye R"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ink-eye"}};
  (nodes["head"] ?? root).add(node_eye_right_13);
  nodes["eye-right"] = node_eye_right_13;
  const mesh_eye_right_13Geometry = endpoint_eye_right_13
    ? new THREE.CylinderGeometry(endpoint_eye_right_13.endRadius, endpoint_eye_right_13.baseRadius, endpoint_eye_right_13.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_eye_right_13) {
    mesh_eye_right_13Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_eye_right_13 = new THREE.Mesh(
    mesh_eye_right_13Geometry,
    materialMap["ink-eye"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_right_13.name = "Ink eye R";
  if (endpoint_eye_right_13) {
    mesh_eye_right_13.position.copy(endpoint_eye_right_13.midpoint);
    mesh_eye_right_13.quaternion.copy(endpoint_eye_right_13.quaternion);
  }
  mesh_eye_right_13.castShadow = options.castShadow ?? true;
  mesh_eye_right_13.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_right_13.userData.sculptComponent = {"id": "eye-right", "name": "Ink eye R", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.6, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Small dark eye dot slightly proud of the head front face.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "head", "attachment": {"parentSocket": "socket-eye-right", "localStart": [0.15, -0.05, 0.24], "localEnd": [0.15, -0.05, 0.24], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.09, "height": 0.06, "depth": 0.03, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.15, -0.05, 0.24], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye R"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ink-eye"}}, "material": "ink-eye", "materialLayers": ["ink-eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eye-right", "name": "Small dark eye dot right of muzzle", "type": "patch", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(12, 46, 29, 1.0)", "secondaryAlbedo": "rgba(240, 245, 244, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "radial", "stops": [{"color": "rgba(12, 46, 29, 1.0)", "position": 0}, {"color": "rgba(240, 245, 244, 1.0)", "position": 1}]}}};
  node_eye_right_13.add(mesh_eye_right_13);
  meshes["eye-right"] = mesh_eye_right_13;
  colliders["eye-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.09, 0.06, 0.03], "isTrigger": false, "notes": "Ink eye R"};
  destructionGroups["eye-right"] ??= [];
  destructionGroups["eye-right"].push(node_eye_right_13);

  const attachment_arm_left_14 = {"parentSocket": "socket-arm-left", "localStart": [-0.45, -0.02, 0.05], "localEnd": [-0.45, -0.02, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01};
  const endpoint_arm_left_14 = makeAttachmentEndpoint(attachment_arm_left_14);
  const node_arm_left_14 = new THREE.Group();
  node_arm_left_14.name = "Left arm stub__pivot";
  node_arm_left_14.scale.set(1, 1, 1);
  if (endpoint_arm_left_14) {
    node_arm_left_14.position.copy(endpoint_arm_left_14.start);
    node_arm_left_14.rotation.set(0.0, 0.35, -0.2);
  } else {
    node_arm_left_14.position.set(-0.45, -0.02, 0.05);
    node_arm_left_14.rotation.set(0.0, 0.35, -0.2);
  }
  node_arm_left_14.userData.sculptComponent = {"id": "arm-left", "name": "Left arm stub", "level": "meso", "role": "arm", "importance": 0.7, "confidence": 0.6, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Short rounded arm stub overlapping the left torso flank; no hands in the brand scratch.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-arm-left", "localStart": [-0.45, -0.02, 0.05], "localEnd": [-0.45, -0.02, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.13, "height": 0.24, "depth": 0.13, "units": "relative", "confidence": 0.6}, "transform": {"position": [-0.45, -0.02, 0.05], "rotation": [0, 0.35, -0.2], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Left arm stub"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "arm-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_arm_left_14.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Left arm stub"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "arm-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["torso"] ?? root).add(node_arm_left_14);
  nodes["arm-left"] = node_arm_left_14;
  const mesh_arm_left_14Geometry = endpoint_arm_left_14
    ? new THREE.CylinderGeometry(endpoint_arm_left_14.endRadius, endpoint_arm_left_14.baseRadius, endpoint_arm_left_14.length, 32, 12)
    : buildWatertightCapsule(0.35, 0.7, 16, 32, 1);
  if (!endpoint_arm_left_14) {
    mesh_arm_left_14Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_arm_left_14 = new THREE.Mesh(
    mesh_arm_left_14Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_arm_left_14.name = "Left arm stub";
  if (endpoint_arm_left_14) {
    mesh_arm_left_14.position.copy(endpoint_arm_left_14.midpoint);
    mesh_arm_left_14.quaternion.copy(endpoint_arm_left_14.quaternion);
  }
  mesh_arm_left_14.castShadow = options.castShadow ?? true;
  mesh_arm_left_14.receiveShadow = options.receiveShadow ?? true;
  mesh_arm_left_14.userData.sculptComponent = {"id": "arm-left", "name": "Left arm stub", "level": "meso", "role": "arm", "importance": 0.7, "confidence": 0.6, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Short rounded arm stub overlapping the left torso flank; no hands in the brand scratch.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-arm-left", "localStart": [-0.45, -0.02, 0.05], "localEnd": [-0.45, -0.02, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.13, "height": 0.24, "depth": 0.13, "units": "relative", "confidence": 0.6}, "transform": {"position": [-0.45, -0.02, 0.05], "rotation": [0, 0.35, -0.2], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Left arm stub"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "arm-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_arm_left_14.add(mesh_arm_left_14);
  meshes["arm-left"] = mesh_arm_left_14;
  colliders["arm-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Left arm stub"};
  destructionGroups["arm-left"] ??= [];
  destructionGroups["arm-left"].push(node_arm_left_14);

  const attachment_arm_right_15 = {"parentSocket": "socket-arm-right", "localStart": [0.45, -0.02, 0.05], "localEnd": [0.45, -0.02, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01};
  const endpoint_arm_right_15 = makeAttachmentEndpoint(attachment_arm_right_15);
  const node_arm_right_15 = new THREE.Group();
  node_arm_right_15.name = "Right arm stub__pivot";
  node_arm_right_15.scale.set(1, 1, 1);
  if (endpoint_arm_right_15) {
    node_arm_right_15.position.copy(endpoint_arm_right_15.start);
    node_arm_right_15.rotation.set(0.0, -0.35, 0.2);
  } else {
    node_arm_right_15.position.set(0.45, -0.02, 0.05);
    node_arm_right_15.rotation.set(0.0, -0.35, 0.2);
  }
  node_arm_right_15.userData.sculptComponent = {"id": "arm-right", "name": "Right arm stub", "level": "meso", "role": "arm", "importance": 0.7, "confidence": 0.6, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Short rounded arm stub overlapping the right torso flank; reaches toward the mic during the adjust-mic clip.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-arm-right", "localStart": [0.45, -0.02, 0.05], "localEnd": [0.45, -0.02, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.13, "height": 0.24, "depth": 0.13, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.45, -0.02, 0.05], "rotation": [0, -0.35, 0.2], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Right arm stub"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "arm-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "arm-right-to-mic", "name": "Right arm swings toward boom mic in adjust-mic clip", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_arm_right_15.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Right arm stub"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "arm-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["torso"] ?? root).add(node_arm_right_15);
  nodes["arm-right"] = node_arm_right_15;
  const mesh_arm_right_15Geometry = endpoint_arm_right_15
    ? new THREE.CylinderGeometry(endpoint_arm_right_15.endRadius, endpoint_arm_right_15.baseRadius, endpoint_arm_right_15.length, 32, 12)
    : buildWatertightCapsule(0.35, 0.7, 16, 32, 1);
  if (!endpoint_arm_right_15) {
    mesh_arm_right_15Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_arm_right_15 = new THREE.Mesh(
    mesh_arm_right_15Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_arm_right_15.name = "Right arm stub";
  if (endpoint_arm_right_15) {
    mesh_arm_right_15.position.copy(endpoint_arm_right_15.midpoint);
    mesh_arm_right_15.quaternion.copy(endpoint_arm_right_15.quaternion);
  }
  mesh_arm_right_15.castShadow = options.castShadow ?? true;
  mesh_arm_right_15.receiveShadow = options.receiveShadow ?? true;
  mesh_arm_right_15.userData.sculptComponent = {"id": "arm-right", "name": "Right arm stub", "level": "meso", "role": "arm", "importance": 0.7, "confidence": 0.6, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Short rounded arm stub overlapping the right torso flank; reaches toward the mic during the adjust-mic clip.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-arm-right", "localStart": [0.45, -0.02, 0.05], "localEnd": [0.45, -0.02, 0.05], "contactType": "embed", "embedDepth": 0.05, "gapTolerance": 0.01}, "dimensions": {"width": 0.13, "height": 0.24, "depth": 0.13, "units": "relative", "confidence": 0.6}, "transform": {"position": [0.45, -0.02, 0.05], "rotation": [0, -0.35, 0.2], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.6}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Right arm stub"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "arm-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "arm-right-to-mic", "name": "Right arm swings toward boom mic in adjust-mic clip", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_arm_right_15.add(mesh_arm_right_15);
  meshes["arm-right"] = mesh_arm_right_15;
  colliders["arm-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.13, 0.24, 0.13], "isTrigger": false, "notes": "Right arm stub"};
  destructionGroups["arm-right"] ??= [];
  destructionGroups["arm-right"].push(node_arm_right_15);

  const attachment_leg_left_16 = {"parentSocket": "socket-leg-left", "localStart": [-0.18, -0.31, 0.03], "localEnd": [-0.18, -1.27, 0.03], "contactType": "socket-joint", "baseRadius": 0.11, "endRadius": 0.055, "embedDepth": 0.03, "gapTolerance": 0.01};
  const endpoint_leg_left_16 = makeAttachmentEndpoint(attachment_leg_left_16);
  const node_leg_left_16 = new THREE.Group();
  node_leg_left_16.name = "Left leg tapering to base__pivot";
  node_leg_left_16.scale.set(1, 1, 1);
  if (endpoint_leg_left_16) {
    node_leg_left_16.position.copy(endpoint_leg_left_16.start);
    node_leg_left_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_leg_left_16.position.set(-0.18, -0.94, 0.02);
    node_leg_left_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_leg_left_16.userData.sculptComponent = {"id": "leg-left", "name": "Left leg tapering to base", "level": "meso", "role": "leg", "importance": 0.75, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Tapered column from the torso to the floor; reads as a solid plinth base rather than separated feet.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-leg-left", "localStart": [-0.18, -0.31, 0.03], "localEnd": [-0.18, -1.27, 0.03], "contactType": "socket-joint", "baseRadius": 0.11, "endRadius": 0.055, "embedDepth": 0.03, "gapTolerance": 0.01}, "dimensions": {"width": 0.2, "height": 0.68, "depth": 0.18, "units": "relative", "confidence": 0.7}, "transform": {"position": [-0.18, -0.94, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Left leg tapering to base"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "leg-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leg-tapering-base", "name": "Leg tapering to a solid base", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_leg_left_16.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Left leg tapering to base"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "leg-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["torso"] ?? root).add(node_leg_left_16);
  nodes["leg-left"] = node_leg_left_16;
  const mesh_leg_left_16Geometry = endpoint_leg_left_16
    ? new THREE.CylinderGeometry(endpoint_leg_left_16.endRadius, endpoint_leg_left_16.baseRadius, endpoint_leg_left_16.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_leg_left_16) {
    mesh_leg_left_16Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_leg_left_16 = new THREE.Mesh(
    mesh_leg_left_16Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_leg_left_16.name = "Left leg tapering to base";
  if (endpoint_leg_left_16) {
    mesh_leg_left_16.position.copy(endpoint_leg_left_16.midpoint);
    mesh_leg_left_16.quaternion.copy(endpoint_leg_left_16.quaternion);
  }
  mesh_leg_left_16.castShadow = options.castShadow ?? true;
  mesh_leg_left_16.receiveShadow = options.receiveShadow ?? true;
  mesh_leg_left_16.userData.sculptComponent = {"id": "leg-left", "name": "Left leg tapering to base", "level": "meso", "role": "leg", "importance": 0.75, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Tapered column from the torso to the floor; reads as a solid plinth base rather than separated feet.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-leg-left", "localStart": [-0.18, -0.31, 0.03], "localEnd": [-0.18, -1.27, 0.03], "contactType": "socket-joint", "baseRadius": 0.11, "endRadius": 0.055, "embedDepth": 0.03, "gapTolerance": 0.01}, "dimensions": {"width": 0.2, "height": 0.68, "depth": 0.18, "units": "relative", "confidence": 0.7}, "transform": {"position": [-0.18, -0.94, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Left leg tapering to base"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "leg-left", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leg-tapering-base", "name": "Leg tapering to a solid base", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_leg_left_16.add(mesh_leg_left_16);
  meshes["leg-left"] = mesh_leg_left_16;
  colliders["leg-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Left leg tapering to base"};
  destructionGroups["leg-left"] ??= [];
  destructionGroups["leg-left"].push(node_leg_left_16);

  const attachment_leg_right_17 = {"parentSocket": "socket-leg-right", "localStart": [0.18, -0.31, 0.03], "localEnd": [0.18, -1.27, 0.03], "contactType": "socket-joint", "baseRadius": 0.11, "endRadius": 0.055, "embedDepth": 0.03, "gapTolerance": 0.01};
  const endpoint_leg_right_17 = makeAttachmentEndpoint(attachment_leg_right_17);
  const node_leg_right_17 = new THREE.Group();
  node_leg_right_17.name = "Right leg tapering to base__pivot";
  node_leg_right_17.scale.set(1, 1, 1);
  if (endpoint_leg_right_17) {
    node_leg_right_17.position.copy(endpoint_leg_right_17.start);
    node_leg_right_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_leg_right_17.position.set(0.18, -0.94, 0.02);
    node_leg_right_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_leg_right_17.userData.sculptComponent = {"id": "leg-right", "name": "Right leg tapering to base", "level": "meso", "role": "leg", "importance": 0.75, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Tapered column from the torso to the floor; reads as a solid plinth base rather than separated feet.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-leg-right", "localStart": [0.18, -0.31, 0.03], "localEnd": [0.18, -1.27, 0.03], "contactType": "socket-joint", "baseRadius": 0.11, "endRadius": 0.055, "embedDepth": 0.03, "gapTolerance": 0.01}, "dimensions": {"width": 0.2, "height": 0.68, "depth": 0.18, "units": "relative", "confidence": 0.7}, "transform": {"position": [0.18, -0.94, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Right leg tapering to base"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "leg-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leg-tapering-base", "name": "Leg tapering to a solid base", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_leg_right_17.userData.actionProfile = {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Right leg tapering to base"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "leg-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}};
  (nodes["torso"] ?? root).add(node_leg_right_17);
  nodes["leg-right"] = node_leg_right_17;
  const mesh_leg_right_17Geometry = endpoint_leg_right_17
    ? new THREE.CylinderGeometry(endpoint_leg_right_17.endRadius, endpoint_leg_right_17.baseRadius, endpoint_leg_right_17.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_leg_right_17) {
    mesh_leg_right_17Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_leg_right_17 = new THREE.Mesh(
    mesh_leg_right_17Geometry,
    materialMap["matte-white-resin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_leg_right_17.name = "Right leg tapering to base";
  if (endpoint_leg_right_17) {
    mesh_leg_right_17.position.copy(endpoint_leg_right_17.midpoint);
    mesh_leg_right_17.quaternion.copy(endpoint_leg_right_17.quaternion);
  }
  mesh_leg_right_17.castShadow = options.castShadow ?? true;
  mesh_leg_right_17.receiveShadow = options.receiveShadow ?? true;
  mesh_leg_right_17.userData.sculptComponent = {"id": "leg-right", "name": "Right leg tapering to base", "level": "meso", "role": "leg", "importance": 0.75, "confidence": 0.7, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Tapered column from the torso to the floor; reads as a solid plinth base rather than separated feet.", "geometryDescriptor": {"topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "torso", "attachment": {"parentSocket": "socket-leg-right", "localStart": [0.18, -0.31, 0.03], "localEnd": [0.18, -1.27, 0.03], "contactType": "socket-joint", "baseRadius": 0.11, "endRadius": 0.055, "embedDepth": 0.03, "gapTolerance": 0.01}, "dimensions": {"width": 0.2, "height": 0.68, "depth": 0.18, "units": "relative", "confidence": 0.7}, "transform": {"position": [0.18, -0.94, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "appendage", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Right leg tapering to base"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "leg-right", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "matte-white-resin"}}, "material": "matte-white-resin", "materialLayers": ["matte-white-resin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leg-tapering-base", "name": "Leg tapering to a solid base", "type": "groove", "evidenceRefs": ["operator-front"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams", "edgeWearPattern": "none", "notes": ""}, "evidenceRefs": ["operator-front"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(240, 245, 244, 1.0)", "secondaryAlbedo": "rgba(223, 223, 222, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.55, "colorGradient": {"type": "linear", "stops": [{"color": "rgba(240, 245, 244, 1.0)", "position": 0}, {"color": "rgba(223, 223, 222, 1.0)", "position": 1}]}}};
  node_leg_right_17.add(mesh_leg_right_17);
  meshes["leg-right"] = mesh_leg_right_17;
  colliders["leg-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [0.2, 0.68, 0.18], "isTrigger": false, "notes": "Right leg tapering to base"};
  destructionGroups["leg-right"] ??= [];
  destructionGroups["leg-right"].push(node_leg_right_17);

  // PLAN_1.5 WS-C slice 1: bone hierarchy from spec.rig. Model-space joints are
  // converted to parent-local offsets here. Nothing is bound yet (rig.bound === false).
  const bones: Record<string, THREE.Bone> = {};
  const boneOrder: string[] = [];
  const bone_pelvis = new THREE.Bone();
  bone_pelvis.name = "pelvis";
  bone_pelvis.position.set(0.0, -0.238, 0.0);
  root.add(bone_pelvis);
  bones["pelvis"] = bone_pelvis;
  boneOrder.push("pelvis");
  const bone_abdomen = new THREE.Bone();
  bone_abdomen.name = "abdomen";
  bone_abdomen.position.set(0.0, 0.027999999999999997, 0.0);
  bone_pelvis.add(bone_abdomen);
  bones["abdomen"] = bone_abdomen;
  boneOrder.push("abdomen");
  const bone_chest = new THREE.Bone();
  bone_chest.name = "chest";
  bone_chest.position.set(0.0, 0.30576, 0.0028);
  bone_abdomen.add(bone_chest);
  bones["chest"] = bone_chest;
  boneOrder.push("chest");
  const bone_clavicle_l = new THREE.Bone();
  bone_clavicle_l.name = "clavicle-l";
  bone_clavicle_l.position.set(0.03584, 0.40543999999999997, 0.005599999999999999);
  bone_chest.add(bone_clavicle_l);
  bones["clavicle-l"] = bone_clavicle_l;
  boneOrder.push("clavicle-l");
  const bone_clavicle_r = new THREE.Bone();
  bone_clavicle_r.name = "clavicle-r";
  bone_clavicle_r.position.set(-0.03584, 0.40543999999999997, 0.005599999999999999);
  bone_chest.add(bone_clavicle_r);
  bones["clavicle-r"] = bone_clavicle_r;
  boneOrder.push("clavicle-r");
  const bone_thigh_l = new THREE.Bone();
  bone_thigh_l.name = "thigh-l";
  bone_thigh_l.position.set(0.1428, -0.12880000000000003, 0.0056);
  bone_pelvis.add(bone_thigh_l);
  bones["thigh-l"] = bone_thigh_l;
  boneOrder.push("thigh-l");
  const bone_shin_l = new THREE.Bone();
  bone_shin_l.name = "shin-l";
  bone_shin_l.position.set(0.0, -0.29679999999999995, 0.0);
  bone_thigh_l.add(bone_shin_l);
  bones["shin-l"] = bone_shin_l;
  boneOrder.push("shin-l");
  const bone_foot_l = new THREE.Bone();
  bone_foot_l.name = "foot-l";
  bone_foot_l.position.set(0.0, -0.2772, 0.0392);
  bone_shin_l.add(bone_foot_l);
  bones["foot-l"] = bone_foot_l;
  boneOrder.push("foot-l");
  const bone_thigh_r = new THREE.Bone();
  bone_thigh_r.name = "thigh-r";
  bone_thigh_r.position.set(-0.1428, -0.12880000000000003, 0.0056);
  bone_pelvis.add(bone_thigh_r);
  bones["thigh-r"] = bone_thigh_r;
  boneOrder.push("thigh-r");
  const bone_shin_r = new THREE.Bone();
  bone_shin_r.name = "shin-r";
  bone_shin_r.position.set(0.0, -0.29679999999999995, 0.0);
  bone_thigh_r.add(bone_shin_r);
  bones["shin-r"] = bone_shin_r;
  boneOrder.push("shin-r");
  const bone_foot_r = new THREE.Bone();
  bone_foot_r.name = "foot-r";
  bone_foot_r.position.set(0.0, -0.2772, 0.0392);
  bone_shin_r.add(bone_foot_r);
  bones["foot-r"] = bone_foot_r;
  boneOrder.push("foot-r");
  const bone_upper_arm_left = new THREE.Bone();
  bone_upper_arm_left.name = "upper-arm-left";
  bone_upper_arm_left.position.set(0.18816, -0.005599999999999994, 0.005600000000000001);
  bone_clavicle_l.add(bone_upper_arm_left);
  bones["upper-arm-left"] = bone_upper_arm_left;
  boneOrder.push("upper-arm-left");
  const bone_forearm_l = new THREE.Bone();
  bone_forearm_l.name = "forearm-l";
  bone_forearm_l.position.set(0.07557, -0.37279999999999996, 0.0);
  bone_upper_arm_left.add(bone_forearm_l);
  bones["forearm-l"] = bone_forearm_l;
  boneOrder.push("forearm-l");
  const bone_upper_arm_right = new THREE.Bone();
  bone_upper_arm_right.name = "upper-arm-right";
  bone_upper_arm_right.position.set(-0.18816, -0.005599999999999994, 0.005600000000000001);
  bone_clavicle_r.add(bone_upper_arm_right);
  bones["upper-arm-right"] = bone_upper_arm_right;
  boneOrder.push("upper-arm-right");
  const bone_forearm_r = new THREE.Bone();
  bone_forearm_r.name = "forearm-r";
  bone_forearm_r.position.set(-0.07557, -0.37279999999999996, 0.0);
  bone_upper_arm_right.add(bone_forearm_r);
  bones["forearm-r"] = bone_forearm_r;
  boneOrder.push("forearm-r");
  const bone_hand_l = new THREE.Bone();
  bone_hand_l.name = "hand-l";
  bone_hand_l.position.set(0.04261999999999999, -0.35346, 0.0);
  bone_forearm_l.add(bone_hand_l);
  bones["hand-l"] = bone_hand_l;
  boneOrder.push("hand-l");
  const bone_hand_r = new THREE.Bone();
  bone_hand_r.name = "hand-r";
  bone_hand_r.position.set(-0.04261999999999999, -0.35346, 0.0);
  bone_forearm_r.add(bone_hand_r);
  bones["hand-r"] = bone_hand_r;
  boneOrder.push("hand-r");
  const bone_neck = new THREE.Bone();
  bone_neck.name = "neck";
  bone_neck.position.set(0.0, 0.39984, 0.0028);
  bone_chest.add(bone_neck);
  bones["neck"] = bone_neck;
  boneOrder.push("neck");
  const bone_head = new THREE.Bone();
  bone_head.name = "head";
  bone_head.position.set(0.0, 0.23800000000000004, 0.0);
  bone_neck.add(bone_head);
  bones["head"] = bone_head;
  boneOrder.push("head");
  const bone_index_l_1 = new THREE.Bone();
  bone_index_l_1.name = "index-l-1";
  bone_index_l_1.position.set(-0.02100000000000002, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_l.add(bone_index_l_1);
  bones["index-l-1"] = bone_index_l_1;
  boneOrder.push("index-l-1");
  const bone_index_l_2 = new THREE.Bone();
  bone_index_l_2.name = "index-l-2";
  bone_index_l_2.position.set(0.003520000000000023, -0.02919000000000005, 0.0);
  bone_index_l_1.add(bone_index_l_2);
  bones["index-l-2"] = bone_index_l_2;
  boneOrder.push("index-l-2");
  const bone_index_l_3 = new THREE.Bone();
  bone_index_l_3.name = "index-l-3";
  bone_index_l_3.position.set(0.0024100000000000232, -0.020009999999999972, 0.0);
  bone_index_l_2.add(bone_index_l_3);
  bones["index-l-3"] = bone_index_l_3;
  boneOrder.push("index-l-3");
  const bone_index_r_1 = new THREE.Bone();
  bone_index_r_1.name = "index-r-1";
  bone_index_r_1.position.set(0.02100000000000002, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_r.add(bone_index_r_1);
  bones["index-r-1"] = bone_index_r_1;
  boneOrder.push("index-r-1");
  const bone_index_r_2 = new THREE.Bone();
  bone_index_r_2.name = "index-r-2";
  bone_index_r_2.position.set(-0.003520000000000023, -0.02919000000000005, 0.0);
  bone_index_r_1.add(bone_index_r_2);
  bones["index-r-2"] = bone_index_r_2;
  boneOrder.push("index-r-2");
  const bone_index_r_3 = new THREE.Bone();
  bone_index_r_3.name = "index-r-3";
  bone_index_r_3.position.set(-0.0024100000000000232, -0.020009999999999972, 0.0);
  bone_index_r_2.add(bone_index_r_3);
  bones["index-r-3"] = bone_index_r_3;
  boneOrder.push("index-r-3");
  const bone_little_l_1 = new THREE.Bone();
  bone_little_l_1.name = "little-l-1";
  bone_little_l_1.position.set(0.019600000000000006, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_l.add(bone_little_l_1);
  bones["little-l-1"] = bone_little_l_1;
  boneOrder.push("little-l-1");
  const bone_little_l_2 = new THREE.Bone();
  bone_little_l_2.name = "little-l-2";
  bone_little_l_2.position.set(0.0026800000000000157, -0.022240000000000038, 0.0);
  bone_little_l_1.add(bone_little_l_2);
  bones["little-l-2"] = bone_little_l_2;
  boneOrder.push("little-l-2");
  const bone_little_l_3 = new THREE.Bone();
  bone_little_l_3.name = "little-l-3";
  bone_little_l_3.position.set(0.0019500000000000073, -0.016119999999999968, 0.0);
  bone_little_l_2.add(bone_little_l_3);
  bones["little-l-3"] = bone_little_l_3;
  boneOrder.push("little-l-3");
  const bone_little_r_1 = new THREE.Bone();
  bone_little_r_1.name = "little-r-1";
  bone_little_r_1.position.set(-0.019600000000000006, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_r.add(bone_little_r_1);
  bones["little-r-1"] = bone_little_r_1;
  boneOrder.push("little-r-1");
  const bone_little_r_2 = new THREE.Bone();
  bone_little_r_2.name = "little-r-2";
  bone_little_r_2.position.set(-0.0026800000000000157, -0.022240000000000038, 0.0);
  bone_little_r_1.add(bone_little_r_2);
  bones["little-r-2"] = bone_little_r_2;
  boneOrder.push("little-r-2");
  const bone_little_r_3 = new THREE.Bone();
  bone_little_r_3.name = "little-r-3";
  bone_little_r_3.position.set(-0.0019500000000000073, -0.016119999999999968, 0.0);
  bone_little_r_2.add(bone_little_r_3);
  bones["little-r-3"] = bone_little_r_3;
  boneOrder.push("little-r-3");
  const bone_middle_l_1 = new THREE.Bone();
  bone_middle_l_1.name = "middle-l-1";
  bone_middle_l_1.position.set(-0.007000000000000006, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_l.add(bone_middle_l_1);
  bones["middle-l-1"] = bone_middle_l_1;
  boneOrder.push("middle-l-1");
  const bone_middle_l_2 = new THREE.Bone();
  bone_middle_l_2.name = "middle-l-2";
  bone_middle_l_2.position.set(0.00385000000000002, -0.031970000000000054, 0.0);
  bone_middle_l_1.add(bone_middle_l_2);
  bones["middle-l-2"] = bone_middle_l_2;
  boneOrder.push("middle-l-2");
  const bone_middle_l_3 = new THREE.Bone();
  bone_middle_l_3.name = "middle-l-3";
  bone_middle_l_3.position.set(0.00268999999999997, -0.022239999999999982, 0.0);
  bone_middle_l_2.add(bone_middle_l_3);
  bones["middle-l-3"] = bone_middle_l_3;
  boneOrder.push("middle-l-3");
  const bone_middle_r_1 = new THREE.Bone();
  bone_middle_r_1.name = "middle-r-1";
  bone_middle_r_1.position.set(0.007000000000000006, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_r.add(bone_middle_r_1);
  bones["middle-r-1"] = bone_middle_r_1;
  boneOrder.push("middle-r-1");
  const bone_middle_r_2 = new THREE.Bone();
  bone_middle_r_2.name = "middle-r-2";
  bone_middle_r_2.position.set(-0.00385000000000002, -0.031970000000000054, 0.0);
  bone_middle_r_1.add(bone_middle_r_2);
  bones["middle-r-2"] = bone_middle_r_2;
  boneOrder.push("middle-r-2");
  const bone_middle_r_3 = new THREE.Bone();
  bone_middle_r_3.name = "middle-r-3";
  bone_middle_r_3.position.set(-0.00268999999999997, -0.022239999999999982, 0.0);
  bone_middle_r_2.add(bone_middle_r_3);
  bones["middle-r-3"] = bone_middle_r_3;
  boneOrder.push("middle-r-3");
  const bone_ring_l_1 = new THREE.Bone();
  bone_ring_l_1.name = "ring-l-1";
  bone_ring_l_1.position.set(0.007000000000000006, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_l.add(bone_ring_l_1);
  bones["ring-l-1"] = bone_ring_l_1;
  boneOrder.push("ring-l-1");
  const bone_ring_l_2 = new THREE.Bone();
  bone_ring_l_2.name = "ring-l-2";
  bone_ring_l_2.position.set(0.003520000000000023, -0.02919000000000005, 0.0);
  bone_ring_l_1.add(bone_ring_l_2);
  bones["ring-l-2"] = bone_ring_l_2;
  boneOrder.push("ring-l-2");
  const bone_ring_l_3 = new THREE.Bone();
  bone_ring_l_3.name = "ring-l-3";
  bone_ring_l_3.position.set(0.0024099999999999677, -0.020009999999999972, 0.0);
  bone_ring_l_2.add(bone_ring_l_3);
  bones["ring-l-3"] = bone_ring_l_3;
  boneOrder.push("ring-l-3");
  const bone_ring_r_1 = new THREE.Bone();
  bone_ring_r_1.name = "ring-r-1";
  bone_ring_r_1.position.set(-0.007000000000000006, -0.03762999999999997, 0.0027999999999999987);
  bone_hand_r.add(bone_ring_r_1);
  bones["ring-r-1"] = bone_ring_r_1;
  boneOrder.push("ring-r-1");
  const bone_ring_r_2 = new THREE.Bone();
  bone_ring_r_2.name = "ring-r-2";
  bone_ring_r_2.position.set(-0.003520000000000023, -0.02919000000000005, 0.0);
  bone_ring_r_1.add(bone_ring_r_2);
  bones["ring-r-2"] = bone_ring_r_2;
  boneOrder.push("ring-r-2");
  const bone_ring_r_3 = new THREE.Bone();
  bone_ring_r_3.name = "ring-r-3";
  bone_ring_r_3.position.set(-0.0024099999999999677, -0.020009999999999972, 0.0);
  bone_ring_r_2.add(bone_ring_r_3);
  bones["ring-r-3"] = bone_ring_r_3;
  boneOrder.push("ring-r-3");
  const bone_thumb_l_1 = new THREE.Bone();
  bone_thumb_l_1.name = "thumb-l-1";
  bone_thumb_l_1.position.set(-0.02799999999999997, -0.005369999999999986, 0.005599999999999999);
  bone_hand_l.add(bone_thumb_l_1);
  bones["thumb-l-1"] = bone_thumb_l_1;
  boneOrder.push("thumb-l-1");
  const bone_thumb_l_2 = new THREE.Bone();
  bone_thumb_l_2.name = "thumb-l-2";
  bone_thumb_l_2.position.set(-0.015120000000000022, -0.013020000000000004, 0.0063);
  bone_thumb_l_1.add(bone_thumb_l_2);
  bones["thumb-l-2"] = bone_thumb_l_2;
  boneOrder.push("thumb-l-2");
  const bone_thumb_l_3 = new THREE.Bone();
  bone_thumb_l_3.name = "thumb-l-3";
  bone_thumb_l_3.position.set(-0.011089999999999989, -0.009550000000000003, 0.004619999999999999);
  bone_thumb_l_2.add(bone_thumb_l_3);
  bones["thumb-l-3"] = bone_thumb_l_3;
  boneOrder.push("thumb-l-3");
  const bone_thumb_r_1 = new THREE.Bone();
  bone_thumb_r_1.name = "thumb-r-1";
  bone_thumb_r_1.position.set(0.02799999999999997, -0.005369999999999986, 0.005599999999999999);
  bone_hand_r.add(bone_thumb_r_1);
  bones["thumb-r-1"] = bone_thumb_r_1;
  boneOrder.push("thumb-r-1");
  const bone_thumb_r_2 = new THREE.Bone();
  bone_thumb_r_2.name = "thumb-r-2";
  bone_thumb_r_2.position.set(0.015120000000000022, -0.013020000000000004, 0.0063);
  bone_thumb_r_1.add(bone_thumb_r_2);
  bones["thumb-r-2"] = bone_thumb_r_2;
  boneOrder.push("thumb-r-2");
  const bone_thumb_r_3 = new THREE.Bone();
  bone_thumb_r_3.name = "thumb-r-3";
  bone_thumb_r_3.position.set(0.011089999999999989, -0.009550000000000003, 0.004619999999999999);
  bone_thumb_r_2.add(bone_thumb_r_3);
  bones["thumb-r-3"] = bone_thumb_r_3;
  boneOrder.push("thumb-r-3");
  const bone_ear_left = new THREE.Bone();
  bone_ear_left.name = "ear-left";
  bone_ear_left.position.set(-0.2, 0.26639999999999997, -0.0056);
  bone_head.add(bone_ear_left);
  bones["ear-left"] = bone_ear_left;
  boneOrder.push("ear-left");
  const bone_ear_right = new THREE.Bone();
  bone_ear_right.name = "ear-right";
  bone_ear_right.position.set(0.2, 0.26639999999999997, -0.0056);
  bone_head.add(bone_ear_right);
  bones["ear-right"] = bone_ear_right;
  boneOrder.push("ear-right");
  const bone_boom_mic = new THREE.Bone();
  bone_boom_mic.name = "boom-mic";
  bone_boom_mic.position.set(0.26, 0.11639999999999995, 0.2544);
  bone_head.add(bone_boom_mic);
  bones["boom-mic"] = bone_boom_mic;
  boneOrder.push("boom-mic");
  // The bones are now in REST position. updateMatrixWorld() before constructing the
  // Skeleton is load-bearing: calculateInverses() reads each bone's CURRENT world matrix,
  // and those inverses are what cancel the rest pose during skinning. Constructed before
  // this call it captures identity matrices, the rest pose never cancels, and every
  // vertex is displaced by its bone's offset at rest. Measured, not assumed --
  // scratchpad/bind_experiment.mjs read (0, 3, 0) for a vertex authored at (0, 2, 0).
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneOrder.map((id) => bones[id]));
  const boneIndexOf = new Map<string, number>(boneOrder.map((id, i) => [id, i]));

  // ---- PLAN_1.5 §4 weight function: ONE function over the complete bone set. No
  // mesh-id or vertex-index branching -- only positions, segment endpoints and the
  // envelope radius derived per §4.3. Ported from forge/stage5_rig/emit_rig.py, which
  // measured max |sum(w) - 1| = 2.98e-8 on executed geometry.
  const BONE_JOINT: Record<string, number[]> = {"pelvis": [0.0, -0.238, 0.0], "abdomen": [0.0, -0.21, 0.0], "chest": [0.0, 0.09576, 0.0028], "clavicle-l": [0.03584, 0.5012, 0.0084], "clavicle-r": [-0.03584, 0.5012, 0.0084], "thigh-l": [0.1428, -0.3668, 0.0056], "shin-l": [0.1428, -0.6636, 0.0056], "foot-l": [0.1428, -0.9408, 0.0448], "thigh-r": [-0.1428, -0.3668, 0.0056], "shin-r": [-0.1428, -0.6636, 0.0056], "foot-r": [-0.1428, -0.9408, 0.0448], "upper-arm-left": [0.224, 0.4956, 0.014], "forearm-l": [0.29957, 0.1228, 0.014], "upper-arm-right": [-0.224, 0.4956, 0.014], "forearm-r": [-0.29957, 0.1228, 0.014], "hand-l": [0.34219, -0.23066, 0.014], "hand-r": [-0.34219, -0.23066, 0.014], "neck": [0.0, 0.4956, 0.0056], "head": [0.0, 0.7336, 0.0056], "index-l-1": [0.32119, -0.26829, 0.0168], "index-l-2": [0.32471, -0.29748, 0.0168], "index-l-3": [0.32712, -0.31749, 0.0168], "index-r-1": [-0.32119, -0.26829, 0.0168], "index-r-2": [-0.32471, -0.29748, 0.0168], "index-r-3": [-0.32712, -0.31749, 0.0168], "little-l-1": [0.36179, -0.26829, 0.0168], "little-l-2": [0.36447, -0.29053, 0.0168], "little-l-3": [0.36642, -0.30665, 0.0168], "little-r-1": [-0.36179, -0.26829, 0.0168], "little-r-2": [-0.36447, -0.29053, 0.0168], "little-r-3": [-0.36642, -0.30665, 0.0168], "middle-l-1": [0.33519, -0.26829, 0.0168], "middle-l-2": [0.33904, -0.30026, 0.0168], "middle-l-3": [0.34173, -0.3225, 0.0168], "middle-r-1": [-0.33519, -0.26829, 0.0168], "middle-r-2": [-0.33904, -0.30026, 0.0168], "middle-r-3": [-0.34173, -0.3225, 0.0168], "ring-l-1": [0.34919, -0.26829, 0.0168], "ring-l-2": [0.35271, -0.29748, 0.0168], "ring-l-3": [0.35512, -0.31749, 0.0168], "ring-r-1": [-0.34919, -0.26829, 0.0168], "ring-r-2": [-0.35271, -0.29748, 0.0168], "ring-r-3": [-0.35512, -0.31749, 0.0168], "thumb-l-1": [0.31419, -0.23603, 0.0196], "thumb-l-2": [0.29907, -0.24905, 0.0259], "thumb-l-3": [0.28798, -0.2586, 0.03052], "thumb-r-1": [-0.31419, -0.23603, 0.0196], "thumb-r-2": [-0.29907, -0.24905, 0.0259], "thumb-r-3": [-0.28798, -0.2586, 0.03052], "ear-left": [-0.2, 1.0, 0.0], "ear-right": [0.2, 1.0, 0.0], "boom-mic": [0.26, 0.85, 0.26]};
  const BONE_TIP: Record<string, number[]> = {"pelvis": [0.0, -0.21, 0.0], "abdomen": [0.0, 0.09576, 0.0028], "chest": [0.0, 0.4956, 0.0056], "clavicle-l": [0.224, 0.4956, 0.014], "clavicle-r": [-0.224, 0.4956, 0.014], "thigh-l": [0.1428, -0.6636, 0.0056], "shin-l": [0.1428, -0.9408, 0.0448], "foot-l": [0.1428, -0.98516, 0.05107], "thigh-r": [-0.1428, -0.6636, 0.0056], "shin-r": [-0.1428, -0.9408, 0.0448], "foot-r": [-0.1428, -0.98516, 0.05107], "upper-arm-left": [0.29957, 0.1228, 0.014], "forearm-l": [0.34219, -0.23066, 0.014], "upper-arm-right": [-0.29957, 0.1228, 0.014], "forearm-r": [-0.34219, -0.23066, 0.014], "hand-l": [0.33519, -0.26829, 0.0168], "hand-r": [-0.33519, -0.26829, 0.0168], "neck": [0.0, 0.7336, 0.0056], "head": [0.0, 1.0472, 0.0056], "index-l-1": [0.32471, -0.29748, 0.0168], "index-l-2": [0.32712, -0.31749, 0.0168], "index-l-3": [0.32873, -0.33084, 0.0168], "index-r-1": [-0.32471, -0.29748, 0.0168], "index-r-2": [-0.32712, -0.31749, 0.0168], "index-r-3": [-0.32873, -0.33084, 0.0168], "little-l-1": [0.36447, -0.29053, 0.0168], "little-l-2": [0.36642, -0.30665, 0.0168], "little-l-3": [0.36769, -0.31722, 0.0168], "little-r-1": [-0.36447, -0.29053, 0.0168], "little-r-2": [-0.36642, -0.30665, 0.0168], "little-r-3": [-0.36769, -0.31722, 0.0168], "middle-l-1": [0.33904, -0.30026, 0.0168], "middle-l-2": [0.34173, -0.3225, 0.0168], "middle-l-3": [0.3434, -0.3364, 0.0168], "middle-r-1": [-0.33904, -0.30026, 0.0168], "middle-r-2": [-0.34173, -0.3225, 0.0168], "middle-r-3": [-0.3434, -0.3364, 0.0168], "ring-l-1": [0.35271, -0.29748, 0.0168], "ring-l-2": [0.35512, -0.31749, 0.0168], "ring-l-3": [0.35666, -0.33028, 0.0168], "ring-r-1": [-0.35271, -0.29748, 0.0168], "ring-r-2": [-0.35512, -0.31749, 0.0168], "ring-r-3": [-0.35666, -0.33028, 0.0168], "thumb-l-1": [0.29907, -0.24905, 0.0259], "thumb-l-2": [0.28798, -0.2586, 0.03052], "thumb-l-3": [0.27989, -0.26557, 0.03389], "thumb-r-1": [-0.29907, -0.24905, 0.0259], "thumb-r-2": [-0.28798, -0.2586, 0.03052], "thumb-r-3": [-0.27989, -0.26557, 0.03389], "ear-left": [-0.24, 1.45, 0.02], "ear-right": [0.24, 1.45, 0.02], "boom-mic": [0.45, 0.92, 0.66]};
  const BONE_ENVELOPE: Record<string, number> = {"pelvis": 0.03, "abdomen": 0.03, "chest": 0.03, "clavicle-l": 0.03, "clavicle-r": 0.03, "thigh-l": 0.03, "shin-l": 0.03, "foot-l": 0.03, "thigh-r": 0.03, "shin-r": 0.03, "foot-r": 0.03, "upper-arm-left": 0.03, "forearm-l": 0.03, "upper-arm-right": 0.03, "forearm-r": 0.03, "hand-l": 0.03, "hand-r": 0.03, "neck": 0.03, "head": 0.6, "index-l-1": 0.03, "index-l-2": 0.03, "index-l-3": 0.03, "index-r-1": 0.03, "index-r-2": 0.03, "index-r-3": 0.03, "little-l-1": 0.03, "little-l-2": 0.03, "little-l-3": 0.03, "little-r-1": 0.03, "little-r-2": 0.03, "little-r-3": 0.03, "middle-l-1": 0.03, "middle-l-2": 0.03, "middle-l-3": 0.03, "middle-r-1": 0.03, "middle-r-2": 0.03, "middle-r-3": 0.03, "ring-l-1": 0.03, "ring-l-2": 0.03, "ring-l-3": 0.03, "ring-r-1": 0.03, "ring-r-2": 0.03, "ring-r-3": 0.03, "thumb-l-1": 0.03, "thumb-l-2": 0.03, "thumb-l-3": 0.03, "thumb-r-1": 0.03, "thumb-r-2": 0.03, "thumb-r-3": 0.03, "ear-left": 0.6, "ear-right": 0.6, "boom-mic": 0.6};
  const _closest = new THREE.Vector3();
  const distanceToSegment = (p: THREE.Vector3, s: number[], e: number[]): number => {
    const ab = [e[0] - s[0], e[1] - s[1], e[2] - s[2]];
    const ap = [p.x - s[0], p.y - s[1], p.z - s[2]];
    const abLenSq = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = abLenSq > 1e-12
      ? THREE.MathUtils.clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLenSq, 0, 1)
      : 0;
    _closest.set(s[0] + ab[0] * t, s[1] + ab[1] * t, s[2] + ab[2] * t);
    return p.distanceTo(_closest);
  };
  const computeVertexWeights = (p: THREE.Vector3) => {
    const scored = boneOrder.map((id) => {
      const d = distanceToSegment(p, BONE_JOINT[id], BONE_TIP[id]);
      const u = d / BONE_ENVELOPE[id];
      const falloff = Math.max(0, 1 - u * u);
      return { id, d, w: falloff * falloff };
    });
    scored.sort((a, b) => b.w - a.w);
    const kept = scored.slice(0, 4);
    const total = kept.reduce((sum, c) => sum + c.w, 0);
    const indices = [0, 0, 0, 0];
    const weights = [0, 0, 0, 0];
    if (total > 0) {
      for (let slot = 0; slot < kept.length; slot++) {
        indices[slot] = boneIndexOf.get(kept[slot].id) ?? 0;
        weights[slot] = kept[slot].w / total;
      }
      return { indices, weights, fallback: false };
    }
    // Mandatory zero-sum fallback (PLAN_1.5 §4 / ADR-8). Without it three.js's own
    // normalizeSkinWeights() rewrites an all-zero vertex to (1,0,0,0) against bone 0
    // regardless of distance, which spikes stray vertices toward the hips. Instead:
    // ignore the envelope and pin weight 1.0 to the absolutely nearest bone.
    let nearest = boneOrder[0];
    let nearestDistance = Infinity;
    for (const id of boneOrder) {
      const d = distanceToSegment(p, BONE_JOINT[id], BONE_TIP[id]);
      if (d < nearestDistance) { nearestDistance = d; nearest = id; }
    }
    indices[0] = boneIndexOf.get(nearest) ?? 0;
    weights[0] = 1;
    return { indices, weights, fallback: true };
  };

  // ---- Bake to model space, weight, and bind.
  //
  // The arrangement below was chosen by measurement, not derivation, because the same
  // geometry can be skinned four plausible ways and three of them are wrong. With a
  // vertex authored at model-space (0, 2, 0) fully weighted to a bone at (0, 1, 0) and
  // that bone rotated +90 degrees about X (correct answer: (0, 1, 1)):
  //
  //   pivot transform kept, bind identity     -> rest pose already wrong, no deformation
  //   pivot transform kept, bind matrixWorld  -> (0, 1.5, 0.5): HALF the correct swing,
  //                                              because the pivot applies on top of skinning
  //   geometry baked, pivot bypassed          -> (0, 1, 1): correct
  //   no pivot at all                         -> (0, 1, 1): correct, and identical
  //
  // The last two agreeing is the finding: what matters is that the mesh's own world
  // transform is identity and its geometry lives in the skeleton's space. So each skinned
  // mesh gets its world matrix folded into its vertex data and is reparented to `root`
  // with an identity transform. Meshes are leaves -- components are added to their pivot
  // Group, never to another mesh -- so reparenting one moves nothing else.
  // Pivots back to REST for the bake: the geometry that lands in the buffer must be
  // the same rest pose the skeleton's inverse bind matrices cancel, not the pose.
  nodes["ear-left"]?.rotation.set(0, 0, 0);
  nodes["ear-right"]?.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const skinnedMeshNames: string[] = [];
  let boundCount = 0;
  for (const boneId of boneOrder) {
    const mesh = meshes[boneId];
    if (!mesh) continue;
    const position = mesh.geometry.getAttribute('position');
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    // applyMatrix4 mutates the vertex buffer in place and is NOT idempotent: running it
    // twice on one geometry applies the world matrix squared, and every component lands
    // somewhere it has no reason to be -- the model reads as blown apart rather than
    // wrong. Throw rather than skip, because a silent skip would leave a mesh in the
    // wrong space and the failure would resurface later as a subtler misplacement.
    if (mesh.geometry.userData.worldBaked) {
      throw new Error(
        `geometry for '${boneId}' is already world-baked; baking twice squares the ` +
        'world matrix and scatters the parts. Build a fresh factory instead of re-binding.'
      );
    }
    mesh.geometry.applyMatrix4(mesh.matrixWorld);
    mesh.geometry.userData.worldBaked = true;
    root.add(mesh);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
    // Vertices are model-space now, which is the space the weight function measures in,
    // so no per-vertex matrix multiply is needed any more.
    const count = position.count;
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    const vertex = new THREE.Vector3();
    for (let v = 0; v < count; v++) {
      vertex.fromBufferAttribute(position, v);
      const { indices, weights } = computeVertexWeights(vertex);
      for (let slot = 0; slot < 4; slot++) {
        skinIndices[v * 4 + slot] = indices[slot];
        skinWeights[v * 4 + slot] = weights[slot];
      }
    }
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    skinnedMeshNames.push(boneId);
    const skinned = mesh as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) continue;
    // bindMode is left at its default (AttachedBindMode). The bones live under `root`
    // rather than under any one mesh because a single Skeleton is shared by every skinned
    // mesh and cannot be parented under all of them; with root and each mesh at identity
    // the bone world matrices are the same either way.
    skinned.bind(skeleton, new THREE.Matrix4());
    // A SkinnedMesh's boundingSphere is computed from its REST vertex data and is not
    // recomputed when bones move, so a posed limb that swings outside its rest bounds gets
    // culled and vanishes -- worse, it vanishes only from certain camera angles, which
    // reads as a geometry bug rather than a culling one. Disabling the test outright is
    // chosen over recomputing bounds every frame because these are small, always-onscreen
    // character parts where the test saves nothing. Recorded in userData.rig so a consumer
    // that DOES need culling knows it has to supply its own bounds.
    skinned.frustumCulled = false;
    boundCount += 1;
  }

  // Pose restored on the pivots. The skinned meshes no longer hang off them -- they
  // were reparented to `root` -- so this drives only the non-skinned descendants
  // (ear shells, eye cavities), which have no bone of their own and would otherwise
  // stay at rest while the head they sit on turns. The bones get the same rotations
  // applied separately, so nothing is posed twice.
  nodes["ear-left"]?.rotation.set(0.0, -0.08, 0.0);
  nodes["ear-right"]?.rotation.set(0.0, 0.05, 0.0);
  root.updateMatrixWorld(true);

  // The authored pose, moved from the pivots onto the bones (see _rig_pose_lines). Set
  // AFTER bind() so that the rest pose -- not this one -- is what the skeleton's inverse
  // bind matrices cancel.
  bone_ear_left.rotation.set(0.0, -0.08, 0.0);
  bone_ear_right.rotation.set(0.0, 0.05, 0.0);
  root.updateMatrixWorld(true);
  skeleton.update();
  root.userData.rig = { bones, skeleton, boneOrder, boneIndexOf, skinAttributes: skinnedMeshNames, bound: skinnedMeshNames.length > 0 && boundCount === skinnedMeshNames.length, frustumCulled: false, cullingNote: 'skinned meshes set frustumCulled = false; bone motion does not update a SkinnedMesh boundingSphere, so a consumer that needs culling must recompute bounds per frame' };

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createOperatorRabbitLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Operator Rabbit look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"role": "key light", "kind": "directional", "direction": "high front-right", "color": "neutral daylight", "intensity": "dominant", "notes": "Establishes form falloff across ears and headset; renders the emerald cups with a small specular pop."}, {"role": "fill light", "kind": "hemisphere/environment", "color": "cool ambient", "intensity": "soft", "notes": "Lifts shadow value range; keeps matte white resin soft and even."}, {"role": "rim or environment light", "kind": "environment / back rim", "direction": "from behind, low back-left", "color": "subtle warm", "intensity": "narrow rim", "notes": "Separates the ears and headset band from the hero background."}, {"role": "exposure and tone mapping", "intent": "exposure locked so matte white stays near #F5F5F4 and emerald stays vivid; ACES tone mapping", "notes": "Flat value range avoided; emerald headset is the palette anchor, not a glow."}, {"role": "contact shadow / ground shadow", "behavior": "soft contact shadow under the plinth base on the hero surface", "notes": "Orients the mascot in space at the hero placement."}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createOperatorRabbitEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameOperatorRabbitCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createOperatorRabbitPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureOperatorRabbitRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createOperatorRabbitInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
