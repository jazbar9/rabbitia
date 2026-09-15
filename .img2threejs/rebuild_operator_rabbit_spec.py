"""Rebuild object-sculpt-operator-rabbit-spec.json from the starter template.

Keeps all block-level scaffolding of the new_sculpt_spec.py output (preSpecAssessment,
qualityContract, selfCorrectLoop, pipelineRouting, ...) and reshapes the character:
replaces the humanoid 70-component tree and 13-style material set with the operator
rabbit mascot (matte white resin body, soft pink inner ears, emerald headset with
boom mic, small ink eyes), and swaps the skeleton to the battle-tested rabbit rig
extended with ear + boom-mic bones so idle/adjust-mic clips have targets to animate.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

BASE = Path(r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs")
STARTER = BASE / "object-sculpt-operator-rabbit-spec.json"
OUT = BASE / "object-sculpt-operator-rabbit-spec.json"
RUG = Path(r"C:\Users\DELL\AppData\Local\Temp\opencode\rabbit_rig.json")
REF = r"C:\Users\DELL\Desktop\RABBIT IA\03-resources\operator-rabbit-front.png"

spec = json.loads(STARTER.read_text(encoding="utf-8"))
rig = json.loads(RUG.read_text(encoding="utf-8"))

# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
base_mat = next(m for m in spec["materials"] if m["id"] == "headphone")


def mat(mid: str, name: str, dominant: str, secondary: list[str], rough: float) -> dict:
    m = json.loads(json.dumps(base_mat))
    m["id"] = mid
    m["name"] = name
    m["baseColor"] = dominant
    m["color"] = dominant
    m["albedo"] = {
        "dominant": dominant,
        "secondary": secondary,
        "samplingNotes": "palette extraction on operator-rabbit-front.png isolated mask (deterministic low-pass isolator)",
    }
    m["colorVariation"]["palette"] = [dominant, *secondary]
    m["colorVariation"]["pattern"] = "flat"
    m["colorVariation"]["amplitude"] = 0.03
    m["roughness"]["base"] = rough
    m["roughness"]["variation"] = 0.06
    m["metalness"]["base"] = 0.0
    m["metalness"]["variation"] = 0.0
    m["notes"] = f"{name}; sampled from operator-rabbit-front.png."
    return m


materials = [
    mat(
        "matte-white-resin",
        "Matte white resin (body)",
        "#F5F5F4",
        ["#EDEAE2", "#FFFFFF"],
        0.62,
    ),
    mat(
        "soft-pink-inner-ear",
        "Soft pink inner ear",
        "#B79D9A",
        ["#C7A7A2", "#9B8580"],
        0.5,
    ),
    mat(
        "emerald-headset",
        "Emerald headset plastic",
        "#157C50",
        ["#0F5C39", "#1B8F5F"],
        0.3,
    ),
    mat(
        "headset-padding",
        "Dark headset padding / mic",
        "#0C2E1D",
        ["#1A5C38", "#081F14"],
        0.55,
    ),
    mat(
        "ink-eye",
        "Ink black eye",
        "#1B1B19",
        ["#2E2E28", "#0E0E0C"],
        0.25,
    ),
]

# ---------------------------------------------------------------------------
# component helpers
# ---------------------------------------------------------------------------
EV = "operator-front"


def comp(
    cid: str,
    name: str,
    role: str,
    level: str,
    prim: str,
    cls: str,
    rationale: str,
    parent: str,
    dims: list[float],
    pos: list[float],
    material: str,
    importance: float,
    confidence: float,
    sockets: dict[str, list[float]] | None = None,
    attachment: dict | None = None,
    rotation: list[float] | None = None,
    anim_role: str = "static",
    local_features: list[dict] | None = None,
) -> dict:
    ap = {
        "animationRole": anim_role,
        "pivot": {
            "mode": "center",
            "localPosition": [0, 0, 0],
            "axis": [0, 1, 0],
            "confidence": confidence,
        },
        "transformChannels": {
            "translate": True,
            "rotate": True,
            "scale": True,
            "bend": False,
            "twist": False,
            "detach": False,
            "visibility": True,
            "materialState": True,
        },
        "sockets": [
            {"id": sid, "localPosition": pos_}
            for sid, pos_ in (sockets or {}).items()
        ],
        "collider": {
            "type": "box",
            "offset": [0, 0, 0],
            "scale": dims,
            "isTrigger": False,
            "notes": name,
        },
        "constraints": [],
        "destruction": {
            "breakable": False,
            "fractureGroup": cid,
            "seamRefs": [],
            "detachableFragments": [],
            "breakImpulse": 0.0,
            "debrisMaterial": material,
        },
    }
    return {
        "id": cid,
        "name": name,
        "level": level,
        "role": role,
        "importance": importance,
        "confidence": confidence,
        "primitive": prim,
        "topologyClass": cls,
        "topologyRationale": rationale,
        "geometryDescriptor": {
            "topologyIntent": "stylized operator-rabbit mascot part, flat-colour brand shape",
            "edgeTreatment": {
                "type": "bevel",
                "bevelRadius": 0.015,
                "segments": 2,
            },
            "deformationStack": [],
            "uvStrategy": "generated procedural coordinates",
            "normalStrategy": "vertex normals from generated geometry",
        },
        "parent": parent,
        "attachment": attachment,
        "dimensions": {
            "width": dims[0],
            "height": dims[1],
            "depth": dims[2],
            "units": "relative",
            "confidence": confidence,
        },
        "transform": {
            "position": pos,
            "rotation": rotation or [0, 0, 0],
            "scale": [1, 1, 1],
        },
        "actionProfile": ap,
        "material": material,
        "materialLayers": [material],
        "deformations": [],
        "joints": [],
        "seams": [],
        "localFeatures": local_features or [],
        "surfaceDetail": {
            "macroRoughness": 0.0,
            "microRoughness": 0.0,
            "bumpAmplitude": 0.0,
            "normalPattern": "",
            "displacementPattern": "",
            "occlusionPattern": "cavity AO at ear seats, leg gap, and ear-cup seams",
            "edgeWearPattern": "none",
            "notes": "",
        },
        "evidenceRefs": [EV],
        "details": [],
        "fidelityTier": "blockout",
    }


def attach(parent_socket: str, start: list[float], end: list[float], depth: float = 0.05) -> dict:
    return {
        "parentSocket": parent_socket,
        "localStart": start,
        "localEnd": end,
        "contactType": "embed",
        "embedDepth": depth,
        "gapTolerance": 0.01,
    }


components = []

# root
components.append(
    comp(
        "root",
        "Operator Rabbit (fullbody)",
        "assembly",
        "macro",
        "box",
        "assembled-solid",
        "Full-body mascot lockup proxy; boxes the whole rabbit for hero placement and whole-object motion.",
        None,
        [1.1, 2.8, 0.9],
        [0, 1.4, 0],
        "matte-white-resin",
        1.0,
        0.6,
        anim_role="assembly",
        sockets={"socket-body": [0, 1.4, 0], "socket-head": [0, 2.2, 0]},
    )
)

# torso
components.append(
    comp(
        "torso",
        "Bellied rounded torso",
        "body",
        "macro",
        "extrude",
        "continuous-sculpt",
        "Wide egg/bellied body mass, widest at mid height, narrowing to hips; top merges into the head mass.",
        "root",
        [0.8, 0.62, 0.5],
        [0, 1.28, 0],
        "matte-white-resin",
        1.0,
        0.7,
        attachment=attach("socket-body", [0, 1.28, 0], [0, 1.28, 0]),
        anim_role="body",
        sockets={
            "socket-head-seat": [0, 0.31, 0.02],
            "socket-leg-l": [-0.18, -0.31, 0.03],
            "socket-leg-r": [0.18, -0.31, 0.03],
            "socket-arm-l": [-0.45, -0.02, 0.05],
            "socket-arm-r": [0.45, -0.02, 0.05],
        },
        local_features=[
            {"id": "torso-belly-swell", "name": "Widest belly point at mid height", "type": "ridge", "evidenceRefs": [EV]}
        ],
    )
)

# head
components.append(
    comp(
        "head",
        "Rounded head mass",
        "body",
        "macro",
        "extrude",
        "continuous-sculpt",
        "Compact rounded head; ears and headset seat into its top/sides and the lower edge settles into the torso without a visible neck.",
        "torso",
        [0.66, 0.62, 0.5],
        [0, 0.67, 0],
        "matte-white-resin",
        1.0,
        0.8,
        attachment=attach("socket-head-seat", [0, 0.31, 0.02], [0, 0.31, 0.02]),
        anim_role="body",
        sockets={
            "socket-ear-l": [-0.22, 0.28, 0.0],
            "socket-ear-r": [0.22, 0.28, 0.0],
            "socket-headband": [0, 0.1, 0.0],
            "socket-cup-l": [-0.36, -0.08, 0.05],
            "socket-cup-r": [0.36, -0.08, 0.05],
            "socket-mic-root": [0.32, -0.14, 0.08],
            "socket-eye-l": [-0.15, -0.05, 0.24],
            "socket-eye-r": [0.15, -0.05, 0.24],
        },
        local_features=[
            {"id": "head-rounded-mass", "name": "Rounded head mass merging ears into jaw", "type": "ridge", "evidenceRefs": [EV]}
        ],
    )
)

# ears
components.append(
    comp(
        "ear-l",
        "Left ear (broader, slightly shorter)",
        "appendage",
        "meso",
        "extrude",
        "continuous-sculpt",
        "Tall broad rounded ear seated into the head top; subtle outward lean; the headset band passes in front of its inner base.",
        "head",
        [0.17, 0.5, 0.11],
        [-0.22, 0.28, -0.01],
        "matte-white-resin",
        0.9,
        0.7,
        attachment=attach("socket-ear-l", [-0.22, 0.28, 0.0], [-0.24, 0.7, 0.02]),
        anim_role="appendage",
        rotation=[0, -0.08, 0],
        local_features=[
            {"id": "ear-left-base-behind-band", "name": "Headset band arcs in front of the inner ear base", "type": "groove", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "ear-r",
        "Right ear (taller, straighter)",
        "appendage",
        "meso",
        "extrude",
        "continuous-sculpt",
        "Tall near-straight ear seated into the head top; the headset cup hugs its outer base.",
        "head",
        [0.16, 0.6, 0.1],
        [0.22, 0.28, -0.01],
        "matte-white-resin",
        0.9,
        0.7,
        attachment=attach("socket-ear-r", [0.22, 0.28, 0.0], [0.23, 0.82, 0.02]),
        anim_role="appendage",
        rotation=[0, 0.05, 0],
    )
)

# inner ears (soft pink)
components.append(
    comp(
        "inner-ear-l",
        "Left inner ear (soft pink)",
        "detail",
        "meso",
        "ellipsoid",
        "surface-relief",
        "Shallow soft-pink pad on the inner front face of the left ear; reads as the inner ear channel.",
        "ear-l",
        [0.09, 0.26, 0.03],
        [0.0, -0.03, 0.035],
        "soft-pink-inner-ear",
        0.6,
        0.6,
        attachment=attach("socket-ear-l", [-0.22, 0.28, 0.0], [-0.24, 0.7, 0.02], 0.0),
        local_features=[
            {"id": "inner-ear-pink-l", "name": "Soft pink inner ear channel on left ear", "type": "patch", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "inner-ear-r",
        "Right inner ear (soft pink)",
        "detail",
        "meso",
        "ellipsoid",
        "surface-relief",
        "Shallow soft-pink pad on the inner front face of the right ear; reads as the inner ear channel.",
        "ear-r",
        [0.08, 0.3, 0.03],
        [0.0, -0.02, 0.035],
        "soft-pink-inner-ear",
        0.6,
        0.6,
        attachment=attach("socket-ear-r", [0.22, 0.28, 0.0], [0.23, 0.82, 0.02], 0.0),
    )
)

# headset band and cups
components.append(
    comp(
        "headband",
        "Emerald headset band",
        "ring",
        "meso",
        "torus",
        "assembled-solid",
        "Emerald curved arc spanning the head crown between the two ear cups; characteristic top silhouette notch between the ears.",
        "head",
        [0.52, 0.3, 0.4],
        [0, 0.1, -0.02],
        "emerald-headset",
        0.85,
        0.7,
        attachment=attach("socket-headband", [0, 0.1, 0.0], [0, 0.1, 0.0]),
        rotation=[1.2, 0, 0],
        local_features=[
            {"id": "headset-band-arc", "name": "Emerald arc across the crown, cupping between ears", "type": "ridge", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "cup-l",
        "Emerald ear cup L",
        "detail",
        "meso",
        "sphere",
        "assembled-solid",
        "Emerald rounded ear cup hugging the left ear base; dark padded rim toward the head.",
        "head",
        [0.24, 0.18, 0.16],
        [-0.36, -0.08, 0.05],
        "emerald-headset",
        0.7,
        0.7,
        attachment=attach("socket-cup-l", [-0.36, -0.08, 0.05], [-0.36, -0.08, 0.05]),
        local_features=[
            {"id": "emerald-cup-l", "name": "Emerald left ear cup at ear base", "type": "patch", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "cup-r",
        "Emerald ear cup R",
        "detail",
        "meso",
        "sphere",
        "assembled-solid",
        "Emerald rounded ear cup hugging the right ear base; boom-mic arm emerges from its lower front edge.",
        "head",
        [0.24, 0.18, 0.16],
        [0.36, -0.08, 0.05],
        "emerald-headset",
        0.7,
        0.7,
        attachment=attach("socket-cup-r", [0.36, -0.08, 0.05], [0.36, -0.08, 0.05]),
        sockets={"socket-mic-pivot": [0.33, -0.18, 0.1]},
        local_features=[
            {"id": "emerald-cup-r", "name": "Emerald right ear cup at ear base", "type": "patch", "evidenceRefs": [EV]},
            {"id": "mic-arm-pivot", "name": "Boom-mic arm pivot at lower front of right cup", "type": "groove", "evidenceRefs": [EV]},
        ],
    )
)

# boom mic
components.append(
    comp(
        "boom-mic",
        "Emerald boom-mic arm",
        "tube",
        "meso",
        "curve-sweep",
        "open-shell",
        "Thin emerald arm curving from the right ear cup around the jaw to the muzzle, ending in the dark mic capsule; adjust-mic anchor.",
        "head",
        [0.05, 0.52, 0.05],
        [0.18, -0.22, 0.16],
        "emerald-headset",
        0.8,
        0.65,
        attachment={
            "parentSocket": "socket-mic-root",
            "localStart": [0.32, -0.14, 0.08],
            "localEnd": [0.02, -0.32, 0.24],
            "contactType": "socket-joint",
            "baseRadius": 0.03,
            "endRadius": 0.018,
            "embedDepth": 0.02,
            "gapTolerance": 0.01,
        },
        anim_role="appendage",
        sockets={"socket-mic-cap": [0.02, -0.32, 0.24]},
        local_features=[
            {"id": "boom-mic-arm", "name": "Boom-mic arm sweeping under the jaw to the muzzle", "type": "ridge", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "mic-cap",
        "Dark mic capsule",
        "detail",
        "micro",
        "sphere",
        "assembled-solid",
        "Small dark rounded microphone capsule at the muzzle end of the boom arm.",
        "boom-mic",
        [0.06, 0.06, 0.06],
        [0.0, 0.0, 0.0],
        "headset-padding",
        0.55,
        0.6,
        attachment=attach("socket-mic-cap", [0.02, -0.32, 0.24], [0.02, -0.32, 0.24]),
        local_features=[
            {"id": "mic-capsule", "name": "Dark mic capsule under the muzzle", "type": "patch", "evidenceRefs": [EV]}
        ],
    )
)

# eyes
components.append(
    comp(
        "eye-l",
        "Ink eye L",
        "detail",
        "micro",
        "ellipsoid",
        "implicit",
        "Small dark eye dot slightly proud of the head front face.",
        "head",
        [0.09, 0.06, 0.03],
        [-0.15, -0.05, 0.24],
        "ink-eye",
        0.5,
        0.6,
        attachment=attach("socket-eye-l", [-0.15, -0.05, 0.24], [-0.15, -0.05, 0.24]),
        local_features=[
            {"id": "eye-l", "name": "Small dark eye dot left of muzzle", "type": "patch", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "eye-r",
        "Ink eye R",
        "detail",
        "micro",
        "ellipsoid",
        "implicit",
        "Small dark eye dot slightly proud of the head front face.",
        "head",
        [0.09, 0.06, 0.03],
        [0.15, -0.05, 0.24],
        "ink-eye",
        0.5,
        0.6,
        attachment=attach("socket-eye-r", [0.15, -0.05, 0.24], [0.15, -0.05, 0.24]),
        local_features=[
            {"id": "eye-r", "name": "Small dark eye dot right of muzzle", "type": "patch", "evidenceRefs": [EV]}
        ],
    )
)

# arms
components.append(
    comp(
        "arm-l",
        "Left arm stub",
        "arm",
        "meso",
        "capsule",
        "assembled-solid",
        "Short rounded arm stub overlapping the left torso flank; no hands in the brand scratch.",
        "torso",
        [0.13, 0.24, 0.13],
        [-0.45, -0.02, 0.05],
        "matte-white-resin",
        0.7,
        0.6,
        attachment=attach("socket-arm-l", [-0.45, -0.02, 0.05], [-0.45, -0.02, 0.05]),
        anim_role="appendage",
        rotation=[0, 0.35, -0.2],
    )
)
components.append(
    comp(
        "arm-r",
        "Right arm stub",
        "arm",
        "meso",
        "capsule",
        "assembled-solid",
        "Short rounded arm stub overlapping the right torso flank; reaches toward the mic during the adjust-mic clip.",
        "torso",
        [0.13, 0.24, 0.13],
        [0.45, -0.02, 0.05],
        "matte-white-resin",
        0.7,
        0.6,
        attachment=attach("socket-arm-r", [0.45, -0.02, 0.05], [0.45, -0.02, 0.05]),
        anim_role="appendage",
        rotation=[0, -0.35, 0.2],
        local_features=[
            {"id": "arm-r-to-mic", "name": "Right arm swings toward boom mic in adjust-mic clip", "type": "groove", "evidenceRefs": [EV]}
        ],
    )
)

# legs
components.append(
    comp(
        "leg-l",
        "Left leg tapering to base",
        "leg",
        "meso",
        "cylinder",
        "assembled-solid",
        "Tapered column from the torso to the floor; reads as a solid plinth base rather than separated feet.",
        "torso",
        [0.2, 0.68, 0.18],
        [-0.18, -0.94, 0.02],
        "matte-white-resin",
        0.75,
        0.7,
        attachment={
            "parentSocket": "socket-leg-l",
            "localStart": [-0.18, -0.31, 0.03],
            "localEnd": [-0.18, -1.27, 0.03],
            "contactType": "socket-joint",
            "baseRadius": 0.11,
            "endRadius": 0.055,
            "embedDepth": 0.03,
            "gapTolerance": 0.01,
        },
        anim_role="appendage",
        local_features=[
            {"id": "leg-tapering-base", "name": "Leg tapering to a solid base", "type": "groove", "evidenceRefs": [EV]}
        ],
    )
)
components.append(
    comp(
        "leg-r",
        "Right leg tapering to base",
        "leg",
        "meso",
        "cylinder",
        "assembled-solid",
        "Tapered column from the torso to the floor; reads as a solid plinth base rather than separated feet.",
        "torso",
        [0.2, 0.68, 0.18],
        [0.18, -0.94, 0.02],
        "matte-white-resin",
        0.75,
        0.7,
        attachment={
            "parentSocket": "socket-leg-r",
            "localStart": [0.18, -0.31, 0.03],
            "localEnd": [0.18, -1.27, 0.03],
            "contactType": "socket-joint",
            "baseRadius": 0.11,
            "endRadius": 0.055,
            "embedDepth": 0.03,
            "gapTolerance": 0.01,
        },
        anim_role="appendage",
        local_features=[
            {"id": "leg-tapering-base", "name": "Leg tapering to a solid base", "type": "groove", "evidenceRefs": [EV]}
        ],
    )
)

# ---------------------------------------------------------------------------
# rig: rabbit skeleton + ear / boom-mic bones
# ---------------------------------------------------------------------------
bones = list(rig["bones"])
bones.extend(
    [
        {
            "id": "ear-l",
            "parent": "head",
            "jointPos": [-0.22, 1.55, 0.0],
            "tipPos": [-0.24, 2.0, 0.02],
            "component": "ear-l",
            "role": "appendage",
            "chain": "head",
        },
        {
            "id": "ear-r",
            "parent": "head",
            "jointPos": [0.22, 1.55, 0.0],
            "tipPos": [0.23, 2.15, 0.02],
            "component": "ear-r",
            "role": "appendage",
            "chain": "head",
        },
        {
            "id": "boom-mic",
            "parent": "head",
            "jointPos": [0.32, 1.25, 0.08],
            "tipPos": [0.02, 1.0, 0.24],
            "component": "boom-mic",
            "role": "appendage",
            "chain": "head",
        },
    ]
)

# ---------------------------------------------------------------------------
# authored top-level updates
# ---------------------------------------------------------------------------
spec["targetName"] = "Operator Rabbit"
spec["targetId"] = "operator-rabbit"
spec["sourceImage"] = REF
spec["suitability"] = "conditional"
spec["componentTree"] = components
spec["materials"] = materials
spec["rig"] = rig
spec["rig"]["bones"] = bones
spec["referenceCamera"]["solved"] = False
spec["referenceCamera"]["note"] = (
    "SKIPPED: flat-colour textureless mascot route; no photo projection. "
    "Proportions/silhouette derived from the admitted front mask."
)

spec["coordinateFrame"] = {
    "front": "toward the camera (the facing plane of the mascot)",
    "up": "image up (ears toward top)",
    "scaleReference": "head ~0.5 world units; full mascot ~2.6 units (chibi figurine, styleHeads 2.0)",
}

spec["silhouette"] = {
    "boundingShape": "tall rounded marmot: two tall ears on top capped by an emerald headset band arc, wide rounded head, bellied torso widest at mid height, two tapered legs closing into a solid base",
    "aspectRatios": [
        {"label": "figure-height-to-width", "value": 2.11, "unit": "ratio", "confidence": 0.7, "source": "isolated front mask"},
        {"label": "head-unit-to-figure", "value": 0.507, "unit": "ratio", "confidence": 0.6, "source": "crown..neck / figure"},
    ],
    "symmetry": "bilateral about the vertical axis (ears, eyes, cups, arms, legs mirror); boom mic is the single asymmetric element on the lower right of the head",
    "dominantCurves": [
        "ear pair with a deep central notch where the headset band arcs between them",
        "rounded head merging into jaw without a visible neck",
        "belly widest at mid height, curving into hips",
        "tapered legs closing to a solid base",
    ],
    "negativeSpaces": [
        "central V-notch between the ears above the headset band",
        "gap between the two legs near the base",
    ],
    "landmarks": [
        {"id": "crown-ear-left-tip", "x": 0.384, "y": 0.04},
        {"id": "crown-ear-right-tip", "x": 0.545, "y": 0.05},
        {"id": "headset-band-apex", "x": 0.47, "y": 0.12},
        {"id": "ear-cup-left", "x": 0.40, "y": 0.30},
        {"id": "ear-cup-right", "x": 0.60, "y": 0.30},
        {"id": "boom-mic-tip", "x": 0.56, "y": 0.36},
        {"id": "belly-widest-left", "x": 0.42, "y": 0.45},
        {"id": "belly-widest-right", "x": 0.58, "y": 0.45},
        {"id": "base-left", "x": 0.44, "y": 0.68},
        {"id": "base-right", "x": 0.56, "y": 0.68},
    ],
}

spec["scores"] = {
    "object_isolation": 1,
    "silhouette_readability": 2,
    "depth_inference": 1,
    "primitive_decomposition": 2,
    "material_procedurality": 2,
    "occlusion_risk": 1,
    "interaction_fit": 2,
}

spec["viewEvidence"] = [
    {
        "id": EV,
        "viewpoint": "front",
        "confidence": 0.5,
        "imageRegion": {"x": 0.384, "y": 0.04, "width": 0.545, "height": 0.64},
        "notes": "Single admitted reference view; back/sides unobserved.",
    }
]

spec["animationAnchors"] = [
    "root pivot node supports whole-object translation, rotation, scale, and visibility changes",
    "idle: subtle body sway (root/chest chain), gentle ear per-k updates on ear-l/ear-r bones",
    "adjust-mic: head bone dips slightly and right arm (upper-arm-r/hand-r chain) reaches toward boom-mic tip; boom-mic bone eases toward the muzzle",
    "component pivot groups support later local transforms without rebuilding geometry",
    "each macro/meso component is a stable named Object3D with action metadata, sockets, collider, and destruction metadata",
]

spec["assumptions"] = [
    "Back of the headset band and the far-side ear cup are hidden behind the head/ears (single front view)",
    "Legs close into a solid plinth base; no separated feet",
    "Boom-mic arm passes in front of the right-hand head contour on the reference",
    "Inner-ear soft pink is a muted brand accent, not saturated coral",
    "Status: unverified until user visual review on the hero mount",
]

spec["risks"] = [
    "Only the front view is admitted; depth, back geometry, headset band thickness, and ear proportion behind the head are inferred (confidence 0.5)",
    "Emerald headset hue/saturation may drift from brand reference without a colour-locked lookup at review time",
    "Ellipsoid/continuous-sculpt pairing for inner ears may read as a patch rather than relief; check at render-capture",
]

spec["lightingFromPhoto"] = [
    {
        "role": "key light",
        "kind": "directional",
        "direction": "high front-right",
        "color": "neutral daylight",
        "intensity": "dominant",
        "notes": "Establishes form falloff across ears and headset; renders the emerald cups with a small specular pop.",
    },
    {
        "role": "fill light",
        "kind": "hemisphere/environment",
        "color": "cool ambient",
        "intensity": "soft", 
        "notes": "Lifts shadow value range; keeps matte white resin soft and even.",
    },
    {
        "role": "rim or environment light",
        "kind": "environment / back rim",
        "direction": "from behind, low back-left",
        "color": "subtle warm",
        "intensity": "narrow rim",
        "notes": "Separates the ears and headset band from the hero background.",
    },
    {
        "role": "exposure and tone mapping",
        "intent": "exposure locked so matte white stays near #F5F5F4 and emerald stays vivid; ACES tone mapping",
        "notes": "Flat value range avoided; emerald headset is the palette anchor, not a glow.",
    },
    {
        "role": "contact shadow / ground shadow",
        "behavior": "soft contact shadow under the plinth base on the hero surface",
        "notes": "Orients the mascot in space at the hero placement.",
    },
]

spec["preSpecAssessment"]["objectClass"]["primaryType"] = "operator-rabbit mascot"
spec["preSpecAssessment"]["objectClass"]["primaryDomain"] = "character"
spec["preSpecAssessment"]["objectClass"]["formLanguage"] = ["rounded", "chibi figurine", "flat-colour brand shape"]
spec["preSpecAssessment"]["objectClass"]["structureKind"] = ["assembled character", "procedural factory"]
spec["preSpecAssessment"]["objectClass"]["motionPotential"] = ["idle body sway", "head dip", "ear wiggle", "arm-to-mic gesture"]
spec["preSpecAssessment"]["objectClass"]["materialFamilies"] = ["matte polymer", "glossy plastic", "soft rubber padding"]
spec["preSpecAssessment"]["complexity"]["scores"] = {
    "silhouetteComplexity": 2,
    "componentCount": 2,
    "hierarchyDepth": 2,
    "repetitionDensity": 1,
    "materialLayerCount": 2,
    "localDetailDensity": 2,
    "occlusionRisk": 1,
    "actionReadinessNeed": 3,
}

# keep the starter's proceduralStrategy/buildPasses/preSpecAssessment detail -> unbranded scaffolding
spec["proceduralStrategy"] = [
    "Block out macro silhouette first: torso, head, ear pair, headset band, cups, boom-mic.",
    "Add component hierarchy and joints with stable pivot groups and sockets.",
    "Refine forms with bevels, tapers, and the headset band deformation stack.",
    "Author the rig skeleton with ear/boom-mic bones; bind skins after build pass.",
    "Emit idle + adjust-mic clips and export the GLB companion model.",
]

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
bak = BASE / "object-sculpt-operator-rabbit-spec.starter.json"
shutil.copyfile(OUT, bak)
OUT.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"WROTE {OUT.name} ({len(components)} components, {len(materials)} materials, {len(bones)} bones)")
print(f"backup: {bak.name}")