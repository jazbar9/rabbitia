import * as THREE from "three";

export const CONEJO_MATERIAL_IDS = [
  "rabbit-white",
  "pale-pink",
  "emerald-headset",
  "charcoal-eyes",
] as const;

export type ConejoMaterialId = (typeof CONEJO_MATERIAL_IDS)[number];

export const CONEJO_PALETTE: Record<ConejoMaterialId, { color: number; roughness: number; metalness: number }> = {
  "rabbit-white": { color: 0xf2f0ed, roughness: 0.82, metalness: 0 },
  "pale-pink": { color: 0xedc9c3, roughness: 0.55, metalness: 0 },
  "emerald-headset": { color: 0x157c50, roughness: 0.42, metalness: 0.12 },
  "charcoal-eyes": { color: 0x2e2e33, roughness: 0.5, metalness: 0 },
};

export type ConejoProportions = {
  /** extra outward splay of each ear around its base, in radians */
  earSplay: number;
  /** slight upward pitch of the whole head cluster, in radians */
  headLift: number;
};

export const CONEJO_PROPORTIONS: ConejoProportions = {
  earSplay: 0.06,
  headLift: 0.02,
};

function conejoMaterialId(material: THREE.Material): ConejoMaterialId | null {
  const spec = (material as THREE.MeshPhysicalMaterial).userData?.sculptMaterial as { id?: string } | undefined;
  const id = spec?.id ?? material.name;
  return (CONEJO_MATERIAL_IDS as readonly string[]).includes(id) ? (id as ConejoMaterialId) : null;
}

export function applyConejoPalette(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.Material | THREE.Material[];
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      const config = CONEJO_PALETTE[conejoMaterialId(entry) as ConejoMaterialId];
      if (!config) continue;
      const physical = entry as THREE.MeshPhysicalMaterial;
      physical.color.set(config.color);
      physical.roughness = config.roughness;
      physical.metalness = config.metalness;
    }
  });
}

export function applyConejoProportions(
  root: THREE.Object3D,
  proportions: Partial<ConejoProportions> = CONEJO_PROPORTIONS,
): void {
  const splay = proportions.earSplay ?? CONEJO_PROPORTIONS.earSplay;
  const lift = proportions.headLift ?? CONEJO_PROPORTIONS.headLift;
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if (object.isBone) bones.set(object.name, object as THREE.Bone);
  });
  bones.get("ear-left")?.rotation.set(-splay, 0, splay * 0.4);
  bones.get("ear-right")?.rotation.set(-splay, 0, -splay * 0.4);
  bones.get("head")?.rotation.set(lift, 0, 0);
}