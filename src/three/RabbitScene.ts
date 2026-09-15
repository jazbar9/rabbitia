import { mountParticleRabbit, type ParticleRabbitOptions } from "./particleRabbit";

export type { ParticleRabbitOptions } from "./particleRabbit";

/**
 * Mount the particle-based rabbit scene into a container element.
 * The rabbit silhouette is sampled from the reference PNG and rendered as a
 * cloud of white + emerald particles with floating motion, a very-slow yaw
 * sway and pointer interaction. Returns an unmount function for cleanup.
 */
export function mountRabbitScene(
  container: HTMLElement,
  options: ParticleRabbitOptions = {},
): () => void {
  return mountParticleRabbit(container, options);
}