#!/usr/bin/env python3
"""
Blender Python Script: Setup PBR Materials & Export GLB with Embedded Textures
Purpose: Load mother_baby.glb, apply PBR materials with accurate colors, generate/assign textures, export embedded.glb

Requirements:
- Run in Blender: blender --python setup_pbr_textures.py
- Or paste into Blender's Python console after opening the .blend file

Material Setup:
- saree: red (#C8333A), fabric normal, roughness 0.6
- hair: black (#0d0d0d), specular shine, roughness 0.25
- mother_skin: warm tone (#E6B38A), skin normal, roughness 0.45
- baby_skin: lighter warm (#F0C8A3), smooth, roughness 0.35
- baby_hair: dark curly, roughness 0.5
- base/pedestal: warm light tone, roughness 0.7

Textures generated as procedurals or simple color images (you can replace with real textures).
All textures embedded in final .glb.
"""

import bpy
import numpy as np
from pathlib import Path
import os

# ============================================================================
# CONFIGURATION
# ============================================================================

# Path to input GLB (relative to script or absolute)
INPUT_GLB = "assets/motherandbaby3dmodel.glb"
# Path where output GLB will be saved
OUTPUT_GLB = "assets/motherandbaby3dmodel_pbr.glb"
# Texture directory (will be created if needed)
TEXTURE_DIR = "textures_pbr"

# Material color definitions (hex to RGB)
COLORS = {
    "saree": (0.784, 0.2, 0.227),  # #C8333A
    "hair": (0.051, 0.051, 0.051),  # #0d0d0d
    "mother_skin": (0.902, 0.702, 0.541),  # #E6B38A
    "baby_skin": (0.941, 0.784, 0.639),  # #F0C8A3
    "baby_hair": (0.1, 0.1, 0.1),  # dark
    "base": (0.965, 0.843, 0.690),  # #F6D7B0
}

ROUGHNESS = {
    "saree": 0.6,
    "hair": 0.25,
    "mother_skin": 0.45,
    "baby_skin": 0.35,
    "baby_hair": 0.5,
    "base": 0.7,
}

METALLIC = {
    "saree": 0.0,
    "hair": 0.1,
    "mother_skin": 0.0,
    "baby_skin": 0.0,
    "baby_hair": 0.05,
    "base": 0.0,
}

# Mesh names to material mapping (customize based on your model's mesh names)
MESH_MATERIAL_MAP = {
    "saree": "saree",
    "Saree": "saree",
    "cloth": "saree",
    "Cloth": "saree",
    "garment": "saree",
    
    "hair": "hair",
    "Hair": "hair",
    "head_hair": "hair",
    "mother_hair": "hair",
    
    "mother_skin": "mother_skin",
    "Mother_Skin": "mother_skin",
    "skin": "mother_skin",
    "Skin": "mother_skin",
    "body": "mother_skin",
    "face": "mother_skin",
    
    "baby_skin": "baby_skin",
    "Baby_Skin": "baby_skin",
    "baby_body": "baby_skin",
    
    "baby_hair": "baby_hair",
    "Baby_Hair": "baby_hair",
    "baby_head": "baby_hair",
    
    "base": "base",
    "Base": "base",
    "pedestal": "base",
    "Pedestal": "base",
    "stand": "base",
}

# ============================================================================
# TEXTURE GENERATION (Procedural placeholders)
# ============================================================================

def create_simple_texture(width, height, color_rgb, name):
    """Create a simple solid-color image texture in Blender."""
    img = bpy.data.images.new(name=name, width=width, height=height)
    # Fill with color
    pixels = np.ones((height, width, 4), dtype=np.float32)
    pixels[:, :, 0] = color_rgb[0]
    pixels[:, :, 1] = color_rgb[1]
    pixels[:, :, 2] = color_rgb[2]
    pixels[:, :, 3] = 1.0
    img.pixels[:] = pixels.flatten()
    return img


