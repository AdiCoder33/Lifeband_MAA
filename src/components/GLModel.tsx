import React, { useEffect, useMemo, useRef } from 'react';
import { Image, PanResponder, StyleProp, ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';
import type { ExpoWebGLRenderingContext } from 'expo-gl';

type Props = {
	style?: StyleProp<ViewStyle>;
	autoRotate?: boolean;
};

const GLModel: React.FC<Props> = ({ style, autoRotate = true }) => {
	const deps = getGLDependencies();

	if (!deps) {
		return (
			<Image
				source={require('../../assets/welcome-illustration.jpg')}
				style={style as any}
				resizeMode="contain"
				accessibilityIgnoresInvertColors
			/>
		);
	}

	const { GLView, THREE, loadAsync, modelAsset } = deps;
	const frameRef = useRef<number | null>(null);
	const rootRef = useRef<any>(null);
	const interactionRef = useRef({
		isInteracting: false,
		baseRotationX: 0,
		baseRotationY: 0,
	});

	const rotationFactor = 0.005;
	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

	const panResponder = useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onPanResponderGrant: () => {
					const root = rootRef.current;
					if (!root) {
						return;
					}
					interactionRef.current.isInteracting = true;
					interactionRef.current.baseRotationX = root.rotation.x;
					interactionRef.current.baseRotationY = root.rotation.y;
				},
				onPanResponderMove: (_, gestureState) => {
					const root = rootRef.current;
					if (!root) {
						return;
					}
					const nextY = interactionRef.current.baseRotationY + gestureState.dx * rotationFactor;
					const nextX = interactionRef.current.baseRotationX - gestureState.dy * rotationFactor;
					root.rotation.y = nextY;
					root.rotation.x = clamp(nextX, -Math.PI / 4, Math.PI / 4);
				},
				onPanResponderRelease: () => {
					const root = rootRef.current;
					interactionRef.current.isInteracting = false;
					if (root) {
						interactionRef.current.baseRotationX = root.rotation.x;
						interactionRef.current.baseRotationY = root.rotation.y;
					}
				},
				onPanResponderTerminate: () => {
					interactionRef.current.isInteracting = false;
				},
			}),
		[]
	);

	const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
		const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;

		const renderer = createRenderer(gl, THREE);
		renderer.setSize(width, height);
		renderer.setClearColor(0x000000, 0);

		const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
		camera.position.set(0, 0.25, 2.0);

		const scene = new THREE.Scene();
		scene.background = null;

		const ambient = new THREE.AmbientLight(0xffffff, 0.7);
		scene.add(ambient);
		const hemi = new THREE.HemisphereLight(0xffffff, 0xb0c4ff, 0.4);
		scene.add(hemi);
		const key = new THREE.DirectionalLight(0xffffff, 0.85);
		key.position.set(3, 4, 5);
		scene.add(key);
		const rim = new THREE.DirectionalLight(0xffffff, 0.35);
		rim.position.set(-4, -2, -3);
		scene.add(rim);

		const asset = Asset.fromModule(modelAsset);
		await asset.downloadAsync();

		try {
			// Suppress console errors during texture loading
			const originalError = console.error;
			console.error = (...args: any[]) => {
				// Filter out texture loading errors
				const msg = args.join(' ');
				if (msg.includes('GLTFLoader') || msg.includes('Couldn\'t load texture') || msg.includes('ArrayBuffer')) {
					return; // Suppress
				}
				originalError(...args);
			};

			let root: any;
			try {
				console.log('[GLModel] Loading model with ExpoTHREE.loadAsync...');
				
				// Load the model - textures will fail but geometry will load
				const loaded = await loadAsync(modelAsset);
				
				// If it's a GLTF result, extract the scene
				root = loaded.scene || loaded;
				
				// IMMEDIATELY remove all textures
				root.traverse((child: any) => {
					if (child.isMesh && child.material) {
						const materials = Array.isArray(child.material) ? child.material : [child.material];
						materials.forEach((mat: any) => {
							if (mat) {
								// Dispose and remove all texture references
								['map', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap', 'bumpMap', 'alphaMap'].forEach(prop => {
									if (mat[prop]) {
										try { mat[prop].dispose(); } catch (e) {}
										mat[prop] = null;
									}
								});
							}
						});
					}
				});
				
				console.log('[GLModel] Model loaded, textures removed');
				rootRef.current = root;
			} finally {
				// Restore console.error
				console.error = originalError;
			}

			if (!root) {
				throw new Error('Failed to extract model from loaded asset');
			}

			const box = new THREE.Box3().setFromObject(root);
			const size = new THREE.Vector3();
			box.getSize(size);
			const maxDim = Math.max(size.x, size.y, size.z) || 1;
			const target = 1.2;
			const scale = target / maxDim;
			root.scale.setScalar(scale);

			const center = new THREE.Vector3();
			box.getCenter(center);
			root.position.sub(center.multiplyScalar(scale));
			root.position.y -= 0.08;

			// Apply heuristic colors (no textures - they cause issues in RN)
			root.traverse((child: any) => {
				if (child.isMesh) {
					const mesh: any = child;
					const material: any = mesh.material;

					const applyToMaterial = (mat: any) => {
						if (!mat) return;
						
						// Remove all textures to avoid ArrayBuffer/Blob errors
						const textureProps = ['map', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap', 'bumpMap', 'alphaMap'];
						textureProps.forEach((prop) => {
							if (mat[prop]) {
								mat[prop] = null;
							}
						});

						// Heuristic coloring based on mesh name
						const name = (mesh.name || '').toLowerCase();
						let chosen: string | null = null;
						if (name.includes('hair') || name.includes('head')) chosen = '#0b0b0b';
						else if (name.includes('cloth') || name.includes('robe') || name.includes('dress') || name.includes('shirt') || name.includes('saree')) chosen = '#D8342A';
						else if (name.includes('skin') || name.includes('body') || name.includes('face') || name.includes('baby')) chosen = '#FFC9A9';
						else if (name.includes('base') || name.includes('pedestal') || name.includes('stand')) chosen = '#F6D7B0';

						if (!chosen && mat?.color) {
							try { chosen = mat.color?.getHexString ? `#${mat.color.getHexString()}` : '#FFC9A9'; } catch { chosen = '#FFC9A9'; }
						}

						if (chosen && mat?.color) {
							try { mat.color.set(chosen); } catch {}
						}

						if (typeof mat.roughness !== 'undefined') mat.roughness = 0.6;
						if (typeof mat.metalness !== 'undefined') mat.metalness = 0.0;
						mat.toneMapped = true;
						mat.needsUpdate = true;
					};

					if (Array.isArray(material)) material.forEach((m: any) => applyToMaterial(m));
					else applyToMaterial(material);
				}
			});

			scene.add(root);
			interactionRef.current.baseRotationX = root.rotation.x;
			interactionRef.current.baseRotationY = root.rotation.y;
		} catch (error) {
			rootRef.current = null;
			console.error('Failed to load 3D model', error);
		}

		const renderLoop = () => {
			const root = rootRef.current;
			if (root && autoRotate && !interactionRef.current.isInteracting) {
				root.rotation.y += 0.6 * (1 / 60);
				interactionRef.current.baseRotationY = root.rotation.y;
			}

			renderer.render(scene, camera);
			gl.endFrameEXP();
			frameRef.current = requestAnimationFrame(renderLoop);
		};

		renderLoop();
	};

	return <GLView style={style} onContextCreate={onContextCreate} {...panResponder.panHandlers} />;
};

