import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createLighting } from './lighting.js';

describe('createLighting', () => {
  it('returns DirectionalLight and AmbientLight instances', () => {
    const lighting = createLighting();
    expect(lighting.dirLight).toBeInstanceOf(THREE.DirectionalLight);
    expect(lighting.ambientLight).toBeInstanceOf(THREE.AmbientLight);
  });

  it('exposes uLightDir / uLightColor / uAmbient uniforms with the right value types', () => {
    const lighting = createLighting();
    expect(lighting.uniforms.uLightDir.value).toBeInstanceOf(THREE.Vector3);
    expect(lighting.uniforms.uLightColor.value).toBeInstanceOf(THREE.Color);
    expect(lighting.uniforms.uAmbient.value).toBeInstanceOf(THREE.Color);
  });

  it('applies defaults: azimuth 135, altitude 30, balance 0.3', () => {
    const lighting = createLighting();
    // balance 0.3 => ambient=0.3, directional=0.7
    expect(lighting.dirLight.intensity).toBeCloseTo(0.7);
    expect(lighting.ambientLight.intensity).toBeCloseTo(0.3);
    expect(lighting.uniforms.uLightColor.value.r).toBeCloseTo(0.7);
    expect(lighting.uniforms.uAmbient.value.r).toBeCloseTo(0.3);

    // direction at az=135, alt=30
    const cosAlt = Math.cos((30 * Math.PI) / 180);
    const sinAlt = Math.sin((30 * Math.PI) / 180);
    const cosAz = Math.cos((135 * Math.PI) / 180);
    const sinAz = Math.sin((135 * Math.PI) / 180);
    const dir = lighting.uniforms.uLightDir.value;
    expect(dir.x).toBeCloseTo(cosAlt * cosAz);
    expect(dir.y).toBeCloseTo(cosAlt * sinAz);
    expect(dir.z).toBeCloseTo(sinAlt);
  });

  it('setBalance updates ambient and directional intensities so they sum to 1', () => {
    const lighting = createLighting();
    lighting.setBalance(0.6);
    expect(lighting.ambientLight.intensity).toBeCloseTo(0.6);
    expect(lighting.dirLight.intensity).toBeCloseTo(0.4);
    expect(lighting.uniforms.uAmbient.value.r).toBeCloseTo(0.6);
    expect(lighting.uniforms.uLightColor.value.r).toBeCloseTo(0.4);
  });

  it('setAltitude(90) places the light overhead (z dominant, x/y near zero)', () => {
    const lighting = createLighting();
    lighting.setAltitude(90);
    const dir = lighting.uniforms.uLightDir.value;
    expect(Math.abs(dir.x)).toBeLessThan(1e-9);
    expect(Math.abs(dir.y)).toBeLessThan(1e-9);
    expect(dir.z).toBeCloseTo(1);
    expect(lighting.dirLight.position.z).toBeGreaterThan(0);
  });

  it('setAltitude(0) places the light on the horizon (z near zero)', () => {
    const lighting = createLighting();
    lighting.setAltitude(0);
    const dir = lighting.uniforms.uLightDir.value;
    expect(dir.z).toBeCloseTo(0);
    // length of horizontal component should be 1
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1);
  });

  it('setAzimuth rotates light around the up axis (length preserved)', () => {
    const lighting = createLighting();
    lighting.setAltitude(30);
    lighting.setAzimuth(0);
    const d0 = lighting.uniforms.uLightDir.value.clone();
    lighting.setAzimuth(90);
    const d90 = lighting.uniforms.uLightDir.value.clone();
    // z unchanged by azimuth
    expect(d90.z).toBeCloseTo(d0.z);
    // horizontal length unchanged
    expect(Math.hypot(d90.x, d90.y)).toBeCloseTo(Math.hypot(d0.x, d0.y));
    // 90 deg rotation: new x ≈ old y rotated, specifically az=0 => +X, az=90 => +Y
    const cosAlt = Math.cos((30 * Math.PI) / 180);
    expect(d0.x).toBeCloseTo(cosAlt);
    expect(d0.y).toBeCloseTo(0);
    expect(d90.x).toBeCloseTo(0);
    expect(d90.y).toBeCloseTo(cosAlt);
  });

  it('setters mutate uniform objects in place (no rebinding)', () => {
    const lighting = createLighting();
    const dirRef = lighting.uniforms.uLightDir;
    const dirValueRef = lighting.uniforms.uLightDir.value;
    const colorRef = lighting.uniforms.uLightColor;
    const ambRef = lighting.uniforms.uAmbient;

    lighting.setAzimuth(45);
    lighting.setAltitude(60);
    lighting.setBalance(0.5);

    expect(lighting.uniforms.uLightDir).toBe(dirRef);
    expect(lighting.uniforms.uLightDir.value).toBe(dirValueRef);
    expect(lighting.uniforms.uLightColor).toBe(colorRef);
    expect(lighting.uniforms.uAmbient).toBe(ambRef);
  });

  it('setters mutate the three.js light objects in place (same instances)', () => {
    const lighting = createLighting();
    const dirLightRef = lighting.dirLight;
    const ambientRef = lighting.ambientLight;

    lighting.setAzimuth(45);
    lighting.setAltitude(60);
    lighting.setBalance(0.5);

    expect(lighting.dirLight).toBe(dirLightRef);
    expect(lighting.ambientLight).toBe(ambientRef);
  });
});
