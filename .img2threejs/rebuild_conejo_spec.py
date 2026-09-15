"""Rebuild the conejo (sitting low-poly) spec from the validated operator-rabbit spec.

Keeps the proven strict-validated skeleton (schema, gates already satisfied) and
applies the conejo design delta (SPEC V3, authoritative user dimensions):
  - TOTAL 1.18 x 1.5 x 1.05; head 0.76 x 0.62 x 0.65 with a small protruding muzzle +Z
  - EXACTLY TWO LONG rabbit ears (0.18 x 0.65 x 0.10) mounted at the crown, vertical,
    wide flattened wedge (base->tip taper), clear V-gap, pale-pink inner faces
  - two small DARK charcoal eyes + tiny pale-pink triangular nose on the muzzle
  - torso 0.76 x 0.62 x 0.66 squat sitting, front paws together, big haunches, round tail
  - emerald TECH HEADSET: thin tilted halo band above/behind the head (not a helmet),
    small earcups ~0.20 on the temples, short boom-mic from the LEFT cup to the muzzle
  - materials (max 4): rabbit-white #F2F0ED / pale-pink #EDC9C3 / emerald #157C50 / charcoal #2E2E33
  - anti-insect gate: ears + muzzle must read RABBIT even without the headset
  - low-poly: tessellation tier low (<=4500 tris) + flatShading true on every material
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs")
SRC = ROOT / "object-sculpt-operator-rabbit-spec.json"
DST = ROOT / "object-sculpt-conejo-spec.json"

IMG = r"C:\Users\DELL\Desktop\RABBIT IA\03-resources\conejo.png"

FEATURE_EVIDENCE = ["conejo-front", "conejo-side"]

shutil.copyfile(SRC, ROOT / "object-sculpt-conejo-spec.base.json")

with open(SRC, encoding="utf-8") as fh:
    s = json.load(fh)

# ----------------------------------------------------------------------------- metadata
s["targetName"] = "Conejo Rabbit"
s["targetId"] = "conejo"
s["sourceImage"] = IMG
s["suitability"] = "conditional"

s["referenceCamera"]["note"] = (
    "SKIPPED: flat-colour textureless low-poly mascot route; no photo projection. "
    "Proportions/silhouette authored from the user design brief for conejo.png."
)

s["preSpecAssessment"]["sourceImage"] = IMG
s["preSpecAssessment"]["unknownsToResolveBeforeImplementation"] = []

s["scores"] = {
    "object_isolation": 2,
    "silhouette_readability": 2,
    "depth_inference": 1,
    "primitive_decomposition": 2,
    "material_procedurality": 2,
    "occlusion_risk": 1,
    "interaction_fit": 2,
}

# ----------------------------------------------------------------------------- coordinate frame
s["coordinateFrame"]["scaleReference"] = "head ~0.76 units wide; full sitting mascot 1.5 tall; ears rise from the crown to ~1.5 (SPEC V3)"

# ----------------------------------------------------------------------------- silhouette
s["silhouette"] = {
    "boundingShape": (
        "Sitting low-poly rabbit (SPEC V3): a round head (0.76x0.62) with a small protruding "
        "muzzle toward +Z; EXACTLY TWO LONG rabbit ears (0.18x0.65 wide flattened wedges) rising "
        "vertically from the crown with a clear V-gap; a thin emerald halo band above/behind the "
        "head with small earcups (~0.20) on the temples and a short boom-mic from the LEFT cup to "
        "the muzzle; two small DARK charcoal eye dots and a tiny pale-pink nose on the face; "
        "front paws together on the belly; big haunches and a small round tail. MUST read RABBIT "
        "even with the headset removed -- never an insect/bee/alien."
    ),
    "aspectRatios": [
        {"label": "figure-height-to-width", "ratio": 1.27, "note": "squat sitting rabbit, ears crown the mass"},
        {"label": "head-height-to-figure", "ratio": 0.27, "note": "head about a quarter plus ears to the top"},
    ],
    "symmetry": "bilateral (headset shadow except the left boom-mic)",
    "dominantCurves": [
        "two long RABBIT ears rising vertically from the crown with a V-gap, tapered base->tip",
        "rounded head with cheeks and a small protruding muzzle (rabbit snout)",
        "curved back line of the sitting torso in side view",
        "forward bowl of the belly with the front paws resting together",
        "thin halo band leaning over the crown behind the ears, earcups at the temples",
        "short forward sweep of the boom-mic arm from the left cup toward the muzzle",
    ],
    "negativeSpaces": [
        "V-gap between the two ears against the background",
        "nose shadow pocket where the muzzle meets the face",
        "haunch crotch void between the front paws and the folded legs",
        "clear space under the boom-mic arm beside the muzzle",
    ],
    "landmarks": [
        {"name": "ear-tip-left", "pos": [-0.31, 1.51, -0.18]},
        {"name": "ear-tip-right", "pos": [0.32, 1.53, -0.18]},
        {"name": "eye-left", "pos": [-0.15, 0.93, 0.34]},
        {"name": "eye-right", "pos": [0.15, 0.93, 0.34]},
        {"name": "nose-tip", "pos": [0.0, 0.78, 0.38]},
        {"name": "muzzle-front", "pos": [0.0, 0.82, 0.34]},
        {"name": "paws-together", "pos": [0.0, 0.32, 0.42]},
        {"name": "tail-nub", "pos": [0.0, 0.32, -0.42]},
        {"name": "boom-cap", "pos": [0.02, 0.78, 0.34]},
        {"name": "cup-front-left", "pos": [-0.50, 0.90, 0.10]},
    ],
}

# ----------------------------------------------------------------------------- preSpecAssessment
anatomy = s["preSpecAssessment"]["anatomy"]
anatomy.update({
    "applies": True,
    "sourceImage": IMG,
    "styleHeads": 1.7,
    "proportions": {"headUnit": 0.72, "torso": 0.62, "legs": 0.55, "shoulderWidth": 0.76, "hipWidth": 0.9},
    "pose": {"type": "sitting-upright-symmetric", "jointAngles": {"hip": 1.1, "knee": 1.8}},
    "faceLandmarks": {"noseBase": 0.62, "mouthLine": 0.7, "earTop": 1.5, "earBottom": 0.85, "cheeks": 0.5},
    "features": [
        {"name": "two-long-rabbit-ears", "kind": "head-top", "note": "EXACTLY TWO long rabbit ears (0.18x0.65) rising vertically from the crown with a V-gap; wide flattened tapered wedge, not antennae; pale-pink inner faces"},
        {"name": "rabbit-muzzle", "kind": "face", "note": "small protruding muzzle toward +Z below the face center; instantly readable rabbit snout"},
        {"name": "dark-charcoal-eyes", "kind": "face", "note": "two SMALL dark charcoal eye dots on the cheeks above the muzzle"},
        {"name": "pale-pink-nose", "kind": "face", "note": "tiny triangular pale-pink nose centered on the muzzle, just above the subtle mouth groove"},
        {"name": "thin-halo-headset", "kind": "accessory", "note": "thin emerald halo band above/behind the head (brow to crown, not a helmet), small earcups ~0.20 at the temples, short boom-mic from the LEFT cup to the muzzle"},
        {"name": "front-paws-together", "kind": "limb", "note": "short front paws angled down-forward to rest together below the chest"},
        {"name": "folded-haunches-and-tail", "kind": "limb", "note": "big rounded rear legs tucked forward on the base + small round tail behind"},
        {"name": "low-poly-facets", "kind": "surface", "note": "clearly faceted flat-shaded triangular surfaces (low tessellation), no smooth skin"},
    ],
})

# ----------------------------------------------------------------------------- quality
q = s["qualityContract"]
q["definitionOfDone"] = [
    (
        "a single squat sitting low-poly rabbit (crown-to-floor ~1.5 units) with faceted flat-shaded "
        "surfaces, EXACTLY TWO LONG RABBIT EARS rising from the crown with a V-gap, a round head with "
        "a small protruding muzzle and two DARK charcoal eye dots, a tiny pale-pink nose, emerald thin "
        "halo headset with small earcups and a short left boom-mic. The silhouette is unmistakably a "
        "RABBIT from the front, three-quarter and side cameras EVEN IF the headset is removed; it must "
        "never read as an insect, bee, fly, bug or alien."
    )
]
s["qualityTargets"]["mustMatch"] = [
    "squat sitting silhouette with clear back curve, front paws together below the chest, haunches and round tail",
    "EXACTLY TWO LONG rabbit ears: wide flattened wedge 0.18x0.65, vertical, V-gap, pale-pink inner faces, rising above the headset",
    "round head with a small protruding muzzle +Z and two small DARK charcoal eyes + tiny pale-pink nose",
    "faceted low-poly geometry (visible triangular variation under light)",
    "thin emerald halo headset above/behind the head (not a helmet), small earcups ~0.20, short left boom-mic to the muzzle",
]
s["qualityTargets"]["niceToHave"] = [
    "slightly satin (not glossy) white body",
    "crisp colour boundaries between white, pale pink, emerald and charcoal",
]

# ----------------------------------------------------------------------------- performance (low-poly tier)
s["performanceBudget"].update({
    "targetTriangles": 4500,
    "maxDrawCalls": 24,
    "textureSize": 64,
    "fpsTarget": 60,
    "optimizationPolicy": "minimal-facets low-poly",
})

s["lookDevTargets"]["qualityPriority"] = "low-poly-faceted-mascot"

# ----------------------------------------------------------------------------- materials
def pick_component(cid):
    for c in s["componentTree"]:
        if c["id"] == cid:
            return c
    raise KeyError(cid)


def first_or_default(seq, default):
    return seq[0] if seq else default


ISO = {
    "rabbit-white": ("#F2F0ED", (242, 240, 237)),
    "pale-pink": ("#EDC9C3", (237, 201, 195)),
    "emerald-headset": ("#157C50", (21, 124, 80)),
    "charcoal-eyes": ("#2E2E33", (46, 46, 51)),
}

MAT_DEFS = {
    "rabbit-white": {
        "name": "Rabbit white body (low-poly)",
        "baseColor": "#F2F0ED",
        "roughness": {"base": 0.82, "variation": 0.06, "localResponse": "slightly rougher in seams"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "shaderNotes": ["MeshStandardMaterial-compatible PBR with flatShading true (faceted low-poly).",
                        "White body slightly satin: roughness medio/alto, metallic 0."],
    },
    "pale-pink": {
        "name": "Very pale pink inner ear / nose",
        "baseColor": "#EDC9C3",
        "roughness": {"base": 0.55, "variation": 0.06, "localResponse": ""},
        "metalness": {"base": 0.0, "variation": 0.0},
        "shaderNotes": ["MeshStandardMaterial-compatible PBR with flatShading true.", "Very pale pink, roughness medium."],
    },
    "emerald-headset": {
        "name": "Emerald headset plastic",
        "baseColor": "#157C50",
        "roughness": {"base": 0.42, "variation": 0.06, "localResponse": ""},
        "metalness": {"base": 0.12, "variation": 0.0},
        "shaderNotes": ["MeshStandardMaterial-compatible PBR with flatShading true.", "Emerald, roughness medium, metal slightly low."],
    },
    "charcoal-eyes": {
        "name": "Dark charcoal eyes / mic capsule",
        "baseColor": "#2E2E33",
        "roughness": {"base": 0.5, "variation": 0.06, "localResponse": ""},
        "metalness": {"base": 0.0, "variation": 0.0},
        "shaderNotes": ["MeshStandardMaterial-compatible PBR with flatShading true.", "Dark charcoal, matte."],
    },
}

MATERIAL = {
    "rabbit-white": ("plastic", "rgba(242, 240, 237, 1)", "rgba(214, 212, 209, 1)"),
    "pale-pink": ("plastic", "rgba(237, 201, 195, 1)", "rgba(214, 212, 209, 1)"),
    "emerald-headset": ("plastic", "rgba(21, 124, 80, 1)", "rgba(12, 46, 29, 1)"),
    "charcoal-eyes": ("plastic", "rgba(46, 46, 51, 1)", "rgba(20, 20, 24, 1)"),
}
GRADIENT_TYPE = {
    "rabbit-white": "linear", "pale-pink": "radial",
    "emerald-headset": "linear", "charcoal-eyes": "radial",
}

TEXTURELESS_EVIDENCE = [
    "conejo.png flat-colour low-poly mascot design brief: faceted flat-shaded surfaces, no grain/print/pores",
    "intake records palette-only albedo (white body, pale pink inner ears/nose, emerald headset, charcoal eyes); identity is silhouette/proportion/colour boundaries + low-poly facets",
    "styleHeads 1.7 stylized low-poly figurine route  —  flat-shaded faces, no texel-bearing surface expected",
]
TEXTURE_AUTHORING_FIELDS = (
    "normal", "bump", "displacement", "surfaceFrequencyBands",
    "textureProjection", "textureResolution", "referencePbr",
)

LOCAL_OVERRIDES = {
    "rabbit-white": [
        {"id": "chest-soft-ao", "description": "Soft contact shading under the ear anchors and around the head seat",
         "type": "multiply", "weights": {"head": 0.12, "torso": 0.10},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.4, "grazing": 0.2}},
        {"id": "paw-contact-ao", "description": "Contact shading where the front paws rest together on the chest",
         "type": "multiply", "weights": {"arm-left": 0.14, "arm-right": 0.14},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.45, "grazing": 0.1}},
    ],
    "pale-pink": [
        {"id": "inner-ear-gather", "description": "Converging gather shading inside the ear void and around the nose",
         "type": "multiply", "weights": {"inner-ear-left": 0.18, "inner-ear-right": 0.18, "nose": 0.12},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.1}},
    ],
    "emerald-headset": [
        {"id": "halo-under-shadow", "description": "Sweep shadow under the thin halo band where it leans over the crown behind the ears",
         "type": "multiply", "weights": {"headband": 0.2},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.4, "grazing": 0.2}},
        {"id": "cup-inner-shadow", "description": "Radial falloff inside each cup opening toward the ear seat",
         "type": "multiply", "weights": {"cup-left": 0.3, "cup-right": 0.3},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.1}},
        {"id": "cup-detail-shadow", "description": "Cavity ring around the central geometric accent on each cup",
         "type": "multiply", "weights": {"cup-cap-left": 0.25, "cup-cap-right": 0.25},
         "outputMasks": ["ambient-occlusion"], "visibility": {"shadow": 0.5, "grazing": 0.0}},
    ],
    "charcoal-eyes": [],
}

new_materials = []
for mid in ("rabbit-white", "pale-pink", "emerald-headset", "charcoal-eyes"):
    d = MAT_DEFS[mid]
    mat = {
        "id": mid,
        "name": d["name"],
        "type": "standard",
        "shaderModel": "MeshStandardMaterial / PBR approximation",
        "baseColor": d["baseColor"],
        "color": d["baseColor"],
        "albedo": {
            "dominant": d["baseColor"],
            "secondary": [d["baseColor"]],
            "samplingNotes": f"design-brief palette for {mid}; conejo.png deterministic low-pass isolator",
        },
        "colorVariation": {"palette": [d["baseColor"], "#FFFFFF"], "pattern": "flat", "amplitude": 0.02, "heightCorrelation": 0.0},
        "roughness": d["roughness"],
        "metalness": d["metalness"],
        "ambientOcclusion": {"cavityStrength": 0.3, "scale": 1.0, "occlusionBalance": 0.5},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"},
        "localOverrides": LOCAL_OVERRIDES[mid],
        "shaderNotes": d["shaderNotes"],
        "notes": f"{d['name']}; flatShading true for low-poly faceted look.",
        "textureless": {"declared": True, "evidence": list(TEXTURELESS_EVIDENCE)},
        "flatShading": True,
    }
    new_materials.append(mat)
s["materials"] = new_materials

# ----------------------------------------------------------------------------- drop the operator's eye components, then re-create our OWN small dark charcoal eyes below
s["componentTree"] = [c for c in s["componentTree"] if c["id"] not in ("eye-left", "eye-right")]

# ----------------------------------------------------------------------------- component helpers
def set_comp(cid, patch):
    c = pick_component(cid)
    c.update(patch)
    return c


def new_component(cid, name, role, importance, primitive, topology, rationale, dims,
                  transform, material, parent, attachment):
    return {
        "id": cid,
        "name": name,
        "level": "micro" if importance < 0.6 else ("meso" if importance < 0.9 else "macro"),
        "role": role,
        "importance": importance,
        "confidence": 0.7,
        "primitive": primitive,
        "topologyClass": topology,
        "topologyRationale": rationale,
        "geometryDescriptor": {
            "topologyIntent": f"stylized low-poly conejo part, {primitive}",
            "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2},
            "deformationStack": [],
            "uvStrategy": "generated procedural coordinates",
            "normalStrategy": "face normals, flat shading (faceted)",
        },
        "parent": parent,
        "attachment": attachment,
        "dimensions": {"width": dims[0], "height": dims[1], "depth": dims[2],
                       "units": "relative", "confidence": 0.7},
        "transform": {"position": list(transform[0]), "rotation": list(transform[1]),
                      "scale": [1, 1, 1]},
        "actionProfile": {
            "animationRole": "static",
            "collider": {"isTrigger": False, "notes": name,
                         "offset": [0, 0, 0], "scale": [dims[0], dims[1], dims[2]],
                         "type": "box"},
            "constraints": [],
            "destruction": {"breakImpulse": 0.0, "breakable": False,
                            "debrisMaterial": material, "detachableFragments": [],
                            "fractureGroup": cid, "seamRefs": []},
            "pivot": {"axis": [0, 1, 0], "confidence": 0.6, "localPosition": [0, 0, 0],
                      "mode": "center"},
            "sockets": [],
            "transformChannels": {"bend": False, "detach": False, "materialState": True,
                                  "rotate": True, "scale": True, "translate": True,
                                  "twist": False, "visibility": True},
        },
        "material": material,
        "materialLayers": [material],
        "deformations": [],
        "joints": [],
        "seams": [],
        "localFeatures": [],
        "surfaceDetail": {"bumpAmplitude": 0.0, "displacementPattern": "",
                          "edgeWearPattern": "none", "macroRoughness": 0.0,
                          "microRoughness": 0.0, "normalPattern": "",
                          "notes": ""},
        "evidenceRefs": list(FEATURE_EVIDENCE),
        "details": [],
        "fidelityTier": "low",
        "colorMaterialRecipe": None,
    }


def rebuild_sockets(cid, sockets):
    c = pick_component(cid)
    ap = c.setdefault("actionProfile", {})
    ap["sockets"] = sockets


def rebuild_attachment(cid, attachment):
    c = pick_component(cid)
    c["attachment"] = attachment


def set_local_features(cid, feats):
    c = pick_component(cid)
    c["localFeatures"] = feats


def comp_base(cid, name, role, importance, primitive, topology, rationale,
              dims, transform, material, parent, attachment):
    try:
        c = pick_component(cid)
        c.update({
            "name": name,
            "role": role,
            "importance": importance,
            "confidence": 0.7,
            "primitive": primitive,
            "topologyClass": topology,
            "topologyRationale": rationale,
            "dimensions": {"width": dims[0], "height": dims[1], "depth": dims[2], "units": "relative", "confidence": 0.7},
            "transform": {"position": list(transform[0]), "rotation": list(transform[1]), "scale": [1, 1, 1]},
            "material": material,
            "materialLayers": [material],
            "parent": parent,
            "attachment": attachment,
            "geometryDescriptor": {
                "topologyIntent": f"stylized low-poly conejo part, {primitive}",
                "edgeTreatment": {"type": "bevel", "bevelRadius": 0.015, "segments": 2},
                "deformationStack": [],
                "uvStrategy": "generated procedural coordinates",
                "normalStrategy": "face normals, flat shading (faceted)",
            },
        })
        c.pop("colorMaterialRecipe", None)
        c.pop("localFeatures", None)
        c.pop("surfaceDetail", None)
        return c
    except KeyError:
        created = new_component(cid, name, role, importance, primitive, topology,
                                rationale, dims, transform, material, parent, attachment)
        s["componentTree"].append(created)
        return created


def attach(psocket, start, end, depth=0.05, contact="embed", base=None, endr=None):
    a = {"parentSocket": psocket, "localStart": list(start), "localEnd": list(end),
         "contactType": contact, "embedDepth": depth if contact == "embed" else 0.02,
         "gapTolerance": 0.01}
    if base is not None:
        a["baseRadius"] = base
    if endr is not None:
        a["endRadius"] = endr
    return a


# ---- root
comp_base("root", "Conejo low-poly (fullbody sitting)", "assembly", 1.0, "box",
          "assembled-solid", "Whole sitting mascot lockup proxy; roots the layout and whole-object motion.",
          (1.18, 1.5, 1.05), ([0, 0.6, 0], [0, 0, 0]), "matte-white-resin", None,
          {"parentSocket": None, "localStart": [0, 0, 0], "localEnd": [0, 0, 0],
           "contactType": "none", "embedDepth": 0, "gapTolerance": 0.01})
rebuild_sockets("root", [
    {"id": "socket-body", "localPosition": [0, 0.6, 0]},
])

# ---- torso (sitting, compact, rounded pear)
comp_base("torso", "Squat rounded sitting torso", "body", 0.95, "sphere",
          "continuous-sculpt",
          "Squat sitting torso, round and compact, widest at its base; the upper back rounds into the side-view curve. SPEC V3: 0.76 x 0.62 x 0.66.",
          (0.76, 0.62, 0.66), ([0, 0.42, 0], [0.08, 0, 0]), "rabbit-white", "root",
          attach("socket-body", [0, 0.42, 0], [0, 0.42, 0]))
rebuild_sockets("torso", [
    {"id": "socket-head-seat", "localPosition": [0, 0.34, -0.02]},
    {"id": "socket-arm-left", "localPosition": [-0.32, 0.28, 0.10]},
    {"id": "socket-arm-right", "localPosition": [0.32, 0.28, 0.10]},
    {"id": "socket-leg-left", "localPosition": [-0.30, -0.28, 0.16]},
    {"id": "socket-leg-right", "localPosition": [0.30, -0.28, 0.16]},
    {"id": "socket-tail", "localPosition": [0, -0.28, -0.34]},
])
set_local_features("torso", [
    {"id": "back-curve", "name": "Curved back line of the sitting torso in side view", "type": "groove", "evidenceRefs": FEATURE_EVIDENCE},
    {"id": "neck-collar", "name": "Collared neck transition where the head seats onto the torso", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE},
    {"id": "paw-rest", "name": "Contact seam where the front paws rest together on the belly", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE},
])

# ---- head (round, SPEC V3: 0.76 x 0.62 x 0.65, with small protruding muzzle +Z)
comp_base("head", "Round faceted rabbit head (cute face)", "body", 1.0, "sphere",
          "continuous-sculpt",
          "Round low-poly rabbit head (0.76x0.62) with cheeks and a small protruding muzzle toward +Z; "
          "two small DARK charcoal eyes and a tiny pale-pink nose on the face; never insect-like.",
          (0.76, 0.62, 0.65), ([0, 0.88, 0], [0, 0, 0]), "rabbit-white", "torso",
          attach("socket-head-seat", [0, 0.34, -0.02], [0, 0.34, -0.02]))
rebuild_sockets("head", [
    {"id": "socket-ear-left", "localPosition": [-0.24, 0.34, -0.06]},
    {"id": "socket-ear-right", "localPosition": [0.24, 0.34, -0.06]},
    {"id": "socket-headband", "localPosition": [0, 0.16, -0.04]},
    {"id": "socket-cup-left", "localPosition": [-0.50, 0.02, 0.08]},
    {"id": "socket-cup-right", "localPosition": [0.50, 0.02, 0.08]},
    {"id": "socket-muzzle", "localPosition": [0, -0.06, 0.26]},
    {"id": "socket-nose", "localPosition": [0, -0.09, 0.41]},
    {"id": "socket-eye-left", "localPosition": [-0.15, 0.06, 0.36]},
    {"id": "socket-eye-right", "localPosition": [0.15, 0.06, 0.36]},
    {"id": "socket-mic-root", "localPosition": [-0.50, -0.06, 0.10]},
])
set_local_features("head", [
    {"id": "ear-anchor-left", "name": "Clean junction where the left ear meets the crown", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE},
    {"id": "ear-anchor-right", "name": "Clean junction where the right ear meets the crown", "type": "seam", "evidenceRefs": FEATURE_EVIDENCE},
    {"id": "muzzle-seat", "name": "Small protruding rabbit muzzle toward +Z below the face center", "type": "patch", "evidenceRefs": FEATURE_EVIDENCE},
    {"id": "mouth-groove", "name": "Subtle mouth groove below the nose", "type": "groove", "evidenceRefs": FEATURE_EVIDENCE},
])

# ---- muzzle (NEW: small protruding rabbit snout toward +Z)
comp_base("muzzle", "Protruding rabbit muzzle (snout)", "detail", 0.72, "ellipsoid",
          "assembled-solid",
          "Small rounded rabbit muzzle protruding toward +Z at the front of the face; the pale-pink nose sits on its tip and the eyes sit above.",
          (0.30, 0.22, 0.18), ([0, -0.06, 0.26], [0.12, 0, 0]), "rabbit-white", "head",
          attach("socket-muzzle", [0, -0.06, 0.26], [0, -0.06, 0.26], depth=0.05))
rebuild_sockets("muzzle", [])

# ---- ears (EXACTLY TWO LONG RABBIT EARS, 0.18 x 0.65, flattened wide wedge, vertical at the crown)
comp_base("ear-left", "Long rabbit ear L (0.18x0.65, tapered wedge)", "appendage", 0.94, "cone",
          "assembled-solid",
          "Long RABBIT ear: wide flattened base (0.18x0.10) tapering to a rounded point, rising from the crown with a clear V-gap; wide wedge, NOT an antenna.",
          (0.18, 0.65, 0.10), ([-0.24, 0.34, -0.06], [-0.12, -0.10, 0]), "rabbit-white", "head",
          attach("socket-ear-left", [-0.24, 0.34, -0.06], [-0.33, 1.50, -0.18], depth=0.08))
rebuild_sockets("ear-left", [])
comp_base("ear-right", "Long rabbit ear R (0.18x0.65, tapered wedge)", "appendage", 0.94, "cone",
          "assembled-solid",
          "Long RABBIT ear: wide flattened base (0.18x0.10) tapering to a rounded point, rising from the crown with a clear V-gap; wide wedge, NOT an antenna.",
          (0.18, 0.65, 0.10), ([0.24, 0.34, -0.06], [-0.12, 0.10, 0]), "rabbit-white", "head",
          attach("socket-ear-right", [0.24, 0.34, -0.06], [0.34, 1.53, -0.18], depth=0.08))
rebuild_sockets("ear-right", [])

# ---- inner ears (very pale pink cushions on the inner faces)
comp_base("inner-ear-left", "Left inner ear (very pale pink)", "detail", 0.6, "ellipsoid",
          "surface-relief",
          "Very pale-pink cushion rising along the inner-front face of the left ear, peeking clearly above the crown from the front.",
          (0.09, 0.34, 0.04), ([0.03, 0.09, 0.045], [0, 0, 0]), "pale-pink", "ear-left",
          attach("socket-ear-left", [-0.24, 0.34, -0.06], [-0.24, 0.34, -0.06], depth=0.0))
rebuild_sockets("inner-ear-left", [])
set_local_features("inner-ear-left", [{"id": "pink-gather-l", "name": "Pale pink inner ear cushion on the left ear", "type": "patch", "evidenceRefs": FEATURE_EVIDENCE}])
comp_base("inner-ear-right", "Right inner ear (very pale pink)", "detail", 0.6, "ellipsoid",
          "surface-relief",
          "Very pale-pink cushion rising along the inner-front face of the right ear, peeking clearly above the crown from the front.",
          (0.09, 0.34, 0.04), ([-0.03, 0.09, 0.045], [0, 0, 0]), "pale-pink", "ear-right",
          attach("socket-ear-right", [0.24, 0.34, -0.06], [0.24, 0.34, -0.06], depth=0.0))
rebuild_sockets("inner-ear-right", [])
set_local_features("inner-ear-right", [{"id": "pink-gather-r", "name": "Pale pink inner ear cushion on the right ear", "type": "patch", "evidenceRefs": FEATURE_EVIDENCE}])

# ---- headset band (thin emerald halo over the crown, behind the ears: brow to crown, NOT a helmet)
comp_base("headband", "Emerald halo band (brow to crown, behind ears)", "ring", 0.8, "torus",
          "assembled-solid",
          "Thin emerald halo tilted over the head: crosses the brow in front and sweeps over the crown behind the ears; ears rise clearly above it. Not a helmet.",
          (0.86, 0.56, 0.10), ([0, 0.16, -0.04], [1.25, 0, 0]), "emerald-headset", "head",
          attach("socket-headband", [0, 0.16, -0.04], [0, 0.16, -0.04], depth=0.02))
comp = pick_component("headband")
comp["geometryDescriptor"]["torusTubeRatio"] = 0.12
rebuild_sockets("headband", [])
set_local_features("headband", [{"id": "band-halo", "name": "Thin halo band over the crown behind the ears", "type": "bevel", "evidenceRefs": FEATURE_EVIDENCE}])

# ---- cups (small emerald earcups ~0.18-0.22, at the temples, much smaller than the head)
comp_base("cup-left", "Emerald earcup L (small, left boom mount)", "detail", 0.72, "sphere",
          "assembled-solid",
          "Small emerald earcup (~0.20) hugging the left temple, clearly smaller than the rabbit head; the short boom-mic arm emerges from its lower front edge.",
          (0.20, 0.16, 0.18), ([-0.50, 0.02, 0.08], [0, 0, 0]), "emerald-headset", "head",
          attach("socket-cup-left", [-0.50, 0.02, 0.08], [-0.50, 0.02, 0.08], depth=0.05))
rebuild_sockets("cup-left", [{"id": "socket-cap", "localPosition": [0, 0, 0.12]}])
set_local_features("cup-left", [
    {"id": "mic-mount", "name": "Boom mic mount on the left cup", "type": "mount", "evidenceRefs": FEATURE_EVIDENCE},
    {"id": "pad-rim", "name": "Pad rim opening to the temple", "type": "ridge", "evidenceRefs": FEATURE_EVIDENCE},
])
comp_base("cup-right", "Emerald earcup R (small)", "detail", 0.72, "sphere",
          "assembled-solid",
          "Small emerald earcup (~0.20) hugging the right temple, clearly smaller than the rabbit head.",
          (0.20, 0.16, 0.18), ([0.50, 0.02, 0.08], [0, 0, 0]), "emerald-headset", "head",
          attach("socket-cup-right", [0.50, 0.02, 0.08], [0.50, 0.02, 0.08], depth=0.05))
rebuild_sockets("cup-right", [{"id": "socket-cap", "localPosition": [0, 0, 0.12]}])
set_local_features("cup-right", [{"id": "pad-rim", "name": "Pad rim opening to the temple", "type": "ridge", "evidenceRefs": FEATURE_EVIDENCE}])

# ---- cup central accents
comp_base("cup-cap-left", "Left cup central geometric accent", "detail", 0.5, "cylinder",
          "assembled-solid",
          "Thin polygonal disc accent at the center of the left earcup face.",
          (0.07, 0.04, 0.03), ([-0.50, 0.02, 0.13], [1.5708, 0, 0]), "emerald-headset", "head",
          attach("socket-cup-left", [-0.50, 0.02, 0.08], [-0.50, 0.02, 0.08], depth=0.02))
rebuild_sockets("cup-cap-left", [])
comp_base("cup-cap-right", "Right cup central geometric accent", "detail", 0.5, "cylinder",
          "assembled-solid",
          "Thin polygonal disc accent at the center of the right earcup face.",
          (0.07, 0.04, 0.03), ([0.50, 0.02, 0.13], [1.5708, 0, 0]), "emerald-headset", "head",
          attach("socket-cup-right", [0.50, 0.02, 0.08], [0.50, 0.02, 0.08], depth=0.02))
rebuild_sockets("cup-cap-right", [])

# ---- nose (small triangular pale-pink, seated proud on the muzzle)
comp_base("nose", "Tiny pale-pink rabbit nose", "detail", 0.55, "ellipsoid",
          "assembled-solid",
          "Small triangular pale-pink nose centered on the muzzle tip, seated clearly proud of the surface, just above the subtle mouth groove.",
          (0.09, 0.07, 0.05), ([0, -0.09, 0.41], [0, 0, 0]), "pale-pink", "head",
          attach("socket-nose", [0, -0.09, 0.41], [0, -0.09, 0.41], depth=0.03))
rebuild_sockets("nose", [])
set_local_features("nose", [{"id": "pale-pink-triangle", "name": "Tiny triangular pale-pink rabbit nose", "type": "patch", "evidenceRefs": FEATURE_EVIDENCE}])

# ---- DARK charcoal eye dots (NEW, small, on the cheeks above the muzzle)
comp_base("eye-left", "Dark charcoal eye dot (left)", "detail", 0.5, "ellipsoid",
          "assembled-solid",
          "Small DARK charcoal rabbit eye dot placed symmetrically on the left cheek above the muzzle.",
          (0.045, 0.03, 0.015), ([-0.15, 0.06, 0.36], [0, 0, 0]), "charcoal-eyes", "head",
          attach("socket-eye-left", [-0.15, 0.06, 0.36], [-0.15, 0.06, 0.36], depth=0.015))
rebuild_sockets("eye-left", [])
set_local_features("eye-left", [{"id": "dark-eye-dot-l", "name": "Dark charcoal eye dot on the left", "type": "patch", "evidenceRefs": FEATURE_EVIDENCE}])
comp_base("eye-right", "Dark charcoal eye dot (right)", "detail", 0.5, "ellipsoid",
          "assembled-solid",
          "Small DARK charcoal rabbit eye dot placed symmetrically on the right cheek above the muzzle.",
          (0.045, 0.03, 0.015), ([0.15, 0.06, 0.36], [0, 0, 0]), "charcoal-eyes", "head",
          attach("socket-eye-right", [0.15, 0.06, 0.36], [0.15, 0.06, 0.36], depth=0.015))
rebuild_sockets("eye-right", [])
set_local_features("eye-right", [{"id": "dark-eye-dot-r", "name": "Dark charcoal eye dot on the right", "type": "patch", "evidenceRefs": FEATURE_EVIDENCE}])

# ---- boom-mic (SHORT, LEFT cup -> muzzle)
comp_base("boom-mic", "Short emerald boom-mic arm (left)", "tube", 0.75, "curve-sweep",
          "assembled-solid",
          "SHORT thin emerald arm from the left earcup to just beside the muzzle, ending in the small dark mic capsule.",
          (0.035, 0.16, 0.035), ([-0.50, -0.06, 0.10], [0, 0, 0]), "emerald-headset", "head",
          attach("socket-mic-root", [-0.50, -0.06, 0.10], [0.02, -0.10, 0.34], contact="socket-joint",
                 base=0.018, endr=0.012))
rebuild_sockets("boom-mic", [{"id": "socket-mic-cap", "localPosition": [0.02, -0.10, 0.34]}])
set_local_features("boom-mic", [{"id": "mic-arm-curve", "name": "Short forward sweep of the boom arm toward the muzzle", "type": "ridge", "evidenceRefs": FEATURE_EVIDENCE}])

comp_base("mic-cap", "Dark charcoal mic capsule", "detail", 0.5, "sphere",
          "assembled-solid",
          "Small dark rounded mic capsule near the muzzle at the end of the short left boom arm.",
          (0.045, 0.035, 0.045), ([0.02, -0.105, 0.345], [0, 0, 0]), "charcoal-eyes", "boom-mic",
          attach("socket-mic-cap", [0.02, -0.10, 0.34], [0.02, -0.10, 0.34], depth=0.03))
rebuild_sockets("mic-cap", [])

# ---- front paws (SHORT, close together below the chest)
comp_base("arm-left", "Short front paw L (close together below chest)", "arm", 0.72, "capsule",
          "assembled-solid",
          "Short front paw angled down-forward, resting together with the right paw below the chest.",
          (0.13, 0.34, 0.12), ([-0.24, 0.50, 0.28], [1.0, -0.5, 0.1]), "rabbit-white", "torso",
          attach("socket-arm-left", [-0.32, 0.28, 0.10], [-0.12, -0.14, 0.30], depth=0.05))
rebuild_sockets("arm-left", [])
comp_base("arm-right", "Short front paw R (close together below chest)", "arm", 0.72, "capsule",
          "assembled-solid",
          "Short front paw angled down-forward, resting together with the left paw below the chest.",
          (0.13, 0.34, 0.12), ([0.24, 0.50, 0.28], [1.0, 0.5, -0.1]), "rabbit-white", "torso",
          attach("socket-arm-right", [0.32, 0.28, 0.10], [0.12, -0.14, 0.30], depth=0.05))
rebuild_sockets("arm-right", [])

# ---- haunches (large folded hind legs, tucked forward) + tail
comp_base("leg-left", "Left haunch (large, folded)", "leg", 0.8, "ellipsoid",
          "continuous-sculpt",
          "Large rounded rear leg folded forward under the sitting hip, clearly visible from the front.",
          (0.44, 0.36, 0.52), ([-0.30, 0.26, 0.18], [-0.12, 0, 0.15]), "rabbit-white", "torso",
          attach("socket-leg-left", [-0.30, -0.28, 0.16], [-0.30, -0.28, 0.16], depth=0.06))
rebuild_sockets("leg-left", [])
set_local_features("leg-left", [{"id": "haunch-fold-l", "name": "Fold crease on the tucked left haunch", "type": "groove", "evidenceRefs": FEATURE_EVIDENCE}])
comp_base("leg-right", "Right haunch (large, folded)", "leg", 0.8, "ellipsoid",
          "continuous-sculpt",
          "Large rounded rear leg folded forward under the sitting hip, clearly visible from the front.",
          (0.44, 0.36, 0.52), ([0.30, 0.26, 0.18], [0.12, 0, -0.15]), "rabbit-white", "torso",
          attach("socket-leg-right", [0.30, -0.28, 0.16], [0.30, -0.28, 0.16], depth=0.06))
rebuild_sockets("leg-right", [])
set_local_features("leg-right", [{"id": "haunch-fold-r", "name": "Fold crease on the tucked right haunch", "type": "groove", "evidenceRefs": FEATURE_EVIDENCE}])
comp_base("tail", "Small round rabbit tail", "detail", 0.55, "sphere",
          "assembled-solid",
          "Small round white tail at the rear of the sitting body.",
          (0.17, 0.15, 0.15), ([0, 0.32, -0.42], [0, 0, 0]), "rabbit-white", "torso",
          attach("socket-tail", [0, -0.28, -0.34], [0, -0.28, -0.34], depth=0.05))
rebuild_sockets("tail", [])

# ----------------------------------------------------------------------------- color recipes
MATERIAL_LOCK = {
    "root": "rabbit-white", "torso": "rabbit-white", "head": "rabbit-white", "muzzle": "rabbit-white",
    "ear-left": "rabbit-white", "ear-right": "rabbit-white",
    "inner-ear-left": "pale-pink", "inner-ear-right": "pale-pink",
    "nose": "pale-pink",
    "eye-left": "charcoal-eyes", "eye-right": "charcoal-eyes",
    "headband": "emerald-headset", "cup-left": "emerald-headset", "cup-right": "emerald-headset",
    "cup-cap-left": "emerald-headset", "cup-cap-right": "emerald-headset",
    "boom-mic": "emerald-headset", "mic-cap": "charcoal-eyes",
    "arm-left": "rabbit-white", "arm-right": "rabbit-white",
    "leg-left": "rabbit-white", "leg-right": "rabbit-white",
    "tail": "rabbit-white",
}
GRADIENT_FOR = {
    "root": "linear", "torso": "linear", "head": "linear", "muzzle": "linear",
    "ear-left": "linear", "ear-right": "linear",
    "inner-ear-left": "radial", "inner-ear-right": "radial", "nose": "radial",
    "eye-left": "radial", "eye-right": "radial",
    "headband": "linear", "cup-left": "linear", "cup-right": "linear",
    "cup-cap-left": "linear", "cup-cap-right": "linear",
    "boom-mic": "linear", "mic-cap": "radial",
    "arm-left": "linear", "arm-right": "linear",
    "leg-left": "linear", "leg-right": "linear", "tail": "radial",
}
for cid in MATERIAL_LOCK:
    comp = pick_component(cid)
    mid = MATERIAL_LOCK[cid]
    cls, dom, sec = MATERIAL[mid]
    grad_type = GRADIENT_FOR[cid]
    conf = 0.9 if mid in ("emerald-headset", "charcoal-eyes") or cid in ("torso", "head") else 0.55
    comp["colorMaterialRecipe"] = {
        "dominantAlbedo": dom,
        "secondaryAlbedo": sec,
        "materialClass": cls,
        "materialClassConfidence": conf,
        "colorGradient": {"type": grad_type, "stops": [{"color": dom, "position": 0}, {"color": sec, "position": 1}]},
    }
    comp["material"] = mid
    comp["materialLayers"] = [mid]

# ----------------------------------------------------------------------------- detail inventory
assessment = s["preSpecAssessment"]
assessment["detailInventory"] = {
    "targetMinDetails": 6,
    "details": [
        {"id": "two-ear-vgap-silhouette", "kind": "contour", "note": "EXACTLY TWO long rabbit ears with a V-gap above the crown",
         "mapsTo": {"type": "component.localFeatures", "ref": "head/ear-anchor-left"}},
        {"id": "rabbit-muzzle-bump", "kind": "ridge", "note": "small protruding muzzle toward +Z below the face",
         "mapsTo": {"type": "component.localFeatures", "ref": "head/muzzle-seat"}},
        {"id": "dark-charcoal-eyes", "kind": "bevel", "note": "two small DARK charcoal eye dots on the cheeks above the muzzle",
         "mapsTo": {"type": "component.localFeatures", "ref": "eye-left/dark-eye-dot-l"}},
        {"id": "pale-pink-nose", "kind": "bevel", "note": "tiny pale-pink triangular nose on the muzzle",
         "mapsTo": {"type": "component.localFeatures", "ref": "nose/pale-pink-triangle"}},
        {"id": "mouth-groove-subtle", "kind": "linework", "note": "subtle mouth groove below the nose",
         "mapsTo": {"type": "component.localFeatures", "ref": "head/mouth-groove"}},
        {"id": "thin-halo-band", "kind": "bevel", "note": "thin emerald halo band over the crown behind the ears",
         "mapsTo": {"type": "component.localFeatures", "ref": "headband/band-halo"}},
        {"id": "mic-mount-left-cup", "kind": "ridge", "note": "short left boom-mic mounted on the left cup toward the muzzle",
         "mapsTo": {"type": "component.localFeatures", "ref": "cup-left/mic-mount"}},
        {"id": "paw-contact-ao", "kind": "stain", "note": "contact shading where the front paws rest together",
         "mapsTo": {"type": "material.localOverrides", "ref": "rabbit-white/paw-contact-ao"}},
    ],
    "note": "Identity-defining details enumerated from the SPEC V3 rabbitia brief before code generation.",
}

# ----------------------------------------------------------------------------- build passes / pipeline
BUILD_PASSES = [
    "blockout", "structural-pass", "proportion-lock", "feature-placement", "form-refinement",
    "material-pass", "surface-pass", "lighting-pass", "interaction-pass", "optimization-pass",
]
GOALS = {
    "blockout": "Match the squat sitting rabbit silhouette: compact round head, EXACTLY TWO long ears with a V-gap, protruding muzzle, haunches, tail, front paws together",
    "structural-pass": "Resolve component hierarchy, attachment sockets and topology classes",
    "proportion-lock": "Lock sitting proportions (SPEC V3, headUnit 0.76; total 1.18x1.5x1.05) into the rig",
    "feature-placement": "Place ear anchors, thin halo band over the crown, small temple cups, short left boom mic to the muzzle, nose and dark charcoal eye dots",
    "form-refinement": "Refine ear taper/V-gap, halo clearance, cup accents, muzzle and paw/haunch forms",
    "material-pass": "Apply the 4-material flat-shaded palette with colour boundaries and AO masks",
    "surface-pass": "Confirm low-poly flat-shaded faces read correctly with the lighting rig",
    "lighting-pass": "Soft white studio: key/fill/rim with soft contact-shaded ground shadow",
    "interaction-pass": "Idle wobble and adjust-mic animation reliability",
    "optimization-pass": "Keep the faceted low-poly budget (<=4500 triangles)",
}
component_ids = [c["id"] for c in s["componentTree"]]
s["buildPasses"] = []
for bpid in BUILD_PASSES:
    refs = {
        "blockout": component_ids,
        "structural-pass": component_ids,
        "material-pass": ["torso", "head", "ear-left", "ear-right", "nose", "eye-left", "eye-right", "headband", "cup-left", "cup-right", "boom-mic"],
    }.get(bpid, component_ids)
    s["buildPasses"].append({
        "id": bpid,
        "goal": GOALS[bpid],
        "componentRefs": refs,
        "acceptance": [],
    })

pipeline = s["sculptPipeline"]
pipeline["passGateMode"] = "locked-sequential"
pipeline["passOrder"] = BUILD_PASSES
pipeline["currentPass"] = "blockout"
pipeline["completedPasses"] = []
pipeline["lastCompletedPass"] = ""
pipeline["blockedReason"] = ""
pipeline["nextRequiredEvidence"] = []

# ----------------------------------------------------------------------------- rig (bones in root-local frame)
bones = {b["id"]: b for b in s["rig"]["bones"]}
head_bone = bones["head"]
head_bone.update({"jointPos": [0.0, 0.88, 0.0], "tipPos": [0.0, 1.04, 0.0]})
bones["ear-left"].update({
    "jointPos": [-0.24, 1.20, -0.06], "tipPos": [-0.33, 1.51, -0.18],
})
bones["ear-right"].update({
    "jointPos": [0.24, 1.20, -0.06], "tipPos": [0.34, 1.53, -0.18],
})
bones["boom-mic"].update({
    "jointPos": [-0.26, 0.88, 0.10], "tipPos": [0.02, 0.80, 0.34],
})
s["rig"]["bindPose"] = "sitting-upright-symmetric"
s["rig"]["bones"] = list(bones.values())

s["animationAnchors"] = [
    {"id": "idle-wobble", "bones": ["head", "ear-left", "ear-right", "boom-mic", "chest"]},
    {"id": "adjust-mic", "bones": ["boom-mic", "head", "upper-arm-right"]},
]
s["actionReadiness"]["rootMotionNode"] = "root"

# ----------------------------------------------------------------------------- studio white lighting
s["lightingFromPhoto"] = [
    {"role": "key light", "kind": "directional", "direction": "large front/superior, slightly ramped",
     "color": "neutral daylight ~6000K", "intensity": "dominant but soft",
     "notes": "Soft large key light from the front-top, producing gentle facet variation on the low-poly surfaces."},
    {"role": "fill light", "kind": "hemisphere/environment", "color": "cool white ~6500K",
     "intensity": "soft ~0.35 key", "notes": "White studio fill, no shadows hardening."},
    {"role": "rim or environment light", "kind": "back rim", "direction": "low back-right",
     "color": "subtle warm 4200K", "intensity": "narrow rim",
     "notes": "Separates ears, tail and haunch from the white background."},
    {"role": "exposure and tone mapping", "intent": "white background and floor; ACES tone mapping; soft exposure",
     "notes": "Clean premium tech-mascot studio look, no dark ambient."},
    {"role": "contact shadow / ground shadow", "behavior": "soft contact shadow under the haunches and tail on the white floor",
     "notes": "Orients the sitting conejo on the white studio floor."},
]
s["suitability"] = "conditional"

# ----------------------------------------------------------------------------- misc narrative fields
s["terminologyProfile"]["domain"] = "character"
s["featureReviewTargets"] = [
    {"id": "anatomy-proportion", "name": "Head-unit proportions and sitting pose", "tier": "critical",
     "passIds": ["blockout", "proportion-lock"], "minimumScore": 0.78, "mustPass": True,
     "componentRefs": ["root", "head", "torso"]},
    {"id": "two-long-rabbit-ears", "name": "EXACTLY TWO long rabbit ears from the crown with a V-gap, no insect antenna", "tier": "critical",
     "passIds": ["feature-placement", "form-refinement"], "minimumScore": 0.78, "mustPass": True,
     "componentRefs": ["ear-left", "ear-right", "inner-ear-left", "inner-ear-right"]},
    {"id": "rabbit-face", "name": "Rabbit face: small dark charcoal eyes, tiny pale-pink nose, protruding muzzle, subtle mouth groove", "tier": "critical",
     "passIds": ["feature-placement"], "minimumScore": 0.75, "mustPass": True,
     "componentRefs": ["head", "muzzle", "nose", "eye-left", "eye-right"]},
    {"id": "pose-silhouette", "name": "Sitting silhouette: front paws together below the chest, haunches, tail, back curve (no wasp waist)", "tier": "critical",
     "passIds": ["blockout", "proportion-lock", "form-refinement"],
     "minimumScore": 0.78, "mustPass": True, "componentRefs": ["root", "torso", "arm-left", "arm-right", "leg-left", "leg-right", "tail"]},
    {"id": "headset-and-palette", "name": "Thin emerald halo band over the crown with small temple cups and short left boom mic, 4-colour palette",
     "tier": "critical", "passIds": ["material-pass", "surface-pass"], "minimumScore": 0.75,
     "mustPass": True, "componentRefs": ["headband", "cup-left", "cup-right", "boom-mic", "mic-cap", "ear-left", "ear-right"]},
    {"id": "low-poly-facets", "name": "Visible low-poly faceting on flat-shaded surfaces", "tier": "important",
     "passIds": ["surface-pass", "lighting-pass"], "minimumScore": 0.7,
     "componentRefs": ["torso", "head", "ear-left", "ear-right"]},
]
s["proceduralStrategy"] = [
    {"step": "parametric drop-down primitives (sphere/cone/cylinder/capsule/torus/sweep)", "note": "all low-poly flat-shaded"},
    {"step": "sockets/attachments honour the strict seam contract", "note": ">=0.02 overlap at shared seams"},
    {"step": "config-driven palette/proportions for later tuning", "note": "conejoModelConfig.ts"},
]
s["risks"] = [
    {"risk": "silhouette reads as insect/alien", "mitigation": "wide flattened ear wedge 0.18x0.10 (not antenna), V-gap >=0.24, ears lean back, no neck pinch (head seats directly on torso), big haunches, small dark eyes + muzzle; headset removable for gate check"},
    {"risk": "halo band vs ear intersection", "mitigation": "thin band sits above/behind the crown, ears rise clearly above it; verify in front + three-quarter cameras"},
    {"risk": "long ears readability", "mitigation": "ears rise vertically from the crown with a clear V-gap; verify in front camera"},
    {"risk": "short boom-mic silhouette", "mitigation": "gate the bone chain from the left cup to the muzzle, keep it short"},
]
s["localSpecSearch"].update({
    "collection": "ingested:conejo",
    "query": "squat sitting low-poly white rabbit with exactly two long ears, dark charcoal eyes, emerald halo headset, short left boom mic (SPEC V3)",
})
s["viewEvidence"] = [
    {"id": "conejo-front", "viewpoint": "front", "confidence": 0.55,
     "imageRegion": {"x": 0.10, "y": 0.06, "width": 0.80, "height": 0.84},
     "role": "design-brief reference for the sitting conejo front silhouette",
     "url": IMG},
    {"id": "conejo-side", "viewpoint": "right-side", "confidence": 0.45,
     "imageRegion": {"x": 0.10, "y": 0.06, "width": 0.80, "height": 0.84},
     "role": "design-brief reference for the sitting pose profile and back curve",
     "url": IMG},
]

s["pipelineRouting"] = {
    "version": 1,
    "track": "character-v1.5",
    "source": "explicit",
    "status": "resolved",
    "classification": {"kind": "character", "confidence": 1.0,
                       "evidenceRefs": ["pipeline-routing:explicit:character-v1.5"],
                       "provider": "pipeline-routing-cli", "version": "1"},
    "conflicts": [],
}

# ----------------------------------------------------------------------------- evidence refs for all components (conejo ids)
for comp in s["componentTree"]:
    comp["evidenceRefs"] = list(FEATURE_EVIDENCE)
    for feat in comp.get("localFeatures", []) or []:
        if isinstance(feat, dict):
            feat["evidenceRefs"] = list(FEATURE_EVIDENCE)
    attachment = comp.get("attachment")
    if isinstance(attachment, dict) and "evidenceRefs" in attachment:
        attachment["evidenceRefs"] = list(FEATURE_EVIDENCE)
    destruction = comp.get("actionProfile", {}).get("destruction")
    if isinstance(destruction, dict):
        destruction["debrisMaterial"] = comp.get("material", comp.get("id"))

# ----------------------------------------------------------------------------- write out
with open(DST, "w", encoding="utf-8") as fh:
    json.dump(s, fh, ensure_ascii=False, indent=2)

print("wrote", DST)
print("components:", len(s["componentTree"]), [c["id"] for c in s["componentTree"]])
print("materials:", [m["id"] for m in s["materials"]])
print("bones:", len(s["rig"]["bones"]))
print("flatShading all:", all(m.get("flatShading") is True for m in s["materials"]))
print("detailInventory:", len(assessment["detailInventory"]["details"]))
print("targetTriangles:", s["performanceBudget"]["targetTriangles"])