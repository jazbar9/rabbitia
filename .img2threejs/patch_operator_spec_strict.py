import json
import re
import shutil

SPEC = r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs\object-sculpt-operator-rabbit-spec.json"
BAK = SPEC.replace(".json", ".pre-strict.json")

shutil.copyfile(SPEC, BAK)

with open(SPEC, encoding="utf-8") as fh:
    spec = json.load(fh)

text = json.dumps(spec, ensure_ascii=False)

TOKENS = [
    ("inner-ear-l", "inner-ear-left"),
    ("inner-ear-r", "inner-ear-right"),
    ("ear-l", "ear-left"),
    ("ear-r", "ear-right"),
    ("cup-l", "cup-left"),
    ("cup-r", "cup-right"),
    ("eye-l", "eye-left"),
    ("eye-r", "eye-right"),
    ("arm-l", "arm-left"),
    ("arm-r", "arm-right"),
    ("leg-l", "leg-left"),
    ("leg-r", "leg-right"),
]
for old, new in TOKENS:
    text = re.sub(r"(?<![A-Za-z0-9])" + re.escape(old) + r"(?![A-Za-z0-9])", new, text)

spec = json.loads(text)

components = {c["id"]: c for c in spec["componentTree"]}

for cid in ("boom-mic", "eye-left", "eye-right"):
    if cid in components:
        components[cid]["topologyClass"] = "assembled-solid"

BONES = [
    {"id": "ear-left", "parent": "head", "jointPos": [-0.20, 1.00, 0.00], "tipPos": [-0.24, 1.45, 0.02],
     "component": "ear-left", "role": "skinned", "chain": "head"},
    {"id": "ear-right", "parent": "head", "jointPos": [0.20, 1.00, 0.00], "tipPos": [0.24, 1.45, 0.02],
     "component": "ear-right", "role": "skinned", "chain": "head"},
    {"id": "boom-mic", "parent": "head", "jointPos": [0.26, 0.85, 0.26], "tipPos": [0.45, 0.92, 0.66],
     "component": "boom-mic", "role": "skinned", "chain": "head"},
]
for bone in BONES:
    for existing in spec["rig"]["bones"]:
        if existing["id"] == bone["id"]:
            existing.update(bone)
            break
    else:
        spec["rig"]["bones"].append(bone)

ISO = [
    (240, 245, 244, 1.0),   # matte white resin
    (223, 223, 222, 1.0),   # secondary white/gray
    (183, 157, 154, 1.0),   # soft pink inner ear
    (21, 124, 80, 1.0),     # emerald headset
    (12, 46, 29, 1.0),      # headset padding
]
def rgba(c):
    r, g, b, a = c
    return f"rgba({round(r)}, {round(g)}, {round(b)}, {a})"

MATERIAL = {
    "matte-white-resin": ("plastic", rgba(ISO[0]), rgba(ISO[1])),
    "soft-pink-inner-ear": ("plastic", rgba(ISO[2]), rgba(ISO[1])),
    "emerald-headset": ("plastic", rgba(ISO[3]), rgba(ISO[4])),
    "headset-padding": ("plastic", rgba(ISO[4]), rgba(ISO[3])),
    "ink-eye": ("plastic", rgba(ISO[4]), rgba(ISO[0])),
}
COMPONENT_MATERIAL = {
    "root": "matte-white-resin", "torso": "matte-white-resin", "head": "matte-white-resin",
    "ear-left": "matte-white-resin", "ear-right": "matte-white-resin",
    "inner-ear-left": "soft-pink-inner-ear", "inner-ear-right": "soft-pink-inner-ear",
    "headband": "headset-padding", "cup-left": "emerald-headset", "cup-right": "emerald-headset",
    "boom-mic": "emerald-headset", "mic-cap": "headset-padding",
    "eye-left": "ink-eye", "eye-right": "ink-eye",
    "arm-left": "matte-white-resin", "arm-right": "matte-white-resin",
    "leg-left": "matte-white-resin", "leg-right": "matte-white-resin",
}

