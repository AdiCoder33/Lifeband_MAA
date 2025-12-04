import React, { useEffect, useMemo, useRef } from 'react';
import { Image, PanResponder, StyleProp, ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
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

	const { GLView, THREE, GLTFLoader, modelAsset } = deps;
	const frameRef = useRef<number | null>(null);
	const rootRef = useRef<THREE.Object3D | null>(null);
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

	useEffect(() => {
		return () => {
			if (frameRef.current) {
				cancelAnimationFrame(frameRef.current);
			}
			rootRef.current = null;
		};
	}, []);

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

		const loader = new GLTFLoader();

		try {
			const modelBuffer = await loadModelArrayBuffer(asset);
			const gltf = await parseGLTFAsync(
				loader,
				modelBuffer,
				asset.localUri ?? asset.uri ?? ''
			);
			const root = gltf.scene;
			rootRef.current = root;

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

			const skinColor = new THREE.Color('#FFC9A9');
			root.traverse(child => {
				if ((child as any).isMesh) {
					const mesh = child as THREE.Mesh;
					const material = mesh.material as any;
					if (material?.map) {
						material.map.encoding = THREE.sRGBEncoding;
					}
					material.toneMapped = true;
					if (Array.isArray(material)) {
						material.forEach(entry => {
							if (entry?.color) {
								entry.color.copy(skinColor);
							}
						});
					} else if (material?.color) {
						material.color.copy(skinColor);
					}
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
	THREE: typeof import('three');
	GLTFLoader: typeof import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader;
	modelAsset: ReturnType<typeof require>;
};

let cachedDeps: GLDependencies | null | undefined;

function getGLDependencies(): GLDependencies | null {
	if (cachedDeps !== undefined) {
		return cachedDeps;
	}

	try {
		const { GLView } = require('expo-gl');
		const THREE = require('three');
		const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');

		const modelAsset = require('../../assets/motherchild3dmodel.glb');

		cachedDeps = { GLView, THREE, GLTFLoader, modelAsset };
		return cachedDeps;
	} catch (error) {
		cachedDeps = null;
		console.warn(
			'[GLModel] expo-gl unavailable – falling back to static artwork. Install a development build (npx expo run:android) to enable the 3D model.',
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
	if (THREE.ColorManagement) {
		THREE.ColorManagement.legacyMode = false;
	}
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.physicallyCorrectLights = true;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	return renderer;
}

async function loadModelArrayBuffer(asset: Asset): Promise<ArrayBuffer> {
	const uri = asset.localUri ?? asset.uri;
	if (!uri) {
		throw new Error('Model asset URI is unavailable.');
	}

	if (uri.startsWith('http://') || uri.startsWith('https://')) {
		const response = await fetch(uri);
		if (!response.ok) {
			throw new Error(`Network response was not ok (${response.status})`);
		}
		return response.arrayBuffer();
	}

	const file = new File(uri);
	return file.arrayBuffer();
}

function parseGLTFAsync(loader: any, data: ArrayBuffer, path: string) {
	return new Promise<any>((resolve, reject) => {
		loader.parse(data, path, resolve as any, reject);
	});
}
