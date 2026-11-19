// The player's body, built from boxes at run time: no model files, no textures. The rig is
// a hip with two legs, a chest with two arms and a head, all pivoting where a real body
// does, so the gait is a handful of sin() calls. He wears the jacket the whole city
// recognises him by: burnt orange canvas, teal beanie, pale trainers.

import { clamp, clamp01 } from '../core/math.js';

const PALETTE = {
  jacket: 0xe2572b,
  sleeve: 0xc4471f,
  collar: 0xf0e6d2,
  trousers: 0x27313f,
  shoe: 0xe9e1d1,
  skin: 0xc58a5a,
  beanie: 0x2f8f8a,
  visor: 0x171b20,
  zip: 0xd9d2c2,
  pack: 0x3a4a55,
};

const HIP_HEIGHT = 0.94;

// One material per colour, shared by every box that wears it: the rig costs a few draws,
// not one material per limb.
const materials = new Map();

/**
 * A lit material with a whisper of self-illumination. The city has no shadow maps and
 * almost no point lights, so at dusk a plain Lambert jersey turns into a silhouette; a few
 * percent of the base colour keeps the hero readable without glowing at noon.
 */
function material(hex) {
  let mat = materials.get(hex);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({
      color: hex,
      emissive: new THREE.Color(hex).multiplyScalar(0.45),
    });
    materials.set(hex, mat);
  }
  return mat;
}

function box(width, height, depth, hex, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(hex));
  mesh.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  if (options.rotX) mesh.rotation.x = options.rotX;
  if (options.rotY) mesh.rotation.y = options.rotY;
  // The parts are posed by their parent groups only, so their own matrix is static.
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function group(x, y, z) {
  const node = new THREE.Group();
  node.position.set(x, y, z);
  return node;
}

/** One limb: a pivot at the joint with a box hanging below it, and an optional foot. */
function limb(width, length, depth, hex, options = {}) {
  const pivot = new THREE.Group();
  const segment = box(width, length, depth, hex, { y: -length / 2 });
  pivot.add(segment);
  if (options.extremity) {
    // The foot/shoe sits just past the end of the limb and forward of its centre.
    pivot.add(box(width * 1.05, 0.12, depth * 1.5, options.extremity, { y: -length - 0.03, z: depth * 0.34 }));
  }
  return { pivot, segment };
}

/**
 * Builds the character and returns the root plus the animation handle.
 * @param {object} options { jacket, sleeve, beanie, scale }
 */
