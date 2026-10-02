// Dev page (pose.html): the hero alone on a plain background in one pose, for checking poses by
// eye. window.__pose.show(name, { mirror, yaw, pitch, orient }) then screenshot.
import * as THREE from 'three';
import { loadHeroAssets, buildHeroModel } from '../hero/model.js';
import { createBodyRig } from '../hero/bodyRig.js';
import { POSES, MIRRORED } from '../hero/poses.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e2cf);
scene.add(new THREE.HemisphereLight(0xffffff, 0x998877, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 4, 3);
scene.add(sun);
const grid = new THREE.GridHelper(4, 8, 0x8a8170, 0xb9b09a);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);

const assets = await loadHeroAssets('./assets/');
const hero = buildHeroModel(assets);
scene.add(hero.root);
hero.root.position.set(0, 0.95, 0);
const rig = createBodyRig(hero.model);

window.__pose = {
  names: Object.keys(POSES),
  joints: rig.restJoints,
  show(name, { mirror = false, yaw = 0, pitch = 0.1, orient = null, dist = 3.6 } = {}) {
    hero.orient.quaternion.identity();
    if (orient) hero.orient.quaternion.setFromEuler(new THREE.Euler(orient[0], orient[1], orient[2]));
    hero.root.updateMatrixWorld(true);
    if (name === 'rest') rig.resetToRest();
    else {
      const p = (mirror ? MIRRORED : POSES)[name];
      hero.orient.position.y = -p[43];
      hero.root.updateMatrixWorld(true);
      rig.apply(p);
    }
    const c = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    camera.position.copy(c).add(new THREE.Vector3(0, 0.95, 0));
    camera.lookAt(0, 0.95, 0);
    renderer.render(scene, camera);
    return true;
  },
};
window.__poseReady = true;
