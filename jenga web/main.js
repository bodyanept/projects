import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js?deps=three@0.160.0';
import * as CANNON from 'https://esm.sh/cannon-es@0.20.0';

// Canvas and renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Scene and camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(6, 7, 10);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);
// Use RMB to rotate, disable pan to keep LMB free for dragging blocks
controls.enablePan = false;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,    // disabled via enablePan = false
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
resize();

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.8);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(10, 15, 8);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
scene.add(dir);

// Physics world
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 40;
world.solver.tolerance = 0.0005;

const defaultMat = new CANNON.Material('default');
const contact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
  friction: 0.6,
  restitution: 0.0
});
world.defaultContactMaterial = contact;
world.addContactMaterial(contact);

// Ground
const groundSize = 20;
const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.0 });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: defaultMat });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Jenga blocks
const BLOCK_LEN = 3;
const BLOCK_WID = 1;
const BLOCK_H = 0.6;
const LAYERS = 18;
const LAYER_GAP = 0.004; // tiny vertical separation to avoid initial interpenetration
const GAP = 0.02; // very small gap to avoid initial contact jitter

const blockGeo = new THREE.BoxGeometry(BLOCK_LEN, BLOCK_H, BLOCK_WID);
const blockMat1 = new THREE.MeshStandardMaterial({ color: 0xc79a63 });
const blockMat2 = new THREE.MeshStandardMaterial({ color: 0xb5895a });

const blockShape = new CANNON.Box(new CANNON.Vec3(BLOCK_LEN / 2, BLOCK_H / 2, BLOCK_WID / 2));

const blocks = []; // { mesh, body }

function buildTower() {
  // Clear previous blocks
  for (const b of blocks) {
    scene.remove(b.mesh);
    world.removeBody(b.body);
  }
  blocks.length = 0;

  const baseY = BLOCK_H / 2;
  for (let i = 0; i < LAYERS; i++) {
    const y = baseY + i * BLOCK_H;
    const horizontal = i % 2 === 0; // alternate orientation

    for (let j = 0; j < 3; j++) {
      const mesh = new THREE.Mesh(blockGeo, i % 2 ? blockMat1 : blockMat2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const body = new CANNON.Body({ mass: 1, shape: blockShape, material: defaultMat });
      body.linearDamping = 0.05;
      body.angularDamping = 0.05;
      body.sleepSpeedLimit = 0.1;
      body.sleepTimeLimit = 0.5;

      let x = 0, z = 0;
      if (horizontal) {
        // Oriented along X (length along X) -> position the trio along Z (perpendicular to length)
        x = 0;
        z = (j - 1) * (BLOCK_WID + GAP);
        body.quaternion.setFromEuler(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
      } else {
        // Oriented along Z (length along Z) -> position the trio along X (perpendicular to length)
        x = (j - 1) * (BLOCK_WID + GAP);
        z = 0;
        body.quaternion.setFromEuler(0, Math.PI / 2, 0);
        mesh.rotation.set(0, Math.PI / 2, 0);
      }

      body.position.set(x, y + i * LAYER_GAP, z);
      mesh.position.copy(body.position);
      scene.add(mesh);
      world.addBody(body);
      blocks.push({ mesh, body });
    }
  }
}

buildTower();
// Pre-warm a few small steps to settle the stack slightly
for (let k = 0; k < 10; k++) {
  world.step(1 / 120);
}

// Dragging implementation
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selected = null; // { mesh, body, localPivot }
let grabBody = null; // kinematic body
let constraint = null; // PointToPointConstraint between grabBody and selected.body
let dragPlane = new THREE.Plane();
const dragPointWorld = new THREE.Vector3();

function createGrabBody() {
  if (grabBody) return;
  grabBody = new CANNON.Body({ mass: 0 }); // will be moved kinematically
  grabBody.addShape(new CANNON.Sphere(0.01));
  grabBody.type = CANNON.Body.KINEMATIC;
  world.addBody(grabBody);
}

function setGrabPosition(v3) {
  if (!grabBody) return;
  grabBody.position.set(v3.x, v3.y, v3.z);
  grabBody.velocity.set(0, 0, 0);
  grabBody.angularVelocity.set(0, 0, 0);
}

function onPointerDown(event) {
  // Only react to Left Mouse Button
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Raycast to blocks
  const meshes = blocks.map(b => b.mesh);
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(meshes);
  if (intersects.length === 0) return;

  const hit = intersects[0];
  const block = blocks.find(b => b.mesh === hit.object);
  if (!block) return;

  // Define drag plane through hit point, normal to camera view
  dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).clone().negate(), hit.point);

  // Local pivot on the block where we grabbed
  const hitPoint = new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z);
  const localPivot = new CANNON.Vec3();
  block.body.pointToLocalFrame(hitPoint, localPivot);

  selected = { ...block, localPivot };

  // Create constraint to kinematic grab body
  createGrabBody();
  dragPointWorld.copy(hit.point);
  setGrabPosition(dragPointWorld);
  // Disable camera controls while dragging
  controls.enabled = false;

  constraint = new CANNON.PointToPointConstraint(
    selected.body,
    new CANNON.Vec3(localPivot.x, localPivot.y, localPivot.z),
    grabBody,
    new CANNON.Vec3(0, 0, 0)
  );
  world.addConstraint(constraint);
}

function onPointerMove(event) {
  if (!selected) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const pos = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, pos)) {
    dragPointWorld.copy(pos);
    setGrabPosition(dragPointWorld);
  }
}

function onPointerUp() {
  if (constraint) {
    world.removeConstraint(constraint);
    constraint = null;
  }
  selected = null;
  // Re-enable camera controls after dragging
  controls.enabled = true;
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);

// Reset tower
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') buildTower();
});

// Sync three meshes with cannon bodies
function syncMeshes() {
  for (const b of blocks) {
    b.mesh.position.copy(b.body.position);
    b.mesh.quaternion.copy(b.body.quaternion);
  }
}

// Animation loop
let lastTime = 0;
function animate(t) {
  requestAnimationFrame(animate);
  const time = t / 1000;
  const dt = Math.min(1 / 30, time - lastTime || 0.016);
  lastTime = time;

  world.step(1 / 60, dt, 3);
  syncMeshes();

  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// Handle resize
window.addEventListener('resize', resize);
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
