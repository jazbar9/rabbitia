"""Final small fixes: passOrder gains structural/surface passes, viewEvidence id, move unknown to assumption."""
import json

SPEC = r"C:\Users\DELL\Desktop\RABBIT IA\02-repo\.img2threejs\object-sculpt-rabbit-spec.json"

with open(SPEC, encoding="utf-8") as fh:
    spec = json.load(fh)

sp = spec["sculptPipeline"]
sp["passOrder"] = [
    "blockout",
    "structural-pass",
    "proportion-lock",
    "feature-placement",
    "form-refinement",
    "material-pass",
    "surface-pass",
    "lighting-pass",
    "interaction-pass",
    "optimization-pass",
]
sp["currentPass"] = "blockout"
sp["completedPasses"] = []
sp["lastCompletedPass"] = ""
sp["passGateMode"] = "locked-sequential"
sp["blockedReason"] = "blockout requires a browser render and user side-by-side review before structural-pass unlocks"
sp["nextRequiredEvidence"] = [
    "blockout browser render screenshot",
    "side-by-side rabbit.png / render comparison sheet",
    "user visual approval of ear asymmetry, belly torso, separated legs",
    "reviewHistory entry for blockout with action=continue"
]

spec["buildPasses"] = [
    {
        "id": "blockout",
        "goal": "Match head-unit proportions and upright pose silhouette from rabbit.png mask.",
        "componentRefs": ["root", "torso", "head", "ear-left", "ear-right", "arm-stub-left", "leg-l", "leg-r"],
        "acceptance": [
            "Ear asymmetry reads: right ear taller/straighter than outcurved left ear.",
            "Bellied torso widest at mid height, total height ~2.4 heads."
        ]
    },
    {
        "id": "structural-pass",
        "goal": "Socket attachment contracts hold: ears into head, legs/arm into torso.",
        "componentRefs": ["torso", "head", "ear-left", "ear-right", "arm-stub-left", "leg-l", "leg-r"],
        "acceptance": [
            "No child part floats from its parent socket.",
            "Leg separation gap matches rabbit.png mask."
        ]
    },
    {
        "id": "proportion-lock",
        "goal": "Lock ear length, head width, belly swell, and leg drop ratios.",
        "componentRefs": ["torso", "head", "ear-left", "ear-right", "leg-l", "leg-r"],
        "acceptance": [
            "Head/torso/leg proportions verified against the mask profile."
        ]
    },
    {
        "id": "feature-placement",
        "goal": "Cream accent ear pair reads as the mascot face field on the lime body.",
        "componentRefs": ["head", "ear-left", "ear-right"],
        "acceptance": [
            "Ear bases seat cleanly into the head; colour boundary crisp."
        ]
    },
    {
        "id": "form-refinement",
        "goal": "Bevel edges and cavity AO refine the flat-colour silhouette.",
        "componentRefs": ["root", "torso", "head", "ear-left", "ear-right", "arm-stub-left", "leg-l", "leg-r"],
        "acceptance": [
            "Bevels keep the mascot friendly, no harsh edges."
        ]
    },
    {
        "id": "material-pass",
        "goal": "Lime body + cream ear materials with gloss from rabbit.png palette.",
        "componentRefs": ["torso", "head", "ear-left", "ear-right"],
        "acceptance": [
            "Surface response reads as glossy brand plastic.",
            "Palette keeps lime #7FFF00 and cream #F3F3DF as authored."
        ]
    },
    {
        "id": "surface-pass",
        "goal": "Cavity AO at ear seats, leg gap, and arm-stub flank.",
        "componentRefs": ["torso", "head", "ear-left", "ear-right", "leg-l", "leg-r", "arm-stub-left"],
        "acceptance": [
            "Junctions show cavity AO, no flat plastic."
        ]
    },
    {
        "id": "lighting-pass",
        "goal": "Front 3/4 key/fill/rim + contact shadow under feet.",
        "componentRefs": ["root", "torso", "head"],
        "acceptance": [
            "Value range preserved, lime and cream colour boundaries crisp.",
            "Contact shadow reads under both feet on the hero surface."
        ]
    },
    {
        "id": "interaction-pass",
        "goal": "Whole-object float/tumble + orbit controls in the hero.",
        "componentRefs": ["root"],
        "acceptance": [
            "Mascot rotates as one unit, pivot at root."
        ]
    },
    {
        "id": "optimization-pass",
        "goal": "Budget-check triangles/draw calls for the landing hero.",
        "componentRefs": ["root", "torso", "head", "ear-left", "ear-right", "arm-stub-left", "leg-l", "leg-r"],
        "acceptance": [
            "Repeated limbs instanced or LOD'd where silhouette allows."
        ]
    }
]

spec["viewEvidence"] = [
    {
        "id": "front-view",
        "view": "front",
        "reference": "rabbit.png full mark",
        "note": "Flat 2D brand mark; deterministic mask-profile geometry, no solvable reference camera."
    },
    {
        "id": "rabbit-mask",
        "view": "front",
        "reference": "analyze_mask.py deterministic mask-profile of rabbit.png",
        "note": "Silhouette ground truth: two ears, rounded head, bellied torso, two separated legs.",
        "confidence": 0.8
    },
    {
        "id": "rabbit-palette",
        "view": "front",
        "reference": "extract_part_color_recipe.py on rabbit.png",
        "note": "Dominant lime rgba(127,255,0), secondary cream rgba(243,243,223), plastic class conf 0.6.",
        "confidence": 0.75
    }
]

pre = spec["preSpecAssessment"]
pre["unknownsToResolveBeforeImplementation"] = []
spec["assumptions"] = spec.get("assumptions", []) + [
    "Ear height/outcurve ratio: right ear tip ~0.45 heads above head top, left ~0.3 heads; verified in the blockout render against rabbit.png.",
]

with open(SPEC, "w", encoding="utf-8") as fh:
    json.dump(spec, fh, ensure_ascii=False, indent=2)

print("final patch applied")
print("passOrder:", sp["passOrder"])