GRADIENT_FOR = {
    "root": "linear", "torso": "linear", "head": "linear",
    "ear-left": "linear", "ear-right": "linear",
    "inner-ear-left": "radial", "inner-ear-right": "radial",
    "headband": "linear", "cup-left": "linear", "cup-right": "linear",
    "boom-mic": "linear", "mic-cap": "radial",
    "eye-left": "radial", "eye-right": "radial",
    "arm-left": "linear", "arm-right": "linear",
    "leg-left": "linear", "leg-right": "linear",
}

for cid, comp in components.items():
    mat_id = COMPONENT_MATERIAL[cid]
    mat_class, dom, sec = MATERIAL[mat_id]
    comp["colorMaterialRecipe"] = {
        "dominantAlbedo": dom,
        "secondaryAlbedo": sec,
        "materialClass": mat_class,
        "materialClassConfidence": 0.9 if "inner-ear" in cid or cid in ("torso", "head", "headband", "cup-left", "cup-right", "boom-mic") else 0.55,
        "colorGradient": {
            "type": GRADIENT_FOR[cid],
            "stops": [{"color": dom, "position": 0}, {"color": sec, "position": 1}],
        },
    }

FEATURE_EVIDENCE = ["operator-rabbit-front"]
feature_entries = {
    "torso": [{"id": "neck-collar", "name": "Collared neck transition on the torso", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE}],
    "head": [
        {"id": "ear-anchor-left", "name": "Clean junction where the left ear meets the crown", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE},
        {"id": "ear-anchor-right", "name": "Clean junction where the right ear meets the crown", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE},
        {"id": "facing-eye-pair", "name": "Forward glass eyes on the blank face field", "type": "gloss", "evidenceRefs": FEATURE_EVIDENCE},
    ],
    "headband": [{"id": "band-arc", "name": "Crown arc of the headband", "type": "bevel", "evidenceRefs": FEATURE_EVIDENCE}],
    "cup-left": [{"id": "pad-rim", "name": "Pad rim opening to the ear seat", "type": "ridge", "evidenceRefs": FEATURE_EVIDENCE}],
    "cup-right": [
        {"id": "mic-mount", "name": "Boom mic mount on the right cup", "type": "mount", "evidenceRefs": FEATURE_EVIDENCE},
        {"id": "pad-rim", "name": "Pad rim opening to the ear seat", "type": "ridge", "evidenceRefs": FEATURE_EVIDENCE},
    ],
}
for cid, entries in feature_entries.items():
    feats = components[cid].setdefault("localFeatures", [])
    if not isinstance(feats, list):
        feats = []
        components[cid]["localFeatures"] = feats
    existing = {f.get("id") if isinstance(f, dict) else f for f in feats}
    for entry in entries:
        if entry["id"] not in existing:
            feats.append(entry)

TEXTURELESS_EVIDENCE = [
    "operator-rabbit-front.png flat-colour brand-shape mascot: foreground 0.1854, no grain/print/pores in visible faces",
    "intake assessment records palette-only albedo (white/gray body, emerald headset, soft pink inner ears); identity is silhouette/proportion/colour boundaries",
    "styleHeads 2.0 chibi figurine route  —  surface is smooth primer-resin with zero relief; no texel-bearing surface expected",
]
AO_BLOCK = {"cavityStrength": 0.3, "scale": 1.0, "occlusionBalance": 0.5}

