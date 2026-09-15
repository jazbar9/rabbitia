"""Rebuild the RabbitIA full-body rabbit spec from the scaffold.

Reads object-sculpt-rabbit-spec.json (generic humanoid scaffold), replaces the
componentTree/materials/silhouette/viewEvidence/featureReviewTargets/assumptions/
lighting/coordinateFrame with a rabbit-mascot authored from the deterministic
mask-profile of public/rabbit.png, patches preSpecAssessment.detailInventory from
assessment-rabbit.json, and writes back to the same path.
"""
import json
import sys

SPEC = r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs\object-sculpt-rabbit-spec.json"
ASSESS = r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs\assessment-rabbit.json"

with open(SPEC, encoding="utf-8") as fh:
    spec = json.load(fh)
with open(ASSESS, encoding="utf-8") as fh:
    assessment = json.load(fh)
pre = assessment["preSpecAssessment"]


def comp(
    cid, name, level, role, importance, confidence, primitive, topology_class,
    topology_rationale, parent, attachment, dimensions, transform,
    material, local_features=None, material_layers=None, fidelity="blockout",
    edges=None, surface=None, sockets=None, breakable=False,
):
    material_layers = material_layers or [material]
    return {
        "id": cid,
        "name": name,
        "level": level,
        "role": role,
        "importance": importance,
        "confidence": confidence,
        "primitive": primitive,
        "topologyClass": topology_class,
        "topologyRationale": topology_rationale,
        "geometryDescriptor": {
            "topologyIntent": "stylized rabbit mascot part, flat-colour brand shape",
            "edgeTreatment": edges
            or {"type": "bevel", "bevelRadius": 0.015, "segments": 2},
            "deformationStack": [],
            "uvStrategy": "generated procedural coordinates",
            "normalStrategy": "vertex normals from generated geometry",
        },
        "parent": parent,
        "attachment": attachment,
        "dimensions": dimensions,
        "transform": transform,
        "actionProfile": {
            "animationRole": role,
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
            "sockets": sockets or [],
            "collider": {
                "type": "box",
                "offset": [0, 0, 0],
                "scale": dimensions.get("scale_width")
                or dimensions["width"],
                "isTrigger": False,
                "notes": name,
            },
            "constraints": [],
            "destruction": {
                "breakable": breakable,
                "fractureGroup": cid,
                "seamRefs": [],
                "detachableFragments": [],
                "breakImpulse": 0.0,
                "debrisMaterial": material,
            },
        },
        "material": material,
        "materialLayers": material_layers,
        "deformations": [],
        "joints": [],
        "seams": [],
        "localFeatures": local_features or [],
        "surfaceDetail": surface
        or {
            "macroRoughness": 0.0,
            "microRoughness": 0.0,
            "bumpAmplitude": 0.0,
            "normalPattern": "",
            "displacementPattern": "",
            "occlusionPattern": "cavity AO at ear seats and body-silhouette junctions",
            "edgeWearPattern": "none",
            "notes": "",
        },
        "evidenceRefs": ["rabbit-mask"],
        "details": [],
        "fidelityTier": fidelity,
    }


