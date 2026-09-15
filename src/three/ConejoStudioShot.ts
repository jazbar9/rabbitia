import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  createConejoRabbitModel,
  frameConejoRabbitCamera,
} from "./createConejoRabbitModel";
import { applyConejoPalette, applyConejoProportions } from "./conejoModelConfig";

export type ConejoStudioCam = "front" | "threequarter" | "side";

const CAM_AZIMUTH: Record<ConejoStudioCam, number> = {
  front: 0,
  threequarter: -40,
  side: 90,
};

const CAM_ELEVATION: Record<ConejoStudioCam, number> = {
  front: 2,
  threequarter: 5,
  side: 2,
};

export function mountConejoStudioShot(
  container: HTMLElement,
  cam: ConejoStudioCam = "front",
  options: { maskMaterial?: boolean } = {},
): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = options.maskMaterial ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xfafafa, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  const camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );

  const model = createConejoRabbitModel({
    castShadow: true,
    receiveShadow: true,
  });
  applyConejoPalette(model);
  applyConejoProportions(model);

  if (options.maskMaterial) {
    const maskColors: Record<string, number> = {
      "rabbit-white": 0xff0000,
      "pale-pink": 0x00ff00,
      "emerald-headset": 0x0000ff,
      "charcoal-eyes": 0x000000,
    };
    model.traverse((object) => {
      if (!object.isMesh) return;
      const mesh = object as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[];
      const materials = Array.isArray(material) ? material : [material];
      for (const entry of materials) {
        const spec = (entry as THREE.MeshPhysicalMaterial).userData?.sculptMaterial as
          | { id?: string }
          | undefined;
        const id = spec?.id ?? entry.name;
        const color = maskColors[id];
        if (color !== undefined) {
          (entry as THREE.MeshPhysicalMaterial).color.set(color);
          (entry as THREE.MeshPhysicalMaterial).emissive.set(color);
          (entry as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.0;
        }
      }
    });
  }
  scene.add(model);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3, 48),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -size.y / 2 - 0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
  keyLight.position.set(1.2, 2.4, 2.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const fillLight = new THREE.HemisphereLight(0xffffff, 0x303030, 0.75);
  scene.add(fillLight);

  const sideFill = new THREE.DirectionalLight(0xffffff, 0.45);
  sideFill.position.set(-1.8, 1.0, 1.4);
  scene.add(sideFill);

  const rimLight = new THREE.DirectionalLight(0xfff2d9, 0.4);
  rimLight.position.set(-2.2, 0.8, -1.8);
  scene.add(rimLight);

  frameConejoRabbitCamera(camera, model, {
    margin: 1.25,
    azimuthDeg: CAM_AZIMUTH[cam],
    elevationDeg: CAM_ELEVATION[cam],
  });

  let disposed = false;

  function onResize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener("resize", onResize);

  function animate(): void {
    if (disposed) return;
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  return () => {
    disposed = true;
    window.removeEventListener("resize", onResize);
    pmremGenerator.dispose();
    envTexture.dispose();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}