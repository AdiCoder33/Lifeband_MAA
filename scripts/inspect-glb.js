#!/usr/bin/env node
/**
 * Inspect GLB contents: lists meshes, materials, and embedded images.
 * Usage: node scripts/inspect-glb.js <path-to-glb>
 * Example: node scripts/inspect-glb.js assets/motherandbaby3dmodel.glb
 */

const fs = require('fs');
const path = require('path');

function inspectGLB(glbPath) {
  if (!fs.existsSync(glbPath)) {
    console.error(`File not found: ${glbPath}`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`GLB Inspector: ${glbPath}`);
  console.log(`${'='.repeat(80)}\n`);

  const buffer = fs.readFileSync(glbPath);
  const view = new DataView(buffer);

  // Parse GLB header
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const version = view.getUint32(4, true);
  const fileSize = view.getUint32(8, true);

  console.log(`Magic: ${magic}`);
  console.log(`Version: ${version}`);
  console.log(`File Size: ${fileSize} bytes`);
  console.log(`File Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`);

  // Parse JSON chunk (first chunk is typically JSON)
  let offset = 12;
  if (offset + 8 > buffer.length) {
    console.log('No chunks found.');
    return;
  }

  const chunkLength = view.getUint32(offset, true);
  const chunkType = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7)
  );

  console.log(`Chunk Type: ${chunkType}`);
  console.log(`Chunk Length: ${chunkLength} bytes\n`);

  if (chunkType === 'JSON') {
    const jsonData = buffer.toString('utf8', offset + 8, offset + 8 + chunkLength);
    let gltf;
    try {
      gltf = JSON.parse(jsonData);
    } catch (e) {
      console.error('Failed to parse JSON chunk:', e.message);
      return;
    }

    // Extract information
    console.log('--- MESHES ---');
    if (gltf.meshes) {
      gltf.meshes.forEach((mesh, idx) => {
        console.log(`  [${idx}] ${mesh.name || '(unnamed)'}`);
        if (mesh.primitives) {
          mesh.primitives.forEach((prim, pidx) => {
            console.log(`       Primitive ${pidx}: material=${prim.material}`);
          });
        }
      });
    }
    console.log();

    console.log('--- MATERIALS ---');
    if (gltf.materials) {
      gltf.materials.forEach((mat, idx) => {
        console.log(`  [${idx}] ${mat.name || '(unnamed)'}`);
        if (mat.pbrMetallicRoughness) {
          const pbr = mat.pbrMetallicRoughness;
          console.log(`       BaseColorFactor: ${JSON.stringify(pbr.baseColorFactor)}`);
          if (pbr.baseColorTexture) {
            console.log(`       BaseColorTexture: index=${pbr.baseColorTexture.index}`);
          }
          if (pbr.metallicRoughnessTexture) {
            console.log(`       MetallicRoughnessTexture: index=${pbr.metallicRoughnessTexture.index}`);
          }
        }
        if (mat.normalTexture) {
          console.log(`       NormalTexture: index=${mat.normalTexture.index}`);
        }
      });
    }
    console.log();

    console.log('--- TEXTURES & IMAGES ---');
    if (gltf.textures) {
      console.log(`Total textures: ${gltf.textures.length}`);
      gltf.textures.forEach((tex, idx) => {
        console.log(`  [${idx}] source=${tex.source}, name=${tex.name || '(unnamed)'}`);
      });
    }
    if (gltf.images) {
      console.log(`Total images: ${gltf.images.length}`);
      gltf.images.forEach((img, idx) => {
        if (img.uri) {
          console.log(`  [${idx}] EXTERNAL URI: ${img.uri}`);
        } else if (img.bufferView !== undefined) {
          console.log(`  [${idx}] EMBEDDED in bufferView ${img.bufferView} (${img.mimeType})`);
        } else {
          console.log(`  [${idx}] Unknown source`);
        }
      });
    }
    console.log();

    console.log('--- NODES ---');
    if (gltf.nodes) {
      console.log(`Total nodes: ${gltf.nodes.length}`);
      gltf.nodes.forEach((node, idx) => {
        console.log(`  [${idx}] ${node.name || '(unnamed)'} mesh=${node.mesh}`);
      });
    }
    console.log();

    console.log('--- ASSET INFO ---');
    if (gltf.asset) {
      console.log(`  Version: ${gltf.asset.version}`);
      console.log(`  Generator: ${gltf.asset.generator || 'unknown'}`);
    }
  }

  console.log(`${'='.repeat(80)}\n`);
}

const glbPath = process.argv[2] || 'assets/motherandbaby3dmodel.glb';
inspectGLB(glbPath);