# ---- component tree body (root sits above, attached in code below) ----
# Unit scale: head is ~0.5 x 0.42; total rabbit height ~2.4 heads.
components_raw = [
    comp(
        "root", "RabbitIA Rabbit (fullbody)", "macro", "assembly", 1.0, 0.7,
        "box", "assembled-solid",
        "Full-body mascot lockup proxy; boxes the whole rabbit for hero placement and whole-object motion.",
        None, None,
        {"width": 1.0, "height": 2.5, "depth": 1.0, "units": "relative", "confidence": 0.6},
        {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "hidden",
        sockets=[
            {"id": "socket-body", "localPosition": [0, -0.2, 0]},
            {"id": "socket-head", "localPosition": [0, 1.55, 0]},
        ],
    ),
    comp(
        "torso", "Bellied rounded torso", "macro", "body", 1.0, 0.75,
        "extrude", "continuous-sculpt",
        "Wide egg/bellied body mass, widest at mid height, narrowing to hips; top merges into the head mass.",
        "root",
        {"parentSocket": "socket-body", "localStart": [0, -0.2, 0],
         "localEnd": [0, -0.2, 0], "contactType": "embed",
         "embedDepth": 0.04, "gapTolerance": 0.01},
        {"width": 0.55, "height": 0.7, "depth": 0.32, "units": "relative", "confidence": 0.7},
        {"position": [0, 0.05, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "lime-mascot",
        local_features=[
            {"id": "torso-belly-swell", "name": "Widest belly point at mid height",
             "type": "ridge", "evidenceRefs": ["rabbit-mask"]}
        ],
        sockets=[
            {"id": "socket-head-seat", "localPosition": [0, 0.34, 0.02]},
            {"id": "socket-leg-l", "localPosition": [-0.18, -0.32, 0.03]},
            {"id": "socket-leg-r", "localPosition": [0.18, -0.32, 0.03]},
            {"id": "socket-arm-stub-left", "localPosition": [-0.28, -0.02, 0.03]},
        ],
    ),
    comp(
        "head", "Rounded head mass", "macro", "body", 1.0, 0.8,
        "extrude", "continuous-sculpt",
        "Compact rounded head; ears seat into its top and the lower edge settles into the torso without a visible neck.",
        "torso",
        {"parentSocket": "socket-head-seat", "localStart": [0, 0.34, 0.02],
         "localEnd": [0, 0.34, 0.02], "contactType": "embed",
         "embedDepth": 0.05, "gapTolerance": 0.01},
        {"width": 0.42, "height": 0.4, "depth": 0.3, "units": "relative", "confidence": 0.7},
        {"position": [0, 0.55, 0.0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "lime-mascot",
        sockets=[
            {"id": "socket-ear-left", "localPosition": [-0.14, 0.2, 0.0]},
            {"id": "socket-ear-right", "localPosition": [0.16, 0.2, 0.02]},
        ],
    ),
    comp(
        "ear-left", "Left ear (broader, shorter, outcurved)", "meso", "appendage", 0.9, 0.8,
        "extrude", "continuous-sculpt",
        "Broader and shorter ear; outer edge curves outward, roughly half the right ear's length.",
        "head",
        {"parentSocket": "socket-ear-left", "localStart": [-0.14, 0.2, 0.0],
         "localEnd": [-0.18, 0.42, 0.03], "contactType": "embed",
         "embedDepth": 0.05, "gapTolerance": 0.01},
        {"width": 0.1, "height": 0.32, "depth": 0.07, "units": "relative", "confidence": 0.75},
        {"position": [-0.16, 0.32, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "cream-accent",
        local_features=[
            {"id": "ear-left-outcurve", "name": "Outward curve on the outer ear edge",
             "type": "ridge", "evidenceRefs": ["rabbit-mask"]}
        ],
    ),
    comp(
        "ear-right", "Right ear (taller, narrower, straight)", "meso", "appendage", 0.95, 0.8,
        "extrude", "continuous-sculpt",
        "Tall slender near-straight ear, tallest element of the silhouette, slight inward lean toward the head top.",
        "head",
        {"parentSocket": "socket-ear-right", "localStart": [0.16, 0.2, 0.02],
         "localEnd": [0.14, 0.55, 0.05], "contactType": "embed",
         "embedDepth": 0.05, "gapTolerance": 0.01},
        {"width": 0.09, "height": 0.45, "depth": 0.07, "units": "relative", "confidence": 0.75},
        {"position": [0.16, 0.38, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "cream-accent",
        local_features=[
            {"id": "ear-right-tall", "name": "Tall near-straight silhouette profile",
             "type": "ridge", "evidenceRefs": ["rabbit-mask"]}
        ],
    ),
    comp(
        "arm-stub-left", "Small left arm/paw stub", "meso", "appendage", 0.6, 0.6,
        "extrude", "continuous-sculpt",
        "Short rounded paw stub overlapping the lower-left torso flank.",
        "torso",
        {"parentSocket": "socket-arm-stub-left", "localStart": [-0.28, -0.02, 0.03],
         "localEnd": [-0.34, -0.16, 0.05], "contactType": "overlap",
         "embedDepth": 0.03, "gapTolerance": 0.01},
        {"width": 0.1, "height": 0.14, "depth": 0.1, "units": "relative", "confidence": 0.6},
        {"position": [-0.3, -0.1, 0.03], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "lime-mascot",
    ),
    comp(
        "leg-l", "Left leg tapering to foot", "meso", "appendage", 0.85, 0.75,
        "extrude", "continuous-sculpt",
        "Lower limb from hip to rounded foot, tapering downward, separated from the right leg by a clear gap.",
        "torso",
        {"parentSocket": "socket-leg-l", "localStart": [-0.18, -0.32, 0.03],
         "localEnd": [-0.2, -0.55, 0.04], "contactType": "embed",
         "embedDepth": 0.04, "gapTolerance": 0.01},
        {"width": 0.16, "height": 0.3, "depth": 0.14, "units": "relative", "confidence": 0.7},
        {"position": [-0.19, -0.44, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "lime-mascot",
    ),
    comp(
        "leg-r", "Right leg tapering to foot", "meso", "appendage", 0.85, 0.75,
        "extrude", "continuous-sculpt",
        "Lower limb from hip to rounded foot, tapering downward, separated from the left leg.",
        "torso",
        {"parentSocket": "socket-leg-r", "localStart": [0.18, -0.32, 0.03],
         "localEnd": [0.2, -0.55, 0.04], "contactType": "embed",
         "embedDepth": 0.04, "gapTolerance": 0.01},
        {"width": 0.16, "height": 0.3, "depth": 0.14, "units": "relative", "confidence": 0.7},
        {"position": [0.19, -0.44, 0.02], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "lime-mascot",
    ),
]
# attach root children
components_raw[0]["actionProfile"]["sockets"] = [
    {"id": "socket-body", "localPosition": [0, 0, 0]},
    {"id": "socket-head", "localPosition": [0, 1.55, 0]},
]
tree = [components_raw[0]] + [
    c for c in components_raw if c["id"] != "root"
]
spec["componentTree"] = tree


# ---- materials ----
spec["materials"] = [
    {
        "id": "lime-mascot",
        "name": "Brand lime mascot polymer",
        "type": "standard",
        "shaderModel": "MeshPhysicalMaterial / PBR approximation",
        "textureless": {
            "declared": True,
            "evidence": [
                "flat-colour brand shape in public/rabbit.png (single dominant albedo cluster, no grain/pores/print)",
                "identity sits in silhouette, proportion, and colour boundaries, not surface relief"
            ]
        },
        "baseColor": "#7FFF00",
        "color": "#7FFF00",
        "albedo": {
            "dominant": "#7FFF00",
            "secondary": ["#A6FF5C", "#6BD600"],
            "samplingNotes": "extract_part_color_recipe.py on rabbit.png: dominant rgba(127,255,0), secondary rgba(243,243,223) cream; rough glossy plastic (roughnessEstimate 0.133)."
        },
        "colorVariation": {
            "palette": ["#7FFF00", "#A6FF5C", "#5FBF00"],
            "pattern": "mottled",
            "amplitude": 0.07,
            "heightCorrelation": 0.15
        },
        "roughness": {"base": 0.35, "variation": 0.12, "map": "independent-procedural-field",
                      "localResponse": "higher at ear seats and leg crotch, lower on belly highlight"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "ambientOcclusion": {"cavityStrength": 0.3, "contactShadowBias": 0.35,
                             "notes": "Darken ear seats, leg separation gap, and arm-stub flank."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#1F2E00"},
        "localOverrides": [
            {"id": "flank-cavity-ao", "name": "Cavity AO at ear seats and leg gap",
             "type": "mask", "secret": "darken appendage junctions"}
        ],
        "shaderNotes": [
            "MeshPhysicalMaterial, clearcoat 0.0, glossier than the ink lockup (roughnessEstimate 0.133)."
        ],
        "notes": "Brand lime accent #7FFF00 from rabbit.png dominant albedo."
    },
    {
        "id": "cream-accent",
        "name": "Cream accent polymer",
        "type": "standard",
        "shaderModel": "MeshPhysicalMaterial / PBR approximation",
        "textureless": {
            "declared": True,
            "evidence": [
                "secondary albedo cluster rgba(243,243,223) from rabbit.png; flat colour, no texture"
            ]
        },
        "baseColor": "#F3F3DF",
        "color": "#F3F3DF",
        "albedo": {
            "dominant": "#F3F3DF",
            "secondary": ["#FFFFFF", "#D8D8BE"],
            "samplingNotes": "Cream secondary cluster observed in rabbit.png extraction; used for the ear pair."
        },
        "colorVariation": {
            "palette": ["#F3F3DF", "#FFFFFF", "#D8D8BE"],
            "pattern": "mottled",
            "amplitude": 0.05,
            "heightCorrelation": 0.1
        },
        "roughness": {"base": 0.4, "variation": 0.1, "map": "independent-procedural-field",
                      "localResponse": ""},
        "metalness": {"base": 0.0, "variation": 0.0},
        "ambientOcclusion": {"cavityStrength": 0.2, "contactShadowBias": 0.3,
                             "notes": "Darken base of ears where they seat into the head."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#B9B98F"},
        "localOverrides": [],
        "shaderNotes": [
            "MeshPhysicalMaterial, matte-cream, softer than the lime body."
        ],
        "notes": "Cream accent #F3F3DF from rabbit.png secondary cluster."
    },
]


# ---- silhouette / viewEvidence ----
spec["silhouette"] = {
    "summary": "Upright full-body rabbit mascot: two ears (right taller/narrower and straight, left shorter/broader and outcurved) above a compact rounded head, a bellied egg-shaped torso widest at mid height, and two separated legs tapering to rounded feet. No neck, no tail visible. Flat brand colours: lime body + cream ears.",
    "aspectRatio": "1.0 (square canvas)",
    "landmarks": [
        {"name": "right-ear-tip", "point": [0.60, 0.08], "note": "tallest silhouette point"},
        {"name": "left-ear-tip", "point": [0.40, 0.20], "note": "second highest"},
        {"name": "head-top-center", "point": [0.52, 0.25], "note": "between ears, lower than right ear"},
        {"name": "belly-max-width", "point": [0.5, 0.55], "note": "widest torso band"},
        {"name": "left-foot", "point": [0.30, 0.95], "note": "ground contact"},
        {"name": "right-foot", "point": [0.72, 0.95], "note": "ground contact"}
    ],
    "proportionNotes": "Total style height ~2.4 head units; torso ~1.6 heads wide at the belly; legs ~0.8 heads with feet on the canvas baseline."
}
spec["viewEvidence"] = {
    "primaryView": "front",
    "suggestedCameras": ["front 3/4 high", "side 3/4 low", "top-down heads"],
    "note": "rabbit.png is a 2D flat-colour mark; rendered from deterministic mask-profile, reference camera not solvable (no raster plane)."
}


# ---- featureReviewTargets ----
spec["featureReviewTargets"] = [
    {
        "id": "ear-asymmetry-silhouette",
        "name": "Right ear taller/straighter than the outcurved left ear",
        "tier": "critical",
        "passIds": ["blockout", "proportion-lock"],
        "minimumScore": 0.85,
        "mustPass": True,
        "componentRefs": ["ear-left", "ear-right"],
        "evidenceRefs": ["rabbit-mask"]
    },
    {
        "id": "belly-torso-mass",
        "name": "Bellied egg torso widest at mid height",
        "tier": "critical",
        "passIds": ["blockout", "proportion-lock"],
        "minimumScore": 0.8,
        "mustPass": True,
        "componentRefs": ["torso"],
        "evidenceRefs": ["rabbit-mask"]
    },
    {
        "id": "leg-separation-and-feet",
        "name": "Separated legs tapering to rounded feet on the baseline",
        "tier": "important",
        "passIds": ["blockout", "proportion-lock"],
        "minimumScore": 0.8,
        "mustPass": True,
        "componentRefs": ["leg-l", "leg-r"],
        "evidenceRefs": ["rabbit-mask"]
    },
    {
        "id": "lime-cream-material-contrast",
        "name": "Lime body with cream ear pair and clean colour boundaries",
        "tier": "important",
        "passIds": ["material-pass"],
        "minimumScore": 0.75,
        "mustPass": True,
        "componentRefs": ["torso", "ear-left"],
        "evidenceRefs": ["rabbit-palette"]
    }
]


# ---- assumptions ----
spec["assumptions"] = [
    "rabbit.png mask-profile (analyze_mask.py) is the geometry source: upright full-body rabbit, ears + head + bellied torso + two legs. User confirmed full-body mascot and palette from rabbit.png.",
    "Materials are flat brand colours (lime #7FFF00 body, cream #F3F3DF ears) from extract_part_color_recipe.py; both declared textureless.",
    "The cream cluster reads as the ear pair (secondary albedo, 3-cluster Lab result). If inner-ear/face marks exist they are treated as cream accent zones.",
    "No neck or visible tail in the mask profile; head merges directly into the torso."
]


# ---- lightingFromPhoto (front 3/4 studio) ----
spec["lightingFromPhoto"] = [
    {
        "role": "key light",
        "kind": "directional",
        "direction": "high front-right",
        "color": "neutral ~6000K",
        "intensity": "dominant",
        "notes": "Runs across the right ear and belly to separate the rounded masses."
    },
    {
        "role": "fill light",
        "kind": "hemisphere/environment",
        "color": "cool ambient",
        "intensity": "soft ~0.35 key",
        "notes": "Keeps the lime readable without flattening the belly form."
    },
    {
        "role": "rim or environment light",
        "kind": "back rim",
        "direction": "from behind low-left",
        "color": "subtle warm 4400K",
        "intensity": "narrow rim",
        "notes": "Traces the ear tips and torso flank against the hero background."
    },
    {
        "role": "exposure and tone mapping",
        "intent": "lock exposure so the lime stays near #7FFF00 and the cream near #F3F3DF; ACES tone mapping",
        "notes": "Flat value range avoided; colour boundaries stay crisp."
    },
    {
        "role": "contact shadow / ground shadow",
        "behavior": "soft contact shadow and subtle ambient-occlusion under both feet on the hero surface",
        "notes": "Orients the standing mascot at the hero placement."
    }
]


# ---- coordinateFrame ----
spec["coordinateFrame"] = {
    "front": "toward the camera (the flat mark's facing plane)",
    "up": "canvas up (ears toward top)",
    "scaleReference": "head ~0.5 world units; total mascot ~2.4 heads"
}


# ---- preSpecAssessment.detailInventory patch from assessment ----
if "preSpecAssessment" in spec:
    spec["preSpecAssessment"]["detailInventory"] = pre["detailInventory"]
    spec["preSpecAssessment"]["unknownsToResolveBeforeImplementation"] = pre.get(
        "unknownsToResolveBeforeImplementation", []
    )

with open(SPEC, "w", encoding="utf-8") as fh:
    json.dump(spec, fh, ensure_ascii=False, indent=2)

print("rewrote", SPEC)
print("components:", [c["id"] for c in spec["componentTree"]])
print("materials:", [m["id"] for m in spec["materials"]])
print("featureReviewTargets:", [t["id"] for t in spec["featureReviewTargets"]])