export function createCharacter(options = {}) {
  const root = new THREE.Group();
  root.name = 'player';
  const rig = new THREE.Group();
  root.add(rig);

  const jacket = options.jacket ?? PALETTE.jacket;
  const sleeve = options.sleeve ?? PALETTE.sleeve;
  const beanie = options.beanie ?? PALETTE.beanie;

  const hips = group(0, HIP_HEIGHT, 0);
  rig.add(hips);

  // Torso: a jacket block with a lighter collar and a zip line, so he reads at distance.
  const chest = group(0, 0, 0);
  hips.add(chest);
  chest.add(box(0.5, 0.56, 0.29, jacket, { y: 0.29 }));
  chest.add(box(0.52, 0.07, 0.31, sleeve, { y: 0.06 }));
  chest.add(box(0.2, 0.1, 0.3, PALETTE.collar, { y: 0.55 }));
  chest.add(box(0.035, 0.5, 0.012, PALETTE.zip, { y: 0.3, z: 0.148 }));
  // A small pack over one shoulder: the silhouette from the third-person camera.
  chest.add(box(0.3, 0.34, 0.14, PALETTE.pack, { y: 0.32, z: -0.21 }));

  // Head and beanie.
  const neck = group(0, 0.56, 0);
  chest.add(neck);
  neck.add(box(0.12, 0.08, 0.12, PALETTE.skin, { y: 0.02 }));
  const head = group(0, 0.1, 0);
  neck.add(head);
  head.add(box(0.27, 0.27, 0.25, PALETTE.skin, { y: 0.13 }));
  head.add(box(0.29, 0.12, 0.27, beanie, { y: 0.3 }));
  // The turned-up brim, then the visor of the beanie and a small nose.
  head.add(box(0.31, 0.05, 0.29, beanie, { y: 0.235 }));
  head.add(box(0.22, 0.06, 0.02, PALETTE.visor, { y: 0.15, z: 0.128 }));
  head.add(box(0.06, 0.08, 0.05, PALETTE.skin, { y: 0.09, z: 0.15 }));

  // Arms: pivot at the shoulder, a slight outward cant.
  const leftArm = limb(0.15, 0.58, 0.17, sleeve, { extremity: PALETTE.skin });
  const rightArm = limb(0.15, 0.58, 0.17, sleeve, { extremity: PALETTE.skin });
  leftArm.pivot.position.set(-0.33, 0.5, 0);
  rightArm.pivot.position.set(0.33, 0.5, 0);
  chest.add(leftArm.pivot, rightArm.pivot);

  // Legs: pivot at the hip, trousers and pale trainers.
  const leftLeg = limb(0.19, 0.86, 0.21, PALETTE.trousers, { extremity: PALETTE.shoe });
  const rightLeg = limb(0.19, 0.86, 0.21, PALETTE.trousers, { extremity: PALETTE.shoe });
  leftLeg.pivot.position.set(-0.12, 0, 0);
  rightLeg.pivot.position.set(0.12, 0, 0);
  hips.add(leftLeg.pivot, rightLeg.pivot);

  // A soft contact shadow: no shadow maps in this build, so the character carries one.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 16),
    new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  if (options.scale) root.scale.setScalar(options.scale);

  // `phase` drives the gait; it only advances with distance walked, so a stop freezes the
  // legs mid-stride rather than snapping them back to rest.
  let phase = 0;
  let idleClock = 0;
  let breath = 0;

  /** Poses the limbs from the speed the body actually moved at. */
  function animate(dt, state = {}) {
    const speed = state.speed ?? 0;
    idleClock += dt;
    breath += dt * 1.7;

    if (state.grounded === false) {
      // Airborne: legs tucked, arms up, a small forward lean.
      leftLeg.pivot.rotation.x = 0.5;
      rightLeg.pivot.rotation.x = -0.3;
      leftArm.pivot.rotation.x = -0.7;
      rightArm.pivot.rotation.x = -0.7;
      leftArm.pivot.rotation.z = 0.5;
      rightArm.pivot.rotation.z = -0.5;
      rig.rotation.x = 0.12;
      chest.scale.y = 1;
      shadow.visible = false;
      return;
    }

    shadow.visible = true;
    const movement = clamp01(speed / 6.5);
    phase += speed * dt * 2.35;
    const swing = Math.sin(phase);
    const stride = clamp(speed / 7.4, 0, 1);

    // Arms swing opposite the legs; both grow with the stride.
    leftLeg.pivot.rotation.x = swing * (0.38 + stride * 0.55);
    rightLeg.pivot.rotation.x = -swing * (0.38 + stride * 0.55);
    leftArm.pivot.rotation.x = -swing * (0.3 + stride * 0.42);
    rightArm.pivot.rotation.x = swing * (0.3 + stride * 0.42);
    leftArm.pivot.rotation.z = 0.08 + stride * 0.06;
    rightArm.pivot.rotation.z = -0.08 - stride * 0.06;

    // The hips rise on each footfall; the rig leans into the run and rolls with the stride.
    hips.position.y = HIP_HEIGHT + Math.abs(swing) * (0.015 + stride * 0.045) * movement;
    rig.rotation.x = 0.05 * movement + stride * 0.09;
    rig.rotation.z = swing * 0.012 * movement;
    chest.rotation.y = swing * 0.06 * movement;

    if (speed < 0.2) {
      // Idle breathing: a slow swell of the chest, hands loose.
      chest.scale.set(1 + Math.sin(breath) * 0.012, 1 + Math.sin(breath) * 0.02, 1);
      const sway = Math.sin(idleClock * 0.6) * 0.03;
      leftArm.pivot.rotation.x += sway;
      rightArm.pivot.rotation.x -= sway;
      leftLeg.pivot.rotation.x *= 0.6;
      rightLeg.pivot.rotation.x *= 0.6;
    } else {
      chest.scale.set(1, 1, 1);
    }
  }

  /** Puts the body in a neutral standing pose, for a shot that poses it directly. */
  function rest() {
    phase = 0;
    leftLeg.pivot.rotation.x = 0;
    rightLeg.pivot.rotation.x = 0;
    leftArm.pivot.rotation.x = 0;
    rightArm.pivot.rotation.x = 0;
    leftArm.pivot.rotation.z = 0.08;
    rightArm.pivot.rotation.z = -0.08;
    hips.position.y = HIP_HEIGHT;
    rig.rotation.x = 0;
    rig.rotation.z = 0;
    chest.rotation.y = 0;
    chest.scale.set(1, 1, 1);
    shadow.visible = true;
  }

  rest();

  return {
    root,
    rig,
    parts: { hips, chest, neck, head, leftArm, rightArm, leftLeg, rightLeg, shadow },
    animate,
    rest,
    setVisible(visible) {
      root.visible = visible;
    },
    get phase() {
      return phase;
    },
  };
}
