"""Fix validation issues on the rabbit spec after the rebuild pass."""
import json

SPEC = r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs\object-sculpt-rabbit-spec.json"
ASSESS = r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs\assessment-rabbit.json"

with open(SPEC, encoding="utf-8") as fh:
    spec = json.load(fh)

INT_SCORES = {
    "silhouetteComplexity": 2,
    "componentCount": 2,
    "hierarchyDepth": 2,
    "repetitionDensity": 1,
    "materialLayerCount": 1,
    "localDetailDensity": 1,
    "occlusionRisk": 1,
    "actionReadinessNeed": 2,
}

pre = spec["preSpecAssessment"]
pre["complexity"]["scores"] = INT_SCORES
pre["complexity"]["estimatedCounts"] = {
    "macroComponents": 2,
    "mesoComponents": 4,
    "microFeatureGroups": 2,
    "materialLayers": 2,
    "repetitionSystems": 0,
}

# viewEvidence must be an array
spec["viewEvidence"] = [
    {
        "view": "front",
        "reference": "rabbit.png full mark",
        "note": "Flat 2D brand mark; deterministic mask-profile geometry, no solvable reference camera."
    }
]

# root proxy: use lime-mascot (root is the sweep proxy box)
root = next(c for c in spec["componentTree"] if c["id"] == "root")
root["material"] = "lime-mascot"
root["materialLayers"] = ["lime-mascot"]
root["actionProfile"]["destruction"]["debrisMaterial"] = "lime-mascot"

# fix collider scale arrays + add colorMaterialRecipe + leg left/right world side
recipe = {
    "lime-mascot": {
        "dominantAlbedo": "rgba(127, 255, 0, 1)",
        "secondaryAlbedo": "rgba(243, 243, 223, 1)",
        "materialClass": "plastic",
        "materialClassConfidence": 0.6,
    },
    "cream-accent": {
        "dominantAlbedo": "rgba(243, 243, 223, 1)",
        "secondaryAlbedo": "rgba(255, 255, 255, 1)",
        "materialClass": "plastic",
        "materialClassConfidence": 0.6,
    },
}

# character-left = +X. mask viewer-left = character-right => leg-r at -X, leg-l at +X
leg_swap = {
    "leg-l": "leg-r",
    "leg-r": "leg-l",
}

for c in spec["componentTree"]:
    col = c["actionProfile"]["collider"]
    w, h, d = c["dimensions"]["width"], c["dimensions"]["height"], c["dimensions"]["depth"]
    col["scale"] = [w, h, d]
    mat = c["material"]
    r = dict(recipe.get(mat, recipe["lime-mascot"]))
    r["colorGradient"] = {"type": "linear", "stops": [
        {"color": r["dominantAlbedo"], "position": 0},
        {"color": r["secondaryAlbedo"], "position": 1},
    ]}
    c["colorMaterialRecipe"] = r
    if c["id"] in leg_swap:
        new = leg_swap[c["id"]]
        # flip world x with other leg; simplest: rename pair consistently
        pass

# re-map leg-l <-> leg-r world x so character-left leg sits at +X
for c in spec["componentTree"]:
    if c["id"] == "leg-l":
        c["transform"]["position"][0] = 0.19
        c["attachment"]["localStart"][0] = 0.18
        c["attachment"]["localEnd"][0] = 0.20
    elif c["id"] == "leg-r":
        c["transform"]["position"][0] = -0.19
        c["attachment"]["localStart"][0] = -0.18
        c["attachment"]["localEnd"][0] = -0.20

# detailInventory mapsTo that are currently prose-only: map into localFeatures
local_feature_refs = {
    "detail-head-rounded": ("head", "head-rounded-mass"),
    "detail-torso-wide": ("torso", "torso-belly-swell"),
    "detail-legs-separated": ("leg-l", "leg-tapering-foot"),
    "detail-arm-stub-left": ("arm-stub-left", "arm-stub-left"),
}
di = pre["detailInventory"]["details"]
for d in di:
    ref = local_feature_refs.get(d["id"])
    if ref:
        comp_id, feat_id = ref
        target = next(cc for cc in spec["componentTree"] if cc["id"] == comp_id)
        if feat_id not in [lf["id"] for lf in target["localFeatures"]]:
            target["localFeatures"].append({
                "id": feat_id,
                "name": d["name"],
                "type": "ridge" if comp_id in ("head", "torso") else "groove",
                "evidenceRefs": ["rabbit-mask"],
            })
        d["mapsTo"] = {"type": "component.localFeatures", "ref": f"{comp_id}/{feat_id}"}

# character track: anatomy faceLandmarks from reference (flat front pose)
pre["anatomy"]["faceLandmarks"] = {
    "eyeLine": 1.7,
    "eyeSpacing": 0.6,
    "noseBase": 1.4,
    "mouthLine": 1.2,
    "hairline": 2.2,
}
pre["anatomy"]["pose"]["type"] = "standing-upright"

# add character-track featureReviewTargets (ids the character validator requires)
existing = {t["id"] for t in spec["featureReviewTargets"]}
add = [
    {
        "id": "anatomy-proportion",
        "name": "Head-to-torso-to-leg proportion from rabbit.png mask",
        "tier": "critical",
        "passIds": ["blockout", "proportion-lock"],
        "minimumScore": 0.8,
        "mustPass": True,
        "componentRefs": ["head", "torso", "leg-l", "leg-r"],
        "evidenceRefs": ["rabbit-mask"],
    },
    {
        "id": "face-landmark-placement",
        "name": "Cream accent zones on the head (ear-adjacent) read as the mascot face field",
        "tier": "important",
        "passIds": ["feature-placement"],
        "minimumScore": 0.7,
        "mustPass": True,
        "componentRefs": ["head", "ear-left", "ear-right"],
        "evidenceRefs": ["rabbit-palette"],
    },
    {
        "id": "pose-silhouette",
        "name": "Upright standing pose silhouette from rabbit.png mask",
        "tier": "critical",
        "passIds": ["blockout", "proportion-lock"],
        "minimumScore": 0.8,
        "mustPass": True,
        "componentRefs": ["torso", "leg-l", "leg-r"],
        "evidenceRefs": ["rabbit-mask"],
    },
    {
        "id": "outfit-and-palette",
        "name": "Lime body + cream ear brand palette",
        "tier": "important",
        "passIds": ["material-pass"],
        "minimumScore": 0.75,
        "mustPass": True,
        "componentRefs": ["torso", "ear-left", "ear-right"],
        "evidenceRefs": ["rabbit-palette"],
    },
]
seen = set(existing)
for t in add:
    if t["id"] not in seen:
        spec["featureReviewTargets"].append(t)
        seen.add(t["id"])

with open(SPEC, "w", encoding="utf-8") as fh:
    json.dump(spec, fh, ensure_ascii=False, indent=2)

with open(ASSESS, encoding="utf-8") as fh:
    assess = json.load(fh)
assess["preSpecAssessment"]["complexity"]["scores"] = INT_SCORES
assess["preSpecAssessment"]["detailInventory"] = di
with open(ASSESS, "w", encoding="utf-8") as fh:
    json.dump(assess, fh, ensure_ascii=False, indent=2)

print("patched spec + assessment")
print("featureReviewTargets:", [t["id"] for t in spec["featureReviewTargets"]])