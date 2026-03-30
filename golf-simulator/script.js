// Golf Simulator 3D -- Three.js + cannon-es
// Click and drag to aim/power, ball uses rigid body physics.

// Data
const clubs = {
  driver: { name: 'Driver', maxForce: 36 },
  '3wood': { name: '3-Wood', maxForce: 32 },
  '7iron': { name: '7-Iron', maxForce: 25 },
  pitch: { name: 'Pitching Wedge', maxForce: 18 },
  putter: { name: 'Putter', maxForce: 10 }
};

const holes = [
  { distance: 380, par: 4 },
  { distance: 450, par: 5 }
];

let currentHole = 0;
let strokes = 0;
let selectedClub = 'driver';
let isPulling = false;
let dragStart = null;
let isHoleComplete = false;
let canShoot = true;

// DOM
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
const clubButtons = document.getElementById('club-buttons');
const holeNumberElem = document.getElementById('hole-number');
const distanceElem = document.getElementById('distance');
const strokesElem = document.getElementById('strokes');
const shotDistanceElem = document.getElementById('shot-distance');
const instruction = document.getElementById('instruction');
const resultMessage = document.getElementById('result-message');
const holeResult = document.getElementById('hole-result');
const nextShotBtn = document.getElementById('next-shot-btn');

// Three.js
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 1500);
camera.position.set(0, 40, -75);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(100, 180, -80);
dirLight.castShadow = true;
scene.add(dirLight);

// Cannon world
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 12;

const groundMaterial = new CANNON.Material('ground');
const ballMaterial = new CANNON.Material('ball');
const contact = new CANNON.ContactMaterial(groundMaterial, ballMaterial, {
  friction: 0.2,
  restitution: 0.35
});
world.addContactMaterial(contact);

// Ground plane
const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Boundaries for OOB
function addBoundary(rotX, rotY, x, z) {
  const b = new CANNON.Body({ mass: 0, material: groundMaterial });
  b.addShape(new CANNON.Plane());
  b.quaternion.setFromEuler(rotX, rotY, 0);
  b.position.set(x, 0, z);
  world.addBody(b);
}
addBoundary(0, -Math.PI / 2, 125, 0);
addBoundary(0, Math.PI / 2, -125, 0);
addBoundary(0, Math.PI, 0, -50);
addBoundary(0, 0, 0, 900);

// Course visuals
const fairway = new THREE.Mesh(
  new THREE.PlaneGeometry(250, 950, 20, 20),
  new THREE.MeshStandardMaterial({ color: 0x2d8659 })
);
fairway.rotation.x = -Math.PI / 2;
fairway.receiveShadow = true;
scene.add(fairway);

const roughL = new THREE.Mesh(new THREE.PlaneGeometry(95, 950), new THREE.MeshStandardMaterial({ color: 0x1a5a30 }));
roughL.rotation.x = -Math.PI / 2; roughL.position.x = -160; scene.add(roughL);
const roughR = roughL.clone(); roughR.position.x = 160; scene.add(roughR);

const green = new THREE.Mesh(new THREE.CircleGeometry(12, 40), new THREE.MeshStandardMaterial({ color: 0x4ade80 }));
green.rotation.x = -Math.PI / 2; green.position.y = 0.01; scene.add(green);

const holeMesh = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), new THREE.MeshStandardMaterial({ color: 0x000000 }));
holeMesh.rotation.x = -Math.PI / 2; scene.add(holeMesh);

const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }));
flagPole.position.y = 6; scene.add(flagPole);
const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide }));
flag.position.set(1.5, 8, 0); scene.add(flag);

function updateHoleVisuals() {
  const holeData = holes[currentHole];
  green.position.z = holeData.distance;
  holeMesh.position.z = holeData.distance;
  flagPole.position.z = holeData.distance;
  flag.position.z = holeData.distance;
}

// Ball
const ballRadius = 1.3;
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(ballRadius, 24, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 }));
ballMesh.castShadow = true; scene.add(ballMesh);
const ballBody = new CANNON.Body({ mass: 0.045, material: ballMaterial, linearDamping: 0.25, angularDamping: 0.5 });
ballBody.addShape(new CANNON.Sphere(ballRadius));
world.addBody(ballBody);

// Aiming guide line
const aimLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xffff00 })
);
scene.add(aimLine);
aimLine.visible = false;

// Sounds
const hitAudio = new Audio('https://actions.google.com/sounds/v1/sports/golf_swipe.ogg');
const rollAudio = new Audio('https://actions.google.com/sounds/v1/sports/golf_putt.ogg');
const outAudio = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');
rollAudio.loop = true;

