declare module 'expo-three' {
  import * as THREE from 'three';
  
  export function loadAsync(
    assetUri: string | null | undefined
  ): Promise<THREE.Group>;
  
  // Export THREE from expo-three to avoid multiple instances
  export { THREE };
  
  // Re-export other common exports
  export * from 'three';
}