LOCAL_OVERRIDES = {
    "matte-white-resin": [
        {"id": "chest-soft-ao", "description": "Soft contact shading under ear anchors and around the neck collar",
         "type": "multiply", "weights": {"head": 0.12, "torso": 0.10},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.4, "grazing": 0.2}},
    ],
    "soft-pink-inner-ear": [
        {"id": "inner-ear-gather", "description": "Converging gather shading inside the ear void",
         "type": "multiply", "weights": {"inner-ear-left": 0.18, "inner-ear-right": 0.18},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.1}},
    ],
    "emerald-headset": [
        {"id": "cup-inner-shadow", "description": "Radial falloff inside each cup opening toward the ear seat",
         "type": "multiply", "weights": {"cup-left": 0.3, "cup-right": 0.3},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.1}},
    ],
    "headset-padding": [
        {"id": "band-under-sweep", "description": "Sweep shadow under the band crown where it rests on the head",
         "type": "multiply", "weights": {"headband": 0.2},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.4, "grazing": 0.2}},
    ],
    "ink-eye": [
        {"id": "eye-lid-wrap", "description": "Slight occlusion where the eyes recess into the face",
         "type": "multiply", "weights": {"eye-left": 0.15, "eye-right": 0.15},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.0}},
    ],
}

TEXTURE_AUTHORING_FIELDS = (
    "normal", "bump", "displacement", "surfaceFrequencyBands",
    "textureProjection", "textureResolution", "referencePbr",
)

for mat in spec["materials"]:
    mid = mat["id"]
    mat["textureless"] = {"declared": True, "evidence": list(TEXTURELESS_EVIDENCE)}
    for field in TEXTURE_AUTHORING_FIELDS:
        mat.pop(field, None)
    rough = mat.get("roughness")
    if not isinstance(rough, dict) or not rough.get("variation"):
        mat["roughness"] = {"base": 0.55, "variation": 0.05, "localResponse": 0.0}
    mat.setdefault("colorVariation", {"palette": [], "pattern": "flat", "amplitude": 0.02, "heightCorrelation": 0.0})
    ao = mat.get("ambientOcclusion")
    if not isinstance(ao, dict) or not ao:
        mat["ambientOcclusion"] = dict(AO_BLOCK)
    for name, override in {"wear": {}, "dirt": {}}.items():
        if not isinstance(mat.get(name), dict):
            mat[name] = dict(override)
    mat["localOverrides"] = LOCAL_OVERRIDES.get(mid, [])

assessment = spec.setdefault("preSpecAssessment", {})
assessment["anatomy"] = {
    "applies": True,
    "sourceImage": "C:\\Users\\DELL\\Desktop\\RABBIT IA\\03-resources\\operator-rabbit-front.png",
    "styleHeads": 2.0,
    "proportions": {"headUnit": 0.507, "torso": 0.22, "legs": 0.75, "shoulderWidth": 0.92, "hipWidth": 0.92},
    "pose": {"type": "standing-upright-symmetric", "jointAngles": {}},
    "faceLandmarks": {"hairline": 0.32, "eyeLine": 0.5, "eyeSpacing": 0.3, "noseBase": 0.6, "mouthLine": 0.68, "earTop": 0.0, "earBottom": 0.4},
    "features": [
        {"name": "tall-pair-ears", "kind": "head-top", "note": "two tall narrow vertical ears flanking a centred headband"},
        {"name": "headset-band-and-cups", "kind": "accessory", "note": "crown arc band with padded side cups at ear height"},
        {"name": "boom-mic-assembly", "kind": "accessory", "note": "right-cup mounted mic arm curving to mouth height"},
        {"name": "blank-front-face", "kind": "face", "note": "blank mascot face, no muzzle or mouth, forward glass eyes"},
        {"name": "short-tapered-arms", "kind": "limb", "note": "short arms reaching just below the torso waist"},
        {"name": "stout-legs", "kind": "limb", "note": "short stout legs tapering to rounded feet on the baseline"},
    ],
}

