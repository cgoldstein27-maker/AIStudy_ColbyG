// Golf clubs with their characteristics
const clubs = {
  driver: { name: 'Driver', distance: 250, accuracy: 0.7, maxDistance: 280 },
  '3wood': { name: '3-Wood', distance: 220, accuracy: 0.75, maxDistance: 250 },
  '5wood': { name: '5-Wood', distance: 200, accuracy: 0.8, maxDistance: 230 },
  '3iron': { name: '3-Iron', distance: 180, accuracy: 0.78, maxDistance: 210 },
  '4iron': { name: '4-Iron', distance: 170, accuracy: 0.8, maxDistance: 200 },
  '5iron': { name: '5-Iron', distance: 160, accuracy: 0.82, maxDistance: 190 },
  '6iron': { name: '6-Iron', distance: 150, accuracy: 0.84, maxDistance: 180 },
  '7iron': { name: '7-Iron', distance: 140, accuracy: 0.85, maxDistance: 170 },
  '8iron': { name: '8-Iron', distance: 130, accuracy: 0.86, maxDistance: 160 },
  '9iron': { name: '9-Iron', distance: 120, accuracy: 0.87, maxDistance: 150 },
  pitching: { name: 'Pitching Wedge', distance: 100, accuracy: 0.88, maxDistance: 130 },
  sand: { name: 'Sand Wedge', distance: 80, accuracy: 0.9, maxDistance: 110 },
  lob: { name: 'Lob Wedge', distance: 60, accuracy: 0.92, maxDistance: 90 },
  putter: { name: 'Putter', distance: 10, accuracy: 0.95, maxDistance: 20 }
};

const holes = [
  { distance: 400, par: 4 }, { distance: 350, par: 4 }, { distance: 500, par: 5 },
  { distance: 320, par: 4 }, { distance: 450, par: 5 }, { distance: 380, par: 4 },
  { distance: 550, par: 5 }, { distance: 290, par: 3 }, { distance: 600, par: 5 },
  { distance: 410, par: 4 }, { distance: 360, par: 4 }, { distance: 520, par: 5 },
  { distance: 330, par: 4 }, { distance: 460, par: 5 }, { distance: 390, par: 4 },
  { distance: 570, par: 5 }, { distance: 300, par: 3 }, { distance: 480, par: 5 }
];

let currentHole = 0;
let totalStrokes = 0;
let gameStarted = false;
let meterRunning = false;
let stage = 'club'; // 'club', 'power', or 'accuracy'
let selectedClub = 'driver';
let ballDistance = 0;
let powerValue = 0;
let targetsHit = 0;
let gameTimeLeft = 0;

const canvas = document.getElementById('course-canvas');
const ctx = canvas.getContext('2d');
const targetCanvas = document.getElementById('target-canvas');
const targetCtx = targetCanvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const clubSelection = document.getElementById('club-selection');
const clubButtons = document.getElementById('club-buttons');
const powerMeterBg = document.getElementById('power-meter-bg');
const powerMeterLabel = document.getElementById('power-meter-label');
const meterContainer = document.getElementById('meter-container');
const accuracyGame = document.getElementById('accuracy-game');
const instruction = document.getElementById('instruction');
const resultMessage = document.getElementById('result-message');
const holeResult = document.getElementById('hole-result');
const nextHoleBtn = document.getElementById('next-hole-btn');

canvas.width = 900;
canvas.height = 500;
targetCanvas.width = 600;
targetCanvas.height = 400;

let targets = [];
let targetRadius = 20;

class Target {
  constructor() {
    this.x = Math.random() * (targetCanvas.width - 80) + 40;
    this.y = Math.random() * (targetCanvas.height - 80) + 40;
    this.radius = targetRadius;
  }
  
  contains(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return Math.sqrt(dx * dx + dy * dy) < this.radius;
  }
  
  draw() {
    targetCtx.strokeStyle = '#4CAF50';
    targetCtx.lineWidth = 3;
    targetCtx.beginPath();
    targetCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    targetCtx.stroke();
    
    targetCtx.fillStyle = '#4CAF50';
    targetCtx.beginPath();
    targetCtx.arc(this.x, this.y, this.radius / 3, 0, Math.PI * 2);
    targetCtx.fill();
  }
}

startBtn.addEventListener('click', startGame);
document.addEventListener('keydown', handleSpaceBar);

function startGame() {
  gameStarted = true;
  startScreen.style.display = 'none';
  gameScreen.style.display = 'block';
  loadHole();
}

