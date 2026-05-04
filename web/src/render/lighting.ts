import * as THREE from 'three';

export interface LightingUniforms {
  uLightDir: { value: THREE.Vector3 };
  uLightColor: { value: THREE.Color };
  uAmbient: { value: THREE.Color };
}

export interface LightingHandle {
  dirLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  uniforms: LightingUniforms;
  setAzimuth(deg: number): void;
  setAltitude(deg: number): void;
  setBalance(balance: number): void;
}

const DEFAULT_AZIMUTH_DEG = 135;
const DEFAULT_ALTITUDE_DEG = 30;
const DEFAULT_BALANCE = 0.3;
const DIR_LIGHT_DISTANCE = 1000;

export function createLighting(): LightingHandle {
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);

  const uniforms: LightingUniforms = {
    uLightDir: { value: new THREE.Vector3() },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(1, 1, 1) },
  };

  let azimuthDeg = DEFAULT_AZIMUTH_DEG;
  let altitudeDeg = DEFAULT_ALTITUDE_DEG;
  let balance = DEFAULT_BALANCE;

  function recompute(): void {
    const az = (azimuthDeg * Math.PI) / 180;
    const alt = (altitudeDeg * Math.PI) / 180;
    const cosAlt = Math.cos(alt);
    const x = cosAlt * Math.cos(az);
    const y = cosAlt * Math.sin(az);
    const z = Math.sin(alt);

    const ambientI = balance;
    const directI = 1 - balance;

    dirLight.position.set(x * DIR_LIGHT_DISTANCE, y * DIR_LIGHT_DISTANCE, z * DIR_LIGHT_DISTANCE);
    dirLight.intensity = directI;
    ambientLight.intensity = ambientI;

    uniforms.uLightDir.value.set(x, y, z);
    uniforms.uLightColor.value.setRGB(directI, directI, directI);
    uniforms.uAmbient.value.setRGB(ambientI, ambientI, ambientI);
  }

  recompute();

  return {
    dirLight,
    ambientLight,
    uniforms,
    setAzimuth(deg: number): void {
      azimuthDeg = deg;
      recompute();
    },
    setAltitude(deg: number): void {
      altitudeDeg = deg;
      recompute();
    },
    setBalance(b: number): void {
      balance = b;
      recompute();
    },
  };
}
