import * as THREE from "three";
import { decodeRabbitSilhouette } from "./rabbitSilhouette";

/** Configuration for the particle rabbit. Every visual/animation knob is tunable. */
export interface ParticleRabbitOptions {
  /** Target particle count sampled from the silhouette. Default 2300 (range 1500-3000). */
  particleCount?: number;
  /** Sprite size in world units. Default 0.055. */
  size?: number;
  /** Primary (rabbit) particle color. Default warm white. */
  color?: THREE.ColorRepresentation;
  /** Secondary AI/data particle color. Default tech emerald. */
  accentColor?: THREE.ColorRepresentation;
  /** Fraction of particles rendered as accents (AI/data). Default 0.15. */
  accentRatio?: number;
  /** Pointer displacement strength in world units at the push core. Default 0.22. */
  interactionStrength?: number;
  /** Pointer interaction radius in world units. Default 1.15. */
  interactionRadius?: number;
  /** Exponential return speed (1/s) after a pointer push. Default 3.5. */
  restitution?: number;
  /** Master speed multiplier for all motion. Default 1. */
  speed?: number;
  /** Yaw sway amplitude in radians (continuous very-slow overall rotation). Default 0.18. */
  maxSway?: number;
  /** Yaw sway frequency (rad/s). Default 0.55. */
  swayFrequency?: number;
  /** Floating motion amplitude, world units. Default 0.022. */
  floatAmplitude?: number;
  /** Depth scatter range along z (world units). Default 0.7. */
  depth?: number;
  /** Height of the rabbit in world units (fits the container). Default 3.4. */
  height?: number;
  /** Canvas backdrop: 'dark' (soft radial) or 'transparent'. Default 'dark'. */
  background?: "dark" | "transparent";
  /** Max devicePixelRatio used. Default 2. */
  pixelRatio?: number;
  /** Seed for deterministic layout. Default 1. */
  seed?: number;
  /** Enable pointer interaction. Default true. */
  interactive?: boolean;
}

/** Self-contained, reusable particle-rabbit scene. */
export interface ParticleRabbit {
  mount(container: HTMLElement): () => void;
  setOptions(partial: Partial<ParticleRabbitOptions>): void;
}