function loadHole() {
  if (currentHole >= holes.length) {
    endGame();
    return;
  }
  
  const hole = holes[currentHole];
  ballDistance = hole.distance;
  
  document.getElementById('hole-number').textContent = currentHole + 1;
  document.getElementById('distance').textContent = hole.distance;
  document.getElementById('strokes').textContent = totalStrokes;
  document.getElementById('ball-distance').textContent = Math.round(ballDistance);
  
  stage = 'club';
  powerValue = 0;
  targetsHit = 0;
  selectedClub = 'driver';
  
  resultMessage.textContent = '';
  holeResult.style.display = 'none';
  instruction.textContent = 'Select a club for your swing';
  
  clubSelection.style.display = 'block';
  meterContainer.style.display = 'none';
  accuracyGame.style.display = 'none';
  
  drawCourse();
  generateClubButtons();
}

function generateClubButtons() {
  clubButtons.innerHTML = '';
  const hole = holes[currentHole];
  
  for (const [key, club] of Object.entries(clubs)) {
    if (club.distance > ballDistance * 1.3) continue;
    
    const btn = document.createElement('button');
    btn.className = 'club-btn';
    if (key === 'putter' && ballDistance <= 20) {
      btn.className += ' selected';
      selectedClub = key;
    } else if (key === 'driver' && selectedClub === 'driver') {
      btn.className += ' selected';
    }
    
    btn.textContent = club.name;
    btn.addEventListener('click', () => selectClub(key, btn));
    clubButtons.appendChild(btn);
  }
}

function selectClub(key, btnElement) {
  selectedClub = key;
  document.querySelectorAll('.club-btn').forEach(btn => btn.classList.remove('selected'));
  btnElement.classList.add('selected');
  instruction.textContent = `${clubs[key].name} selected. Press SPACEBAR to swing.`;
}

function handleSpaceBar(e) {
  if (e.code === 'Space' && gameStarted && !meterRunning) {
    e.preventDefault();
    
    if (stage === 'club') {
      startSwing();
    }
  }
}

function startSwing() {
  stage = 'power';
  clubSelection.style.display = 'none';
  meterContainer.style.display = 'block';
  accuracyGame.style.display = 'none';
  powerMeterLabel.style.display = 'block';
  
  meterRunning = true;
  powerValue = 0;
  instruction.textContent = 'Press SPACEBAR at peak power!';
  
  const powerInterval = setInterval(() => {
    powerValue += 2;
    if (powerValue > 100) {
      powerValue = 0;
    }
    document.getElementById('power-meter').style.width = powerValue + '%';
  }, 20);
  
  window.powerInterval = powerInterval;
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && gameStarted && meterRunning && stage === 'power') {
    e.preventDefault();
    clearInterval(window.powerInterval);
    startAccuracyGame();
  }
});

function startAccuracyGame() {
  stage = 'accuracy';
  meterContainer.style.display = 'none';
  accuracyGame.style.display = 'block';
  
  meterRunning = true;
  targetsHit = 0;
  gameTimeLeft = 3;
  targets = [];
  
  instruction.textContent = 'Click the targets as fast as you can!';
  
  // Generate initial targets
  for (let i = 0; i < 5; i++) {
    targets.push(new Target());
  }
  
  drawTargets();
  
  // Click handler for targets
  targetCanvas.addEventListener('click', handleTargetClick);
  
  // Timer
  const timerInterval = setInterval(() => {
    gameTimeLeft -= 0.1;
    document.getElementById('game-timer').textContent = Math.ceil(gameTimeLeft);
    
    if (gameTimeLeft <= 0) {
      clearInterval(timerInterval);
      targetCanvas.removeEventListener('click', handleTargetClick);
      finishSwing();
    }
  }, 100);
  
  // Spawn new targets periodically
  const spawnInterval = setInterval(() => {
    if (gameTimeLeft <= 0) {
      clearInterval(spawnInterval);
      return;
    }
    if (targets.length < 8) {
      targets.push(new Target());
    }
  }, 400);
  
  window.spawnInterval = spawnInterval;
  window.timerInterval = timerInterval;
}

function handleTargetClick(e) {
  const rect = targetCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  for (let i = targets.length - 1; i >= 0; i--) {
    if (targets[i].contains(x, y)) {
      targetsHit++;
      targets.splice(i, 1);
      document.getElementById('targets-hit').textContent = targetsHit;
      break;
    }
  }
  
  drawTargets();
}

function drawTargets() {
  targetCtx.fillStyle = '#1a1a2e';
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  
  targets.forEach(target => target.draw());
}