def create_normal_map(width, height, name, strength=0.5):
    """Create a simple normal map (mostly blue = up, slight variation)."""
    img = bpy.data.images.new(name=name, width=width, height=height)
    pixels = np.ones((height, width, 4), dtype=np.float32)
    # Normal maps in OpenGL: R=X, G=Y, B=Z. Blue = (0,0,1) is neutral "no tilt"
    pixels[:, :, 0] = 0.5 + np.random.randn(height, width) * 0.05 * strength
    pixels[:, :, 1] = 0.5 + np.random.randn(height, width) * 0.05 * strength
    pixels[:, :, 2] = 1.0
    pixels[:, :, 3] = 1.0
    img.pixels[:] = pixels.flatten()
    return img


def create_roughness_texture(width, height, name, base_roughness=0.5, variation=0.1):
    """Create roughness texture (grayscale, varies slightly for realism)."""
    img = bpy.data.images.new(name=name, width=width, height=height)
    pixels = np.ones((height, width, 4), dtype=np.float32)
    roughness_val = base_roughness + np.random.randn(height, width) * variation
    roughness_val = np.clip(roughness_val, 0.0, 1.0)
    pixels[:, :, 0] = roughness_val
    pixels[:, :, 1] = roughness_val
    pixels[:, :, 2] = roughness_val
    pixels[:, :, 3] = 1.0
    img.pixels[:] = pixels.flatten()
    return img


# ============================================================================
# MATERIAL CREATION
# ============================================================================

def create_pbr_material(material_name, base_color, roughness, metallic, textures_dict):
    """
    Create a Principled BSDF material with PBR textures.
    
    Args:
        material_name: Name of material
        base_color: RGB tuple (0-1)
        roughness: float 0-1
        metallic: float 0-1
        textures_dict: {"basecolor": Image, "normal": Image, "roughness": Image}
    
    Returns:
        bpy.types.Material
    """
    mat = bpy.data.materials.new(name=material_name)
    mat.use_nodes = True
    mat.blend_method = 'BLEND'
    
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Clear default nodes
    nodes.clear()
    
    # Create node tree: Principled BSDF -> Material Output
    principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    output = nodes.new(type='ShaderNodeOutputMaterial')
    
    # Connect Principled to Output
    links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    
    # Set base color
    principled.inputs['Base Color'].default_value = (*base_color, 1.0)
    
    # Set roughness & metallic
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metallic
    
    # Connect textures if provided
    if textures_dict.get('basecolor'):
        img_node_bc = nodes.new(type='ShaderNodeTexImage')
        img_node_bc.image = textures_dict['basecolor']
        img_node_bc.image.colorspace_settings.name = 'sRGB'
        links.new(img_node_bc.outputs['Color'], principled.inputs['Base Color'])
    
    if textures_dict.get('normal'):
        img_node_n = nodes.new(type='ShaderNodeTexImage')
        img_node_n.image = textures_dict['normal']
        img_node_n.image.colorspace_settings.name = 'Non-Color'
        
        normal_map = nodes.new(type='ShaderNodeNormalMap')
        normal_map.inputs['Strength'].default_value = 0.8
        links.new(img_node_n.outputs['Color'], normal_map.inputs['Color'])
        links.new(normal_map.outputs['Normal'], principled.inputs['Normal'])
    
    if textures_dict.get('roughness'):
        img_node_r = nodes.new(type='ShaderNodeTexImage')
        img_node_r.image = textures_dict['roughness']
        img_node_r.image.colorspace_settings.name = 'Non-Color'
        links.new(img_node_r.outputs['Color'], principled.inputs['Roughness'])
    
    return mat


# ============================================================================
# MAIN WORKFLOW
# ============================================================================

