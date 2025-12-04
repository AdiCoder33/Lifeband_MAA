import React, { useEffect, useRef } from 'react';
import { Image, StyleProp, ViewStyle } from 'react-native';
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

	const { GLView, Renderer, THREE, GLTFLoader, modelAsset } = deps;
	const frameRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (frameRef.current) {
				cancelAnimationFrame(frameRef.current);
			}
		};
	}, []);

	const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
		const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;

		const renderer = new Renderer({ gl, antialias: true });
		renderer.setSize(width, height);
		renderer.setClearColor(0x000000, 0);

		const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
		camera.position.set(0, 0.2, 2.4);

		const scene = new THREE.Scene();
		scene.background = null;

		const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
		scene.add(hemi);
		const key = new THREE.DirectionalLight(0xfff4e6, 0.7);
		key.position.set(3, 4, 5);
		scene.add(key);
		const rim = new THREE.DirectionalLight(0x7aa2ff, 0.4);
		rim.position.set(-4, -2, -3);
		scene.add(rim);

		const asset = Asset.fromModule(modelAsset);
		await asset.downloadAsync();

		const loader = new GLTFLoader();

		let root: THREE.Object3D | null = null;
		try {
			const gltf = await loader.loadAsync(asset.localUri ?? asset.uri);
			root = gltf.scene;

			const box = new THREE.Box3().setFromObject(root);
			const size = new THREE.Vector3();
			box.getSize(size);
			const maxDim = Math.max(size.x, size.y, size.z) || 1;
			const target = 1.6;
			const scale = target / maxDim;
			root.scale.setScalar(scale);

			const center = new THREE.Vector3();
			box.getCenter(center);
			root.position.sub(center.multiplyScalar(scale));
			root.position.y -= 0.1;

			scene.add(root);
		} catch (error) {
			console.error('Failed to load 3D model', error);
		}

		const renderLoop = () => {
			if (root && autoRotate) {
				root.rotation.y += 0.6 * (1 / 60);
			}

			renderer.render(scene, camera);
			gl.endFrameEXP();
			frameRef.current = requestAnimationFrame(renderLoop);
		};

		renderLoop();
	};

	return <GLView style={style} onContextCreate={onContextCreate} />;
};

export default GLModel;

type GLDependencies = {
	GLView: typeof import('expo-gl').GLView;
	Renderer: typeof import('expo-three').Renderer;
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
		const { Renderer } = require('expo-three');
		const THREE = require('three');
		const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');

		const modelAsset = require('../../assets/model.glb');

		cachedDeps = { GLView, Renderer, THREE, GLTFLoader, modelAsset };
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
