import * as THREE from 'three';
import { createNoiseTexture } from './noise.js';

export interface SandMeshHandle {
  mesh: THREE.Mesh;
  texture: THREE.DataTexture;
  noiseTexture: THREE.DataTexture;
  material: THREE.ShaderMaterial;
  nx: number;
  ny: number;
}

const VERTEX_SHADER = /* glsl */ `
  uniform sampler2D uHeightmap;
  uniform vec2 uTexel;
  uniform vec2 uTableSize;
  uniform float uNoiseScale;

  varying vec2 vWorldXY;
  varying vec3 vNormal;
  varying vec2 vNoiseUv;

  void main() {
    vec2 uv = position.xy / uTableSize;
    float h = texture2D(uHeightmap, uv).r;

    float hL = texture2D(uHeightmap, uv - vec2(uTexel.x, 0.0)).r;
    float hR = texture2D(uHeightmap, uv + vec2(uTexel.x, 0.0)).r;
    float hD = texture2D(uHeightmap, uv - vec2(0.0, uTexel.y)).r;
    float hU = texture2D(uHeightmap, uv + vec2(0.0, uTexel.y)).r;

    float dx = uTableSize.x * uTexel.x;
    float dy = uTableSize.y * uTexel.y;
    vec3 n = normalize(vec3(-(hR - hL) / (2.0 * dx), -(hU - hD) / (2.0 * dy), 1.0));

    vec3 displaced = vec3(position.x, position.y, h);
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldXY = worldPos.xy;
    vNormal = n;
    vNoiseUv = position.xy / uNoiseScale;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uAmbient;
  uniform sampler2D uNoise;

  varying vec2 vWorldXY;
  varying vec3 vNormal;
  varying vec2 vNoiseUv;

  void main() {
    float noise = texture2D(uNoise, vNoiseUv).r;
    vec3 perturbed = normalize(normalize(vNormal) + vec3((noise - 0.5) * 0.1, (noise - 0.5) * 0.1, 0.0));
    float diff = max(dot(perturbed, normalize(uLightDir)), 0.0);
    vec3 lit = diff * uLightColor + uAmbient;
    vec3 base = vec3(0.76, 0.66, 0.48) * mix(0.85, 1.15, noise);
    gl_FragColor = vec4(base * lit, 1.0);
  }
`;

export function createSandMesh(
  nx: number,
  ny: number,
  tableW: number,
  tableH: number,
  noiseTexture?: THREE.DataTexture,
  noiseScaleMm = 5.0,
): SandMeshHandle {
  const geo = new THREE.PlaneGeometry(tableW, tableH, nx - 1, ny - 1);
  geo.translate(tableW / 2, tableH / 2, 0);

  const data = new Float32Array(nx * ny);
  const texture = new THREE.DataTexture(data, nx, ny, THREE.RedFormat, THREE.FloatType);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const noise = noiseTexture ?? createNoiseTexture();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHeightmap: { value: texture },
      uTexel: { value: new THREE.Vector2(1 / nx, 1 / ny) },
      uTableSize: { value: new THREE.Vector2(tableW, tableH) },
      uLightDir: { value: new THREE.Vector3(0, 0, 1) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.2, 0.2, 0.2) },
      uNoise: { value: noise },
      uNoiseScale: { value: noiseScaleMm },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });

  const mesh = new THREE.Mesh(geo, material);

  return { mesh, texture, noiseTexture: noise, material, nx, ny };
}

export function updateSandMesh(handle: SandMeshHandle, heightmap: Float32Array): void {
  const data = handle.texture.image.data as unknown as Float32Array;
  data.set(heightmap);
  handle.texture.needsUpdate = true;
}

export function checkFloatTextureSupport(renderer: THREE.WebGLRenderer): boolean {
  const caps = renderer.capabilities;
  if (!caps || !caps.isWebGL2) {
    console.error('SandSim: WebGL2 is required for R32F float textures; current context is not WebGL2.');
    return false;
  }
  const gl = renderer.getContext();
  if (!gl.getExtension('OES_texture_float_linear')) {
    console.error('SandSim: OES_texture_float_linear extension is not available; float-texture linear filtering will not work.');
    return false;
  }
  return true;
}