const DEFAULTS: Required<ParticleRabbitOptions> = {
  particleCount: 2300,
  size: 0.055,
  color: 0xf6f4ef,
  accentColor: 0x36e2a5,
  accentRatio: 0.15,
  interactionStrength: 0.22,
  interactionRadius: 1.15,
  restitution: 3.5,
  speed: 1,
  maxSway: 0.18,
  swayFrequency: 0.55,
  floatAmplitude: 0.022,
  depth: 0.7,
  height: 3.4,
  background: "dark",
  pixelRatio: 2,
  seed: 1,
  interactive: true,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSpriteTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ParticleRabbitScene implements ParticleRabbit {
  private options: Required<ParticleRabbitOptions>;

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private group = new THREE.Group();
  private points!: THREE.Points;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.PointsMaterial;
  private texture!: THREE.Texture;
  private positionAttr!: THREE.BufferAttribute;
  private container!: HTMLElement;

  private count = 0;
  private home = new Float32Array(0);
  private phase = new Float32Array(0);
  private amp = new Float32Array(0);
  private spd = new Float32Array(0);
  private disp = new Float32Array(0);

  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;
  private running = true;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private pointerTarget = new THREE.Vector3();
  private pointerActive = false;
  private disposers: Array<() => void> = [];

  constructor(options: ParticleRabbitOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  setOptions(partial: Partial<ParticleRabbitOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  /** Mount into a container; returns an unmount function. */
  mount(container: HTMLElement): () => void {
    this.container = container;
    this.build();
    this.attachEvents();
    this.resize();
    this.animate();
    return () => this.dispose();
  }

  // ------------------------------------------------------------------ setup

  private build(): void {
    const o = this.options;
    const width = this.container.clientWidth || 320;
    const height = this.container.clientHeight || 320;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.pixelRatio));
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = "block";
    this.container.appendChild(this.renderer.domElement);

    this.applyBackdrop();

    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    this.scene.add(this.camera);
    this.scene.add(this.group);

    const rng = mulberry32(o.seed);
    const mask = decodeRabbitSilhouette();
    const gw = 128;
    const gh = 220;
    const occupied: Array<[number, number]> = [];
    for (let row = 0; row < gh; row += 1) {
      for (let col = 0; col < gw; col += 1) {
        const cell = (row * gw + col) >> 3;
        const bit = (mask[cell] >> (7 - ((row * gw + col) & 7))) & 1;
        if (bit) occupied.push([col, row]);
      }
    }
    const n = Math.max(100, Math.min(Math.round(o.particleCount), 6000));
    const localY = (row: number): number => 0.5 - (row + 0.5) / gh;
    const localX = (col: number): number => (col + 0.5) / gw - 0.5;
    const xScale = o.height * 0.5;

    this.count = n;
    this.home = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    this.amp = new Float32Array(n);
    this.spd = new Float32Array(n);
    this.disp = new Float32Array(n * 2);

    const colors = new Float32Array(n * 3);
    const primary = new THREE.Color(o.color);
    const accent = new THREE.Color(o.accentColor);
    const zRange = o.depth;
    const jitter = o.height / gh;

    for (let i = 0; i < n; i += 1) {
      const [col, row] = occupied[Math.floor(rng() * occupied.length)];
      const px = localX(col) * xScale + (rng() - 0.5) * jitter;
      const py = localY(row) * xScale + (rng() - 0.5) * jitter * 0.7;

      const cx = (px * 0.6) / xScale;
      const cy = (py * 0.6) / xScale;
      const curvature = (1 - Math.sqrt(cx * cx + cy * cy)) * 0.28;
      const pz = (rng() - 0.5) * zRange + curvature * zRange * 0.5;

      this.home[i * 3] = px;
      this.home[i * 3 + 1] = py;
      this.home[i * 3 + 2] = pz;
      this.phase[i] = rng() * Math.PI * 2;
      this.amp[i] = 0.62 + rng() * 0.75;
      this.spd[i] = 0.55 + rng() * 0.9;

      // bias accents toward the head/ears so the "AI data" reads on top
      const upper = py > o.height * 0.12 ? 1.5 : 1;
      const isAccent = rng() < Math.min(1, o.accentRatio * upper);
      const c = isAccent ? accent : primary;
      const lum = THREE.MathUtils.clamp(1 + pz * 0.22, 0.88, 1.1);
      colors[i * 3] = c.r * lum;
      colors[i * 3 + 1] = c.g * lum;
      colors[i * 3 + 2] = c.b * lum;
    }

    this.texture = makeSpriteTexture();
    this.material = new THREE.PointsMaterial({
      size: o.size,
      map: this.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: o.background === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });

    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.positionAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  private applyBackdrop(): void {
    this.container.classList.toggle(
      "rabbit-3d--dark",
      this.options.background === "dark",
    );
  }

  private fitDistance(): number {
    const fov = this.camera ? this.camera.fov : 35;
    const halfH = this.options.height * 0.5 * 1.06;
    return halfH / Math.tan((fov * Math.PI) / 360);
  }

  // ------------------------------------------------------- events & loop

  private attachEvents(): void {
    const el = this.renderer.domElement;
    const o = this.options;

    const toPointer = (event: PointerEvent): void => {
      if (!o.interactive) return;
      const rect = el.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
      if (hit) {
        this.group.worldToLocal(hit);
        this.pointerTarget.copy(hit);
        this.pointerActive = true;
      }
    };
    const pointerLeave = (): void => {
      this.pointerActive = false;
    };

    el.addEventListener("pointermove", toPointer);
    el.addEventListener("pointerdown", toPointer);
    el.addEventListener("pointerleave", pointerLeave);
    this.disposers.push(() => {
      el.removeEventListener("pointermove", toPointer);
      el.removeEventListener("pointerdown", toPointer);
      el.removeEventListener("pointerleave", pointerLeave);
    });

    this.io = new IntersectionObserver(
      (entries) => {
        if (this.disposed) return;
        this.running = entries.some((e) => e.isIntersecting) && !document.hidden;
      },
      { threshold: 0 },
    );
    this.io.observe(el);
    this.disposers.push(() => this.io?.disconnect());

    const onVisibility = (): void => {
      if (this.disposed) return;
      this.running = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.disposers.push(() =>
      document.removeEventListener("visibilitychange", onVisibility),
    );

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.disposers.push(() => this.ro?.disconnect());
  }

  private resize(): void {
    if (!this.renderer || this.disposed) return;
    const width = this.container.clientWidth || 320;
    const height = this.container.clientHeight || 320;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.position.z = this.fitDistance();
    this.camera.updateProjectionMatrix();
  }

  private animate(): void {
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    if (this.disposed) return;
    if (this.running) {
      const delta = this.clock.getDelta();
      this.update(delta);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.clock.getDelta();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(delta: number): void {
    const o = this.options;
    const s = o.speed;
    const t = this.clock.elapsedTime;

    // continuous, very-slow overall sway (yaw + faint roll)
    this.group.rotation.y = Math.sin(t * o.swayFrequency * s) * o.maxSway;
    this.group.rotation.z = Math.sin(t * o.swayFrequency * 0.5 * s) * o.maxSway * 0.12;

    const restitutionK = 1 - Math.exp(-o.restitution * delta);
    const pos = this.positionAttr.array as Float32Array;
    const home = this.home;
    const phase = this.phase;
    const amp = this.amp;
    const spd = this.spd;
    const disp = this.disp;
    const n = this.count;
    const fa = o.floatAmplitude;
    const push = o.interactive && this.pointerActive;
    const ptrX = this.pointerTarget.x;
    const ptrY = this.pointerTarget.y;
    const radius = o.interactionRadius;
    const strength = o.interactionStrength;

    for (let i = 0; i < n; i += 1) {
      const i3 = i * 3;
      const i2 = i * 2;

      // smooth return to target positions
      disp[i2] *= 1 - restitutionK;
      disp[i2 + 1] *= 1 - restitutionK;

      const fx = Math.sin(t * spd[i] * s * 0.9 + phase[i]) * amp[i] * fa;
      const fy = Math.sin(t * spd[i] * s * 1.25 + phase[i]) * amp[i] * fa * 1.1;
      const fz = Math.sin(t * spd[i] * s * 0.6 + phase[i]) * amp[i] * fa * 0.8;

      const px = home[i3] + fx;
      const py = home[i3 + 1] + fy;

      if (push) {
        const dx = px - ptrX;
        const dy = py - ptrY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < radius) {
          const falloff = Math.pow(1 - dist / radius, 2);
          const inv = strength * falloff / dist;
          disp[i2] += dx * inv;
          disp[i2 + 1] += dy * inv;
        }
      }

      pos[i3] = px + disp[i2];
      pos[i3 + 1] = py + disp[i2 + 1];
      pos[i3 + 2] = home[i3 + 2] + fz;
    }
    this.positionAttr.needsUpdate = true;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.container.classList.remove("rabbit-3d--dark");
  }
}

/** Mount a particle-rabbit scene into a container. Returns an unmount function. */
export function mountParticleRabbit(
  container: HTMLElement,
  options: ParticleRabbitOptions = {},
): () => void {
  const scene = new ParticleRabbitScene(options);
  return scene.mount(container);
}