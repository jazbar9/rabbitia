import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = resolve(repoRoot, "public", "models");
const outPath = resolve(outDir, "rabbit-operator.glb");
const importFile = (relative) => import(pathToFileURL(resolve(repoRoot, relative)).href);

const { createOperatorRabbitModel } = await importFile("src/three/createOperatorRabbitModel.ts");
const { buildOperatorRabbitClips } = await importFile("src/three/operatorRabbitClips.ts");

const model = createOperatorRabbitModel({ castShadow: true, receiveShadow: true });
const clips = buildOperatorRabbitClips(model, 1);

const exporter = new GLTFExporter();
globalThis.FileReader = class FileReaderShim {
  result;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      if (this.onloadend) this.onloadend();
    });
  }
};
const arrayBuffer = await new Promise((resolvePromise, rejectPromise) => {
  exporter.parse(
    model,
    (result) => resolvePromise(result),
    (error) => rejectPromise(error),
    { binary: true, animations: clips },
  );
});

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, Buffer.from(arrayBuffer));
console.log(`wrote ${outPath} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KiB)`);
console.log("clips:", clips.map((c) => `${c.name} (${c.duration.toFixed(2)}s, ${c.tracks.length} bone tracks)`).join(", "));