function finishSwing() {
  meterRunning = false;
  stage = 'waiting';
  accuracyGame.style.display = 'none';
  
  const club = clubs[selectedClub];
  const hole = holes[currentHole];
  
  // Power multiplier
  const powerAccuracy = 100 - Math.abs(powerValue - 100);
  const powerMultiplier = (powerAccuracy / 100) * 0.8 + 0.2;
  
  // Accuracy multiplier based on targets hit (0-10)
  const accuracyMultiplier = (targetsHit / 10) * 0.5 + 0.5;
  
  const distance = club.maxDistance * powerMultiplier * accuracyMultiplier;
  
  ballDistance -= distance;
  if (ballDistance < 0) ballDistance = 0;
  
  totalStrokes++;
  document.getElementById('strokes').textContent = totalStrokes;
  document.getElementById('ball-distance').textContent = Math.round(ballDistance);
  
  let message = `Hit ${Math.round(distance)}m with ${club.name}! (${targetsHit}/10 targets)`;
  
  if (ballDistance <= 5) {
    message += ' 🎯 Great position!';
  } else if (ballDistance <= 50) {
    message += ' ⛳ Close to the green!';
  } else if (ballDistance <= 150) {
    message += ' 📍 Good distance!';
  } else {
    message += ' ⚠️ Keep working!';
  }
  
  resultMessage.textContent = message;
  instruction.textContent = '';
  
  drawCourse();
  
  setTimeout(() => {
    if (ballDistance > 5) {
      stage = 'club';
      loadHole();
    } else {
      holeResult.style.display = 'block';
      const parDiff = totalStrokes - holes[currentHole].par;
      let score = '';
      if (parDiff === -2) score = ' 🦅 EAGLE!';
      else if (parDiff === -1) score = ' 🏌️ BIRDIE!';
      else if (parDiff === 0) score = ' PAR';
      else if (parDiff > 0) score = ` +${parDiff}`;
      document.getElementById('score-result').textContent = `Hole ${currentHole + 1}: ${totalStrokes} strokes${score}`;
      instruction.textContent = '';
    }
  }, 1500);
}

function drawCourse() {
  const hole = holes[currentHole];
  
  ctx.fillStyle = '#2d8659';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#1a5a30';
  ctx.fillRect(0, 0, 100, canvas.height);
  ctx.fillRect(canvas.width - 100, 0, 100, canvas.height);
  
  const holeX = canvas.width - 50;
  const holeY = canvas.height / 2 - 30;
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.ellipse(holeX, holeY, 40, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(holeX, holeY);
  ctx.lineTo(holeX, holeY - 60);
  ctx.stroke();
  
  ctx.fillStyle = '#FF6B6B';
  ctx.beginPath();
  ctx.moveTo(holeX, holeY - 60);
  ctx.lineTo(holeX + 20, holeY - 50);
  ctx.lineTo(holeX, holeY - 40);
  ctx.fill();
  
  const ballX = 50 + ((hole.distance - ballDistance) / hole.distance) * (canvas.width - 150);
  const ballY = canvas.height / 2;
  
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(ballX, ballY);
  ctx.lineTo(holeX, holeY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  const playerX = 80;
  const playerY = canvas.height / 2 + 80;
  
  ctx.fillStyle = '#FFD9B3';
  ctx.beginPath();
  ctx.arc(playerX, playerY - 40, 12, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(playerX, playerY - 28);
  ctx.lineTo(playerX, playerY);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(playerX - 8, playerY + 20);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(playerX + 8, playerY + 20);
  ctx.stroke();
  
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(playerX + 5, playerY - 15);
  ctx.lineTo(playerX + 30, playerY - 50);
  ctx.stroke();
  
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(playerX + 28, playerY - 48, 5, 0, Math.PI * 2);
  ctx.fill();
}

nextHoleBtn.addEventListener('click', () => {
  currentHole++;
  loadHole();
});

function endGame() {
  gameScreen.innerHTML = `
    <div id="end-screen">
      <h1>⛳ Round Complete!</h1>
      <p><strong>Total Strokes:</strong> ${totalStrokes}</p>
      <p><strong>Par:</strong> ${holes.reduce((sum, h) => sum + h.par, 0)}</p>
      <p><strong>Score:</strong> ${totalStrokes - holes.reduce((sum, h) => sum + h.par, 0) > 0 ? '+' : ''}${totalStrokes - holes.reduce((sum, h) => sum + h.par, 0)}</p>
      <button onclick="location.reload()">Play Again</button>
    </div>
  `;
}