// UI helpers
function setSize() {
  const width = Math.min(window.innerWidth * 0.96, 1400);
  const height = Math.min(window.innerHeight * 0.86, 760);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', setSize);
setSize();

function updateHUD() {
  const dist = Math.max(0, Math.round(getDistanceToHole()));
  holeNumberElem.textContent = `${currentHole + 1}`;
  distanceElem.textContent = `${dist}`;
  strokesElem.textContent = `${strokes}`;
  shotDistanceElem.textContent = `${Math.round(ballBody.velocity.length() * 10)}m`;
}

function getDistanceToHole() {
  const holePos = new CANNON.Vec3(0, 0, holes[currentHole].distance);
  const dx = holePos.vsub(ballBody.position);
  dx.y = 0;
  return dx.length();
}

function resetBall() {
  ballBody.position.set(0, ballRadius + 0.05, 0);
  ballBody.velocity.setZero();
  ballBody.angularVelocity.setZero();
  ballBody.quaternion.set(0, 0, 0, 1);
  ballMesh.position.copy(ballBody.position);
  canShoot = true;
  isHoleComplete = false;
  instruction.textContent = 'Click and drag to shoot. Release to hit.';
  resultMessage.textContent = '';
  holeResult.style.display = 'none';
}

function chooseClubButtons() {
  clubButtons.innerHTML = '';
  for (const [key, club] of Object.entries(clubs)) {
    const button = document.createElement('button');
    button.className = 'club-btn' + (selectedClub === key ? ' selected' : '');
    button.textContent = club.name;
    button.onclick = () => {
      selectedClub = key;
      document.querySelectorAll('.club-btn').forEach(b => b.classList.remove('selected'));
      button.classList.add('selected');
      instruction.textContent = `${club.name} active.`;
    };
    clubButtons.appendChild(button);
  }
}

function checkHole() {
  const dist = getDistanceToHole();
  if (!isHoleComplete && dist <= 2.5 && ballBody.velocity.length() < 0.6) {
    isHoleComplete = true;
    canShoot = false;
    resultMessage.textContent = `Hole done in ${strokes} strokes (par ${holes[currentHole].par}, ${getScoreLabel()}).`;
    holeResult.style.display = 'block';
  }
}

function getScoreLabel() {
  const diff = strokes - holes[currentHole].par;
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  return diff > 0 ? `${diff} over par` : `${-diff} under par`;
}

canvas.addEventListener('pointerdown', (event) => {
  if (!canShoot || isHoleComplete) return;
  isPulling = true;
  dragStart = { x: event.clientX, y: event.clientY };
  aimLine.visible = true;
});

canvas.addEventListener('pointermove', (event) => {
  if (!isPulling || !dragStart) return;
  const dx = dragStart.x - event.clientX;
  const dz = event.clientY - dragStart.y;
  const direction = new THREE.Vector3(dx * 0.4, 0, dz * 0.4);
  const start = new THREE.Vector3(ballBody.position.x, 1.5, ballBody.position.z);
  const end = start.clone().add(direction);
  aimLine.geometry.setFromPoints([start, end]);
});

canvas.addEventListener('pointerup', (event) => {
  if (!isPulling || !dragStart || !canShoot || isHoleComplete) return;
  isPulling = false;
  aimLine.visible = false;

  const dx = dragStart.x - event.clientX;
  const dz = event.clientY - dragStart.y;
  const power = Math.min(Math.sqrt(dx * dx + dz * dz) * 0.32, clubs[selectedClub].maxForce);
  if (power < 1.5) return;

  const direction = new CANNON.Vec3(dx, 0.1, dz).unit();
  const impulse = direction.scale(power);
  ballBody.applyImpulse(impulse, ballBody.position);

  strokes += 1;
  shotDistanceElem.textContent = `${Math.round(power * 2)}m`;
  updateHUD();
  instruction.textContent = 'Ball in play...';

  hitAudio.currentTime = 0;
  hitAudio.play().catch(() => {});
  canShoot = false;
});

startBtn.onclick = () => {
  startScreen.style.display = 'none';
  gameScreen.style.display = 'block';
  selectedClub = 'driver';
  strokes = 0;
  currentHole = 0;
  updateHoleVisuals();
  chooseClubButtons();
  resetBall();
  updateHUD();
  requestAnimationFrame(loop);
};

nextShotBtn.onclick = () => {
  currentHole += 1;
  if (currentHole >= holes.length) {
    resultMessage.textContent = `Round complete: ${strokes} strokes`; return;
  }
  updateHoleVisuals();
  resetBall();
  chooseClubButtons();
  updateHUD();
};

const restartBtn = document.createElement('button');
restartBtn.textContent = 'Restart';
restartBtn.onclick = () => {
  currentHole = 0; strokes = 0; isHoleComplete = false; canShoot = true;
  updateHoleVisuals(); chooseClubButtons(); resetBall(); updateHUD();
};
document.getElementById('hud').appendChild(restartBtn);

function loop() {
  const dt = 1 / 60;
  world.step(dt);

  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);

  if (ballBody.velocity.length() > 0.35) {
    if (rollAudio.paused) { rollAudio.currentTime = 0; rollAudio.play().catch(() => {}); }
    rollAudio.volume = Math.min(1, ballBody.velocity.length() / 20);
  } else {
    rollAudio.pause();
    if (!isHoleComplete) canShoot = true;
  }

  updateHUD();

  if (!isHoleComplete) checkHole();

  const pos = ballBody.position;
  if (!isHoleComplete && (Math.abs(pos.x) > 125 || pos.z < -60 || pos.z > 900 || pos.y > 12)) {
    outAudio.currentTime = 0; outAudio.play().catch(() => {});
    resultMessage.textContent = 'Out of bounds - reset to tee.';
    setTimeout(resetBall, 500);
  }

  const target = new THREE.Vector3(ballBody.position.x, ballBody.position.y, ballBody.position.z);
  camera.position.lerp(new THREE.Vector3(ballBody.position.x, 40, ballBody.position.z - 70), 0.04);
  camera.lookAt(target);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
