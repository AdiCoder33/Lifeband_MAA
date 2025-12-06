# PBR Material Setup for Mother & Baby 3D Model

This guide walks you through setting up physically-based rendering (PBR) materials for the `motherandbaby3dmodel.glb` with realistic colors, textures, and exporting an embedded .glb.

## Overview

**Goal:** Create a warm, soft maternal aesthetic:
- **Saree:** Deep warm red (#C8333A) with fabric weave texture
- **Hair:** Near-black (#0d0d0d) with specular shine
- **Mother Skin:** Warm medium Indian tone (#E6B38A)
- **Baby Skin:** Lighter warm tone (#F0C8A3)
- **Baby Hair:** Dark curly texture
- **Base/Pedestal:** Light warm tone (#F6D7B0)

**Deliverables:**
- Blender Python script: `scripts/setup_pbr_textures.py`
- GLB inspection script: `scripts/inspect-glb.js`
- Output: `assets/motherandbaby3dmodel_pbr.glb` (all textures embedded)

---

## Quick Start (3 Steps)

### Step 1: Inspect Your GLB

Before running the Blender script, check what meshes and materials your GLB contains:

```bash
# From project root
node scripts/inspect-glb.js assets/motherandbaby3dmodel.glb
```

**Output will show:**
- Mesh names (e.g., "saree", "hair", "body", etc.)
- Material names
- Whether images are embedded or external

**Example output:**
```
--- MESHES ---
  [0] Mother_Body
  [1] Saree
  [2] Hair
  [3] Baby
  [4] BabyHair
  [5] Pedestal
--- MATERIALS ---
  [0] Material (no properties)
--- TEXTURES & IMAGES ---
Total images: 0
```

### Step 2: Customize Mesh-to-Material Mapping

Edit `scripts/setup_pbr_textures.py` around line 56:

```python
MESH_MATERIAL_MAP = {
    "saree": "saree",           # Match your mesh name to material type
    "Saree": "saree",
    "hair": "hair",
    "Hair": "hair",
    "mother_skin": "mother_skin",
    "skin": "mother_skin",
    "body": "mother_skin",
    # ... adjust based on your mesh names from inspect-glb.js output
}
```

If your model uses different mesh names, add them here so the script knows which material to apply to which mesh.

### Step 3: Run Blender Script

**Requirements:**
- Blender 3.0+ (with Python API)
- Your GLB file at `assets/motherandbaby3dmodel.glb`

**Option A: Command Line**

```bash
blender --python scripts/setup_pbr_textures.py
```

This will:
1. Load the GLB
2. Generate procedural PBR textures (solid colors + normal/roughness maps)
3. Create Principled BSDF materials with the specified colors
4. Assign materials to meshes (based on your mapping)
5. Export to `assets/motherandbaby3dmodel_pbr.glb` with **all textures embedded**

**Option B: Interactive (Blender GUI)**

1. Open Blender
2. Load your GLB file
3. Open the Scripting workspace
4. Open `scripts/setup_pbr_textures.py`
5. Click "Run Script"
6. Monitor the console for progress

**Expected output:**
```
================================================================================
PBR MATERIAL SETUP FOR MOTHER & BABY 3D MODEL
================================================================================

[1/5] Importing GLB model...
      Imported: assets/motherandbaby3dmodel.glb
[2/5] Generating textures...
      Generating saree textures...
      Generating hair textures...
      ...
[3/5] Creating and assigning PBR materials...
      Creating material: saree
      Mother_Body -> mother_skin
      Saree -> saree
      ...
[4/5] Assigning materials to mesh objects...
      ...
[5/5] Exporting GLB with embedded textures...

✓ Export complete!
  Output: assets/motherandbaby3dmodel_pbr.glb
  All textures embedded in GLB.

================================================================================
VERIFICATION CHECKLIST (open in GLB viewer or engine):
================================================================================
☐ Saree appears deep warm red (#C8333A)
☐ Hair appears near-black (#0d0d0d) with subtle shine
☐ Mother skin appears warm medium tone (#E6B38A)
☐ Baby skin appears lighter warm (#F0C8A3)
☐ Baby hair appears dark with texture
☐ Base/pedestal appears light warm (#F6D7B0)
☐ Normal maps show subtle surface detail (not too intense)
☐ No external image references (all embedded)
☐ Model renders correctly in three.js / Babylon.js / Cesium
```

---

## Verification

### 1. Check GLB Inspector

```bash
node scripts/inspect-glb.js assets/motherandbaby3dmodel_pbr.glb
```

**Expected:**
```
--- TEXTURES & IMAGES ---
Total images: 15  (5 materials × 3 textures each)
  [0] EMBEDDED in bufferView X (image/png)
  [1] EMBEDDED in bufferView Y (image/png)
  ...
```

All images should show `EMBEDDED` (no `EXTERNAL URI`).

### 2. Open in GLB Viewer

Use any online GLB viewer:
- [three.js Editor](https://threejs.org/editor/)
- [Babylon.js Sandbox](https://sandbox.babylonjs.com/)
- [Sketchfab](https://sketchfab.com/) (upload & preview)

**Checklist:**
- ✓ Colors match the specified hex codes
- ✓ Textures appear (not pure white or flat)
- ✓ Lighting/reflections render correctly
- ✓ Model loads without warnings

### 3. Test in React Native App

Copy the output GLB to your assets:

```bash
cp assets/motherandbaby3dmodel_pbr.glb assets/motherandbaby3dmodel.glb
```

Or update `src/components/GLModel.tsx` to reference the new file:

```typescript
const modelAsset = require('../../assets/motherandbaby3dmodel_pbr.glb');
```

Then run:

```bash
expo start
# or
npm start
```

Open the Welcome screen and verify the 3D model displays with proper colors and textures.

---

## Customization

### Change Colors

Edit `scripts/setup_pbr_textures.py` around line 36:

```python
COLORS = {
    "saree": (0.784, 0.2, 0.227),      # RGB (0-1). Change to your preferred color
    "hair": (0.051, 0.051, 0.051),
    "mother_skin": (0.902, 0.702, 0.541),
    # ...
}
```

(Use [this converter](https://www.rapidtables.com/convert/color/hex-to-rgb.html) to convert hex to 0-1 RGB)

### Change Roughness / Metallic

```python
ROUGHNESS = {
    "saree": 0.6,        # 0=mirror-like, 1=very rough
    "hair": 0.25,        # Lower = shinier
    # ...
}

METALLIC = {
    "saree": 0.0,        # 0=non-metal, 1=full metal
    "hair": 0.1,         # Subtle metallic sheen for hair
    # ...
}
```

### Use Real Textures (Instead of Procedural)

Instead of generating procedural textures, replace image creation in the script:

```python
# Original (procedural):
bc_img = create_simple_texture(2048, 2048, COLORS[mat_type], f"{mat_type}_basecolor")

# New (load from file):
bc_img = bpy.data.images.load(f"path/to/textures/saree_basecolor.png")
```

Then in Blender, assign the texture images to their respective nodes.

### Adjust Normal Map Strength

In the script, find:

```python
normal_map.inputs['Strength'].default_value = 0.8
```

Change to a lower value (e.g., `0.3`) for subtler normal effects, or higher (e.g., `1.2`) for more prominent detail.

---

## Troubleshooting

### "File not found" error

Ensure the GLB path in the script matches your project structure:

```python
INPUT_GLB = "assets/motherandbaby3dmodel.glb"  # Relative to where script runs
OUTPUT_GLB = "assets/motherandbaby3dmodel_pbr.glb"
```

If running from `scripts/` folder, adjust paths:

```python
INPUT_GLB = "../assets/motherandbaby3dmodel.glb"
OUTPUT_GLB = "../assets/motherandbaby3dmodel_pbr.glb"
```

### Meshes not recognized

Run `inspect-glb.js` to see actual mesh names, then update `MESH_MATERIAL_MAP` in the script to match.

### Textures not showing in app

- Verify the GLB was exported with `embed_images=True` (script does this automatically)
- Use `inspect-glb.js` to confirm images are embedded (not external)
- Check that `GLModel.tsx` references the correct file

### Colors look wrong

- Ensure you're viewing in a renderer that supports sRGB colorspace
- Check that the colorspace setting in Blender is correct:
  - **sRGB** for Base Color images
  - **Non-Color** for Normal, Roughness, Metallic maps

---

## Material Node Setup (Reference)

Each material uses this node tree:

```
Texture (BaseColor) [sRGB] ──┐
                              ├─→ Principled BSDF ──→ Material Output
Texture (Normal) [Non-Color]──→ Normal Map ──┘

Texture (Roughness) [Non-Color] ──┐
                                   └─→ Principled BSDF
```

**Key settings in Principled BSDF:**
- **Base Color:** Connected to BaseColor texture (or solid color)
- **Normal:** Connected through Normal Map node (strength ~0.8)
- **Roughness:** Connected to Roughness texture
- **Metallic:** Set to 0.0 (for skin/fabric) or slight value (for hair shine)

---

## Output Files

After running the script:

- **`assets/motherandbaby3dmodel_pbr.glb`** (main output)
  - Contains all meshes + materials + embedded textures
  - Ready to use in your React Native app
  - File size: ~5-15 MB (depending on texture resolution)

- **`textures_pbr/`** (temporary)
  - Procedural texture images (can be deleted after export)
  - Or replace with high-quality real textures before export

---

## Next Steps

1. **Run the script** as described in "Quick Start"
2. **Inspect the output** using `inspect-glb.js`
3. **Verify in a GLB viewer** (colors, textures, no errors)
4. **Update your app** to use the new GLB file
5. **Test in React Native** and adjust colors/roughness as needed

If you have real texture images (photos or Substance Painter exports), replace the procedural generation in the script with:

```python
bc_img = bpy.data.images.load(f"path/to/real_saree_basecolor.jpg")
```

---

## References

- [Blender glTF Export](https://docs.blender.org/manual/en/latest/addons/io_scene_gltf2/export.html)
- [glTF 2.0 Spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [PBR Texturing Guide](https://learnopengl.com/PBR/Theory)
- [three.js Material Reference](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial)

---

**Questions?** Check the error logs and GLB inspector output for clues!