export default GLModel;

type GLDependencies = {
	GLView: typeof import('expo-gl').GLView;
	THREE: any;
	loadAsync: any;
	modelAsset: ReturnType<typeof require>;
};

let cachedDeps: GLDependencies | null | undefined;

function getGLDependencies(): GLDependencies | null {
	if (cachedDeps !== undefined) {
		return cachedDeps;
	}

	try {
		const { GLView } = require('expo-gl');
		const ExpoTHREE = require('expo-three');
		
		// Use THREE from three.js directly (expo-three works with it)
		const THREE = require('three');

		// Use the provided model filename. Make sure you add the GLB to `assets/`.
		const modelAsset = require('../../assets/motherbaby.glb');

		cachedDeps = { GLView, THREE, loadAsync: ExpoTHREE.loadAsync, modelAsset };
		return cachedDeps;
	} catch (error) {
		cachedDeps = null;
		console.warn(
			'[GLModel] expo-gl/expo-three unavailable – falling back to static artwork. Install a development build (npx expo run:android) to enable the 3D model.',
			error
		);
		return null;
	}
}

function createRenderer(gl: ExpoWebGLRenderingContext, THREE: typeof import('three')) {
	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		context: gl,
		canvas: {
			width: gl.drawingBufferWidth,
			height: gl.drawingBufferHeight,
			style: {},
			addEventListener: () => {},
			removeEventListener: () => {},
			clientHeight: gl.drawingBufferHeight,
		} as any,
	});

	renderer.setPixelRatio(1);
	// Modern three.js (r0.166+) handles color space automatically
	// No need to set outputEncoding or ColorManagement.legacyMode
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	return renderer;
}
