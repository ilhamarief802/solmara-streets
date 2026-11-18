// The sea and the harbour. One large plane at sea level with a scrolling water
// texture, a lighter shallow band along the coast so the shore reads as a shelf, and
// an additive glitter layer that rides the swell. Wind drives the scroll speed and
// the palette tints the surface, so the water is gold at sunset and ink at night.

import { CITY } from './cityplan.js';
import { mixHex } from '../core/palettes.js';

const DEEP = 0x0d3560;
const SHALLOW = 0x1f7fa0;

export class Water {
  constructor({ plan, textures, rng }) {
    this.plan = plan;
    this.rng = rng;
    this.time = 0;
    const size = CITY.waterExtent;
    const level = CITY.seaLevel;

    // A private clone of the water map: the fountain and the pond reuse the shared
    // texture at repeat 1, while the sea tiles it across two kilometres.
    const source = textures.water();
    this.map = source.clone();
    this.map.needsUpdate = true;
    this.map.wrapS = THREE.RepeatWrapping;
    this.map.wrapT = THREE.RepeatWrapping;
    this.map.repeat.set(size / 64, size / 64);
    this.map.anisotropy = source.anisotropy;

    this.material = new THREE.MeshStandardMaterial({
      map: this.map,
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.14,
      fog: true,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.material);
    this.mesh.name = 'sea';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = level;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.mesh.receiveShadow = false;

    // Shallow shelf: a second plane just below the surface, visible where the terrain
    // dips, tinted towards the sand of the shore.
    this.shelfMaterial = new THREE.MeshLambertMaterial({ color: 0x3f9fb0, transparent: false, fog: true });
    this.shelf = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.shelfMaterial);
    this.shelf.name = 'sea-shelf';
    this.shelf.rotation.x = -Math.PI / 2;
    this.shelf.position.y = level - 0.9;
    this.shelf.matrixAutoUpdate = false;
    this.shelf.updateMatrix();

    const glintSource = textures.waterGlint();
    this.glintMap = glintSource.clone();
    this.glintMap.needsUpdate = true;
    this.glintMap.wrapS = THREE.RepeatWrapping;
    this.glintMap.wrapT = THREE.RepeatWrapping;
    this.glintMap.repeat.set(size / 220, size / 220);
    this.glintMaterial = new THREE.MeshBasicMaterial({
      map: this.glintMap,
      color: 0xffffff,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.glint = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.glintMaterial);
    this.glint.name = 'sea-glint';
    this.glint.rotation.x = -Math.PI / 2;
    this.glint.position.y = level + 0.12;
    this.glint.matrixAutoUpdate = false;
    this.glint.updateMatrix();
    this.glint.renderOrder = 2;

    this.colour = new THREE.Color();
    this.scroll = { x: 0, y: 0 };
    this.glintScroll = { x: 0, y: 0 };
  }

  /** Add the three planes to the world group. */
  attach(parent) {
    parent.add(this.mesh);
    parent.add(this.shelf);
    parent.add(this.glint);
    return this;
  }

  /**
   * Scrolls the surface, drifts the glitter and tints everything to match the sky.
   * `weather` supplies the wind; `palette` supplies the hour.
   */
  update(dt, state = {}) {
    const weather = state.weather;
    const palette = state.palette ?? {};
    const wind = weather?.wind ?? { x: 3, z: 1 };
    const rate = weather?.rippleRate ?? 1;
    this.time += dt;

    // Long, slow swell plus a wind-driven drift.
    this.scroll.x += (wind.x * 0.0016 + Math.sin(this.time * 0.11) * 0.0006) * dt * rate * 60;
    this.scroll.y += (wind.z * 0.0016 + Math.cos(this.time * 0.09) * 0.0005) * dt * rate * 60;
    this.map.offset.set(this.scroll.x, this.scroll.y);

    this.glintScroll.x += (wind.x * 0.004 + Math.sin(this.time * 0.31) * 0.002) * dt * rate * 60;
    this.glintScroll.y += (wind.z * 0.004 - Math.cos(this.time * 0.27) * 0.0016) * dt * rate * 60;
    this.glintMap.offset.set(this.glintScroll.x, this.glintScroll.y);

    // Surface colour: deep blue by default, warmed by the sun near the horizon.
    const sunLift = Math.min(1, (palette.sunIntensity ?? 1) * 0.35);
    const surface = mixHex(DEEP, palette.skyHorizon ?? 0xcfe3f5, 0.16 + sunLift * 0.2);
    this.material.color.setHex(surface);
    this.shelfMaterial.color.setHex(mixHex(SHALLOW, palette.skyHorizon ?? 0xcfe3f5, 0.1));

    const glintPower = 0.1 + (palette.sunIntensity ?? 1) * 0.24 + (palette.moonIntensity ?? 0) * 0.5;
    this.glintMaterial.opacity = Math.max(0.05, Math.min(0.6, glintPower * (1 - (weather?.cloudiness ?? 0) * 0.5)));
    return this;
  }

  /** Ripple detail for the debug overlay. */
  describe() {
    return `sea level ${CITY.seaLevel} scroll ${this.scroll.x.toFixed(3)}/${this.scroll.y.toFixed(3)}`;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.shelf.geometry.dispose();
    this.glint.geometry.dispose();
    this.material.dispose();
    this.shelfMaterial.dispose();
    this.glintMaterial.dispose();
    this.map.dispose();
    this.glintMap.dispose();
  }
}

export function createWater(options) {
  return new Water(options);
}