DETAILS = [
    {"id": "neck-collar-linework", "kind": "linework", "note": "collared neck transition on the torso",
     "mapsTo": {"type": "component.localFeatures", "ref": "torso/neck-collar"}},
    {"id": "ear-anchor-seam", "kind": "seam", "note": "clean junction where each ear meets the head crown",
     "mapsTo": {"type": "component.localFeatures", "ref": "head/ear-anchor-left"}},
    {"id": "band-arc-bevel", "kind": "bevel", "note": "soft bevel along the headband crown arc",
     "mapsTo": {"type": "component.localFeatures", "ref": "headband/band-arc"}},
    {"id": "cup-seat-ridge", "kind": "ridge", "note": "pad rim where each cup opens to the ear seat",
     "mapsTo": {"type": "component.localFeatures", "ref": "cup-right/mic-mount"}},
    {"id": "cup-pad-contour", "kind": "contour", "note": "outward pad contour around the left cup rim",
     "mapsTo": {"type": "component.localFeatures", "ref": "cup-left/pad-rim"}},
    {"id": "chest-soft-ao", "kind": "stain", "note": "subtle contact shading below ear anchors and neck collar",
     "mapsTo": {"type": "material.localOverrides", "ref": "matte-white-resin/chest-soft-ao"}},
]
assessment.setdefault("detailInventory", {})
assessment["detailInventory"].update({
    "targetMinDetails": 6,
    "details": DETAILS,
    "note": "identity-defining details enumerated from the operator-rabbit front reference before code generation",
})

BUILD_PASSES = [
    "blockout", "structural-pass", "proportion-lock", "feature-placement", "form-refinement",
    "material-pass", "surface-pass", "lighting-pass", "interaction-pass", "optimization-pass",
]
spec["buildPasses"] = []
for bpid in BUILD_PASSES:
    spec["buildPasses"].append({
        "id": bpid,
        "goal": {
            "blockout": "Match overall silhouette and stance proportions from the front reference",
            "structural-pass": "Resolve component hierarchy, attachment sockets and topology classes",
            "proportion-lock": "Lock measured proportions (styleHeads 2.0, headUnit 0.507, legs 0.75 HU) into the rig",
            "feature-placement": "Place ear anchors, headband arc, cups, boom mic and eye pair on the face field",
            "form-refinement": "Refine ear taper, cup pad contour and arm/leg taper",
            "material-pass": "Apply the 5-material brand palette with colour boundaries and AO masks",
            "surface-pass": "Confirm flat-colour textureless surfaces read correctly with the lighting rig",
            "lighting-pass": "Key/fill/rim with contact-shaded ground shadow",
            "interaction-pass": "Idle sway and adjust-mic animation reliability",
            "optimization-pass": "Limit mesh complexity for the static mascot hero",
        }[bpid],
        "componentRefs": {
            "blockout": ["root", "torso", "head", "ear-left", "ear-right", "leg-left", "leg-right"],
            "structural-pass": list(components.keys()),
            "material-pass": ["torso", "head", "ear-left", "ear-right", "headband", "cup-left", "cup-right", "boom-mic"],
        }.get(bpid, [c["id"] for c in spec["componentTree"]]),
        "acceptance": [],
    })

pipeline = spec.setdefault("sculptPipeline", {})
pipeline["passGateMode"] = "locked-sequential"
pipeline["passOrder"] = BUILD_PASSES
pipeline.setdefault("currentPass", "blockout")
pipeline.setdefault("completedPasses", [])
pipeline.setdefault("lastCompletedPass", "")

with open(SPEC, "w", encoding="utf-8") as fh:
    json.dump(spec, fh, ensure_ascii=False, indent=2)

print("patched", SPEC)
print("backup:", BAK)
print("components:", len(components))
print("topologyClasses:", {c["id"]: c.get("topologyClass") for c in components.values()})
print("rig bones:", len(spec["rig"]["bones"]))
print("localFeatures comps:", [c["id"] for c in components.values() if c.get("localFeatures")])
print("material ids:", [m["id"] for m in spec["materials"]])
print("textureless:", all(m.get("textureless", {}).get("declared") for m in spec["materials"]))
print("localOverrides non-empty:", all(m.get("localOverrides") for m in spec["materials"]))
print("detailInventory:", len(assessment["detailInventory"]["details"]), "details")
print("anatomy.applies:", assessment["anatomy"]["applies"], "| styleHeads:", assessment["anatomy"]["styleHeads"])
print("buildPasses:", BUILD_PASSES)
print("passOrder synced:", pipeline["passOrder"] == BUILD_PASSES)