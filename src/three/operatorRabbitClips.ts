import * as THREE from "three";

export const OPERATOR_RABBIT_CLIP_NAMES = ["idle-wobble", "adjust-mic"] as const;

export type OperatorRabbitClipBuilder = (
  root: THREE.Object3D,
  speed?: number,
) => THREE.AnimationClip[];

type Axis = "x" | "y" | "z";

type BoneAnimation = {
  boneName: string;
  axis: Axis;
  /** rest plus this oscillating (or one-shot) offset, in radians */
  amplitude: number;
  phase: number;
  /** cos loop for idle; sin one-shot for gestures */
  wave: "cos" | "sin";
};

type ClipDef = {
  name: string;
  durationSeconds: number;
  loop: boolean;
  sampleStepSeconds: number;
  bones: BoneAnimation[];
};

const IDLE_CLIP: ClipDef = {
  name: "idle-wobble",
  durationSeconds: 2.6,
  loop: true,
  sampleStepSeconds: 0.2,
  bones: [
    { boneName: "head", axis: "z", amplitude: 0.02, phase: 0.0, wave: "cos" },
    { boneName: "head", axis: "x", amplitude: 0.012, phase: 0.6, wave: "cos" },
    { boneName: "ear-left", axis: "z", amplitude: 0.05, phase: 0.0, wave: "cos" },
    { boneName: "ear-right", axis: "z", amplitude: 0.05, phase: Math.PI, wave: "cos" },
    { boneName: "ear-left", axis: "x", amplitude: 0.02, phase: 0.8, wave: "cos" },
    { boneName: "ear-right", axis: "x", amplitude: 0.02, phase: 0.8, wave: "cos" },
    { boneName: "boom-mic", axis: "x", amplitude: 0.03, phase: 1.2, wave: "cos" },
    { boneName: "chest", axis: "x", amplitude: 0.012, phase: 0.0, wave: "cos" },
  ],
};

const ADJUST_MIC_CLIP: ClipDef = {
  name: "adjust-mic",
  durationSeconds: 1.4,
  loop: false,
  sampleStepSeconds: 0.15,
  bones: [
    { boneName: "boom-mic", axis: "x", amplitude: 0.25, phase: 0.0, wave: "sin" },
    { boneName: "boom-mic", axis: "z", amplitude: 0.12, phase: 0.0, wave: "sin" },
    { boneName: "head", axis: "z", amplitude: 0.04, phase: 0.0, wave: "sin" },
    { boneName: "head", axis: "x", amplitude: 0.02, phase: 0.0, wave: "sin" },
    { boneName: "upper-arm-right", axis: "z", amplitude: 0.15, phase: 0.0, wave: "sin" },
  ],
};

function waveValue(def: BoneAnimation, t: number, duration: number): number {
  if (def.wave === "cos") {
    return def.amplitude * Math.cos((Math.PI * 2 * t) / duration + def.phase);
  }
  return def.amplitude * Math.sin((Math.PI * t) / duration + (def.phase ?? 0));
}

function buildClip(root: THREE.Object3D, def: ClipDef, speed: number): THREE.AnimationClip {
  const duration = def.durationSeconds / speed;
  const step = def.sampleStepSeconds / speed;
  const count = Math.max(2, Math.round(duration / step) + 1);

  const boneNames = [...new Set(def.bones.map((b) => b.boneName))];
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if (object.isBone && boneNames.includes(object.name)) {
      bones.set(object.name, object as THREE.Bone);
    }
  });

  const restQuat = new Map<string, THREE.Quaternion>();
  for (const name of boneNames) {
    const bone = bones.get(name);
    if (bone) restQuat.set(name, bone.quaternion.clone());
  }

  const times = new Float32Array(count);
  const values = new Float32Array(count * boneNames.length * 4);
  const euler = new THREE.Euler();
  const delta = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    const t = i * step;
    times[i] = t;
    boneNames.forEach((name, k) => {
      const dx = def.bones
        .filter((b) => b.boneName === name && b.axis === "x")
        .reduce((sum, b) => sum + waveValue(b, t, duration), 0);
      const dy = def.bones
        .filter((b) => b.boneName === name && b.axis === "y")
        .reduce((sum, b) => sum + waveValue(b, t, duration), 0);
      const dz = def.bones
        .filter((b) => b.boneName === name && b.axis === "z")
        .reduce((sum, b) => sum + waveValue(b, t, duration), 0);
      euler.set(dx, dy, dz);
      delta.setFromEuler(euler);
      const r = restQuat.get(name) ?? new THREE.Quaternion();
      const q = new THREE.Quaternion().multiplyQuaternions(r, delta);
      const o = (i * boneNames.length + k) * 4;
      values[o] = q.x;
      values[o + 1] = q.y;
      values[o + 2] = q.z;
      values[o + 3] = q.w;
    });
  }

  const tracks = boneNames.map((name, k) => {
    const trackValues = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const o = (i * boneNames.length + k) * 4;
      trackValues[i * 4] = values[o];
      trackValues[i * 4 + 1] = values[o + 1];
      trackValues[i * 4 + 2] = values[o + 2];
      trackValues[i * 4 + 3] = values[o + 3];
    }
    const holder: number[] = Array.from(times);
    return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, holder, trackValues);
  });

  const clip = new THREE.AnimationClip(def.name, duration, tracks);
  return clip;
}

export const buildOperatorRabbitClips: OperatorRabbitClipBuilder = (
  root,
  speed = 1,
): THREE.AnimationClip[] => {
  return [buildClip(root, IDLE_CLIP, speed), buildClip(root, ADJUST_MIC_CLIP, speed)];
};