def main():
    print("\n" + "="*80)
    print("PBR MATERIAL SETUP FOR MOTHER & BABY 3D MODEL")
    print("="*80 + "\n")
    
    # Step 1: Clear existing scene and import GLB
    print("[1/5] Importing GLB model...")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    
    if not os.path.exists(INPUT_GLB):
        print(f"ERROR: Input file not found: {INPUT_GLB}")
        return
    
    bpy.ops.import_scene.gltf(filepath=INPUT_GLB, import_materials=False)
    print(f"      Imported: {INPUT_GLB}")
    
    # Step 2: Create texture directory
    print("\n[2/5] Generating textures...")
    os.makedirs(TEXTURE_DIR, exist_ok=True)
    
    # Generate textures for each material type
    textures = {}
    for mat_type in COLORS.keys():
        print(f"      Generating {mat_type} textures...")
        
        # Base color texture (solid color for now; you can replace with real image)
        bc_img = create_simple_texture(2048, 2048, COLORS[mat_type], f"{mat_type}_basecolor")
        textures[f"{mat_type}_basecolor"] = bc_img
        
        # Normal map
        n_img = create_normal_map(2048, 2048, f"{mat_type}_normal", strength=0.3)
        textures[f"{mat_type}_normal"] = n_img
        
        # Roughness map
        r_img = create_roughness_texture(2048, 2048, f"{mat_type}_roughness", ROUGHNESS[mat_type], variation=0.1)
        textures[f"{mat_type}_roughness"] = r_img
    
    # Step 3: Create PBR materials and assign to meshes
    print("\n[3/5] Creating and assigning PBR materials...")
    
    materials = {}
    for mat_type in COLORS.keys():
        print(f"      Creating material: {mat_type}")
        texture_dict = {
            "basecolor": textures[f"{mat_type}_basecolor"],
            "normal": textures[f"{mat_type}_normal"],
            "roughness": textures[f"{mat_type}_roughness"],
        }
        
        mat = create_pbr_material(
            mat_type,
            COLORS[mat_type],
            ROUGHNESS[mat_type],
            METALLIC[mat_type],
            texture_dict
        )
        materials[mat_type] = mat
    
    # Assign materials to meshes
    print("\n[4/5] Assigning materials to mesh objects...")
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        
        # Find matching material type based on mesh name
        mat_type = None
        for mesh_name, mtype in MESH_MATERIAL_MAP.items():
            if mesh_name.lower() in obj.name.lower():
                mat_type = mtype
                print(f"      {obj.name} -> {mat_type}")
                break
        
        if mat_type and mat_type in materials:
            # Remove existing materials
            obj.data.materials.clear()
            # Add new PBR material
            obj.data.materials.append(materials[mat_type])
    
    # Step 4: Export as GLB with embedded textures
    print("\n[5/5] Exporting GLB with embedded textures...")
    
    # Select all objects for export
    bpy.ops.object.select_all(action='SELECT')
    
    # Export with embedded images
    export_path = os.path.abspath(OUTPUT_GLB)
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        export_image_format='AUTO',
        export_keep_originals=False,
        export_materials=True,
        export_draco_mesh_compression_level=0,
        use_visible=True,
        use_renderable=True,
    )
    
    print(f"\n✓ Export complete!")
    print(f"  Output: {export_path}")
    print(f"  All textures embedded in GLB.\n")
    
    # Step 5: Verification checklist
    print("="*80)
    print("VERIFICATION CHECKLIST (open in GLB viewer or engine):")
    print("="*80)
    print("☐ Saree appears deep warm red (#C8333A)")
    print("☐ Hair appears near-black (#0d0d0d) with subtle shine")
    print("☐ Mother skin appears warm medium tone (#E6B38A)")
    print("☐ Baby skin appears lighter warm (#F0C8A3)")
    print("☐ Baby hair appears dark with texture")
    print("☐ Base/pedestal appears light warm (#F6D7B0)")
    print("☐ Normal maps show subtle surface detail (not too intense)")
    print("☐ No external image references (all embedded)")
    print("☐ Model renders correctly in three.js / Babylon.js / Cesium\n")
    
    return export_path


if __name__ == "__main__":
    try:
        result = main()
        print("SUCCESS: PBR setup complete.")
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
