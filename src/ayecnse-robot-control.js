/**
 * AyeCNSe Robot Control Interface - Core Library
 * Copyright (c) 2026 Abhishek Choudhary
 * 
 * Part of the AyeCNSe Physical AI Platform
 * https://icansee.life
 * 
 * This library provides:
 * - Layer 0: Physical HAL abstraction
 * - Layer 1: Kinematics & Mixers (differential drive, proportional control)
 * - Layer 2: Intent Abstraction (joystick, keyboard, rhythmic dance, BCI-ready)
 * - Layer 3: Transport & Real-Time Mediation
 * - Layer 4: Digital Twin visualization
 * 
 * Supports: Arduino UNO, ESP32, L293D, L298N motor controllers
 */

'use strict';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const ACCENT_MULTIPLIER = 2.2;  // Beat detection threshold multiplier
const MIN_DANCE_CMD_GAP = 60;   // Minimum ms between dance commands (rate limiting)
const REPEAT_INTERVAL = 250;    // Manual control repeat interval (ms)

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let seq = 1;                    // Command sequence number
let isDragging = false;         // Joystick drag state
let currentDirection = null;    // Current manual control direction
let commandInterval = null;     // Manual control repeat timer

// Robot visualization state
let robotX = 0;
let robotY = 0;
let visualRotation = 0;         // Degrees, 0 = facing up

// Dance mode state
let isDancingRhythmic = false;
let audioContext = null;
let analyser = null;
let microphone = null;
let animationId = null;
let beatDetectionInterval = null;
let energyHistory = [];
let lastBeatTime = 0;
let beatCount = 0;
let cycleLength = 8;            // Default tāla cycle
let lastDanceCmdTime = 0;
let lastEnergy = 0;
let microMoveTimer = null;
let microDir = 1;               // 1 or -1 for alternating micro-movements

const directions = ['F', 'B', 'L', 'R'];
let currentDanceDirection = 0;

// DOM Elements (initialized on load)
const maxDistance = 55;
let joystickBase, joystickStick, robot, commandLog, seqDisplay, statusDisplay;
let directionIndicators, canvas, canvasCtx, beatIndicator, rhythmicDanceBtn;

// ============================================================================
// LAYER 3: TRANSPORT & NETWORK ABSTRACTION
// ============================================================================

/**
 * Update connection mode UI
 */
function updateMode() {
    document.getElementById("customHostRow").style.display =
        document.getElementById("mode").value === "custom" ? "block" : "none";
}

/**
 * Get base URL for robot commands based on connection mode
 * @returns {string} Base URL for /cmd endpoint
 */
function getBaseUrl() {
    return document.getElementById("mode").value === "same" ? "/cmd" :
           document.getElementById("customHost").value.replace(/\/$/, "") + "/cmd";
}

/**
 * Log a message to the command display
 * Suppressed during dance mode to prevent UI overload
 * @param {string} msg - Message to log
 */
function log(msg) {
    if (isDancingRhythmic) return; // No logging during dance

    const entry = document.createElement('div');
    entry.className = 'command-entry sent';
    entry.textContent = msg;
    commandLog.appendChild(entry);
    commandLog.scrollTop = commandLog.scrollHeight;

    while (commandLog.children.length > 30) {
        commandLog.removeChild(commandLog.firstChild);
    }
}

/**
 * Send a command to the robot (high-level API)
 * @param {string} dir - Direction: F/B/L/R/S
 */
function sendCmd(dir) {
    const duration = document.getElementById("duration").value;
    const pwm = document.getElementById("pwm").value;
    const data = dir === "S" ? "S,0,0" : `${dir},${duration},${pwm}`;
    const url = `${getBaseUrl()}?data=${data}&seq=${seq++}`;
    
    seqDisplay.textContent = seq - 1;
    log("→ " + data);
    
    fetch(url, { cache: "no-store" })
        .then(r => r.text())
        .then(t => { 
            log("← " + t); 
            statusDisplay.textContent = 'OK'; 
            updateRobotVisualization(dir); 
        })
        .catch(() => { 
            statusDisplay.textContent = 'SENT'; 
            updateRobotVisualization(dir); 
        });
}

/**
 * Send a raw command (low-level API for dance/proportional control)
 * @param {string} dir - Direction
 * @param {number} duration - Duration in ms
 * @param {number} pwm - PWM value (0-255)
 */
function sendCmdRaw(dir, duration, pwm) {
    const data = `${dir},${duration},${pwm}`;
    const url = `${getBaseUrl()}?data=${data}&seq=${seq++}`;
    seqDisplay.textContent = seq - 1;

    updateRobotVisualization(dir);
    fetch(url, { cache: "no-store" }).catch(() => {});
}

/**
 * Send a dance command with rate limiting
 * @param {string} dir - Direction
 */
function sendDanceCmd(dir) {
    const now = Date.now();
    if (now - lastDanceCmdTime < MIN_DANCE_CMD_GAP) return;
    lastDanceCmdTime = now;

    const DANCE_DURATION = 50;
    const DANCE_PWM = 255;

    const data = `${dir},${DANCE_DURATION},${DANCE_PWM}`;
    const url = `${getBaseUrl()}?data=${data}&seq=${seq++}`;

    seqDisplay.textContent = seq - 1;
    updateRobotVisualization(dir);

    fetch(url, { cache: "no-store" }).catch(() => {});
}

// ============================================================================
// LAYER 1: KINEMATICS & MIXERS (Proportional Control)
// ============================================================================

/**
 * Send proportional joystick command with time-sliced mixing
 * Converts 2D joystick input to F/B and L/R commands with proportional PWM
 * @param {number} x - Normalized X (-1 to 1)
 * @param {number} y - Normalized Y (-1 to 1)
 */
function sendProportionalJoystick(x, y) {
    const DEADZONE = 0.08;
    const MAX_PWM = 255;
    const TOTAL_DURATION = Number(document.getElementById('duration').value);

    const r = Math.sqrt(x * x + y * y);
    if (r < DEADZONE) {
        sendCmd('S');
        return;
    }

    const nx = Math.max(-1, Math.min(1, x));
    const ny = Math.max(-1, Math.min(1, y));
    const pwm = Math.round(r * MAX_PWM);

    const sum = Math.abs(nx) + Math.abs(ny);
    if (sum === 0) return;

    const fWeight = Math.abs(ny) / sum;
    const rWeight = Math.abs(nx) / sum;

    const fDuration = Math.round(TOTAL_DURATION * fWeight);
    const rDuration = Math.round(TOTAL_DURATION * rWeight);

    const fbDir = ny >= 0 ? 'F' : 'B';
    const lrDir = nx >= 0 ? 'R' : 'L';

    if (fDuration > 0) {
        sendCmdRaw(fbDir, fDuration, pwm);
    }

    if (rDuration > 0) {
        setTimeout(() => {
            sendCmdRaw(lrDir, rDuration, pwm);
        }, fDuration);
    }
}

// ============================================================================
// LAYER 4: DIGITAL TWIN VISUALIZATION
// ============================================================================

/**
 * Update the digital twin robot visualization
 * Implements SE(2) kinematics with smooth rotation
 * @param {string} dir - Direction command
 */
function updateRobotVisualization(dir) {
    const MOVE_STEP = 10;      // pixels per command
    const TURN_STEP = 18;      // degrees per command
    const ROT_SMOOTH = 0.35;   // angular inertia

    let targetRotation = visualRotation;

    switch (dir) {
        case 'L':
            targetRotation -= TURN_STEP;
            break;

        case 'R':
            targetRotation += TURN_STEP;
            break;

        case 'F': {
            const rad = visualRotation * Math.PI / 180;
            robotX += Math.sin(rad) * MOVE_STEP;
            robotY -= Math.cos(rad) * MOVE_STEP;
            break;
        }

        case 'B': {
            const rad = visualRotation * Math.PI / 180;
            robotX -= Math.sin(rad) * MOVE_STEP;
            robotY += Math.cos(rad) * MOVE_STEP;
            break;
        }

        case 'S':
            robot.classList.remove('moving');
            return;
    }

    robot.classList.add('moving');

    // Smooth rotation
    let delta = ((targetRotation - visualRotation + 540) % 360) - 180;
    visualRotation += delta * ROT_SMOOTH;

    // Small body jitter for realism
    const jitterX = Math.random() * 2 - 1;
    const jitterY = Math.random() * 2 - 1;

    robot.style.transform =
        `translate(${robotX + jitterX}px, ${robotY + jitterY}px)
         rotate(${visualRotation}deg)`;
}

// ============================================================================
// LAYER 2: INTENT ABSTRACTION - JOYSTICK
// ============================================================================

/**
 * Get joystick position from client coordinates
 * Inverts Y axis for proper up = forward mapping
 */
function getJoystickPosition(clientX, clientY) {
    const rect = joystickBase.getBoundingClientRect();
    let deltaX = clientX - (rect.left + rect.width / 2);
    let deltaY = (rect.top + rect.height / 2) - clientY; // Inverted Y

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > maxDistance) {
        const angle = Math.atan2(deltaY, deltaX);
        deltaX = Math.cos(angle) * maxDistance;
        deltaY = Math.sin(angle) * maxDistance;
    }
    return { x: deltaX, y: deltaY, distance };
}

/**
 * Update joystick stick visual position
 */
function updateJoystickPosition(dx, dy) {
    joystickStick.style.transform =
        `translate(calc(-50% + ${dx}px), calc(-50% + ${-dy}px))`;
}

/**
 * Get discrete direction from joystick position (legacy mode)
 */
function getDirectionFromJoystick(dx, dy, dist) {
    if (dist < 18) return null;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle >= -45 && angle < 45) return 'R';
    if (angle >= 45 && angle < 135) return 'F';
    if (angle >= -135 && angle < -45) return 'B';
    return 'L';
}

/**
 * Update direction indicators from analog joystick
 */
function updateDirectionIndicatorsFromAnalog(x, y) {
    directionIndicators.forEach(i => i.classList.remove('active'));

    if (Math.abs(y) > Math.abs(x)) {
        if (y > 0.2) document.querySelector('.dir-up')?.classList.add('active');
        if (y < -0.2) document.querySelector('.dir-down')?.classList.add('active');
    } else {
        if (x > 0.2) document.querySelector('.dir-right')?.classList.add('active');
        if (x < -0.2) document.querySelector('.dir-left')?.classList.add('active');
    }
}

/**
 * Update direction indicators (discrete mode)
 */
function updateDirectionIndicators(dir) {
    directionIndicators.forEach(i => i.classList.remove('active'));
    if (dir === 'F') document.querySelector('.dir-up').classList.add('active');
    if (dir === 'B') document.querySelector('.dir-down').classList.add('active');
    if (dir === 'L') document.querySelector('.dir-left').classList.add('active');
    if (dir === 'R') document.querySelector('.dir-right').classList.add('active');
}

/**
 * Handle joystick movement (proportional control)
 */
function handleJoystickMove(cx, cy) {
    const { x, y, distance } = getJoystickPosition(cx, cy);
    updateJoystickPosition(x, y);

    const normX = x / maxDistance;
    const normY = y / maxDistance;

    sendProportionalJoystick(normX, normY);
    updateDirectionIndicatorsFromAnalog(normX, normY);
}

/**
 * Start repeating command (discrete mode)
 */
function startRepeatingCommand(dir) {
    if (commandInterval) clearInterval(commandInterval);
    if (isDancingRhythmic) return;
    
    sendCmd(dir);
    statusDisplay.textContent = 'ACTIVE';
    commandInterval = setInterval(() => { 
        if (currentDirection === dir) sendCmd(dir); 
    }, REPEAT_INTERVAL);
}

/**
 * Stop repeating command
 */
function stopRepeatingCommand() {
    if (commandInterval) { 
        clearInterval(commandInterval); 
        commandInterval = null; 
    }
    if (!isDancingRhythmic) { 
        sendCmd('S'); 
        robot.classList.remove('moving'); 
        statusDisplay.textContent = 'READY'; 
    }
}

// ============================================================================
// LAYER 2: INTENT ABSTRACTION - RHYTHMIC DANCE (Tāla-Aware)
// ============================================================================

/**
 * Toggle rhythmic dance mode
 */
async function toggleRhythmicDance() {
    if (!isDancingRhythmic) await startRhythmicDance();
    else stopRhythmicDance();
}

/**
 * Start rhythmic dance mode with Web Audio API
 */
async function startRhythmicDance() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.05; // Low smoothing for percussive transients
        microphone.connect(analyser);
        
        isDancingRhythmic = true;
        rhythmicDanceBtn.textContent = 'Stop Rhythmic Dance';
        rhythmicDanceBtn.classList.add('active');
        statusDisplay.textContent = 'DANCING';
        log('🎵 Rhythmic dance active');
        
        visualize();
        detectBeats();
    } catch { 
        log('✖ Mic access denied'); 
        alert('Allow microphone for rhythmic dance'); 
    }
}

/**
 * Stop rhythmic dance mode
 */
function stopRhythmicDance() {
    isDancingRhythmic = false;
    rhythmicDanceBtn.textContent = 'Start Rhythmic Dance';
    rhythmicDanceBtn.classList.remove('active');
    statusDisplay.textContent = 'READY';
    
    if (animationId) cancelAnimationFrame(animationId);
    if (beatDetectionInterval) clearInterval(beatDetectionInterval);
    if (microphone) microphone.disconnect();
    if (audioContext) audioContext.close();
    
    sendCmd('S');
    log('🎵 Dance stopped');
}

/**
 * Visualize audio waveform
 */
function visualize() {
    if (!isDancingRhythmic) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    canvasCtx.fillStyle = 'rgba(0,0,0,0.2)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        canvasCtx.fillStyle = `rgb(0,255,${136 + dataArray[i]/2})`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
    
    animationId = requestAnimationFrame(visualize);
}

/**
 * Detect beats and drive rhythmic movement
 * Implements tāla-aware beat detection with energy-driven micro-movements
 */
function detectBeats() {
    if (!isDancingRhythmic) return;
    
    beatDetectionInterval = setInterval(() => {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        // Focus on low-mid frequencies (percussion/mridangam/tabla)
        const lowMidStart = Math.floor(bufferLength * 0.02);
        const lowMidEnd = Math.floor(bufferLength * 0.15);
        
        let energy = 0;
        for (let i = lowMidStart; i < lowMidEnd; i++) energy += dataArray[i];
        energy /= (lowMidEnd - lowMidStart);
        
        energyHistory.push(energy);
        if (energyHistory.length > 43) energyHistory.shift();
        
        const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
        const threshold = avgEnergy * ACCENT_MULTIPLIER;
        const now = Date.now();
        const timeSinceLastBeat = now - lastBeatTime;

        // Continuous thirkan (fast micro-movements)
        energyDrivenMove(energy, avgEnergy);

        // Accent beats (slow, big movements)
        if (energy > threshold && timeSinceLastBeat > 250) {
            onBeatDetected();
            lastBeatTime = now;
        }
    }, 12); // ~83Hz detection rate
}

/**
 * Energy-driven micro-movements (thirkan)
 */
function energyDrivenMove(energy, avgEnergy) {
    if (!isDancingRhythmic) return;
    if (energy < avgEnergy * 1.1) return;

    const dir = microDir > 0 ? 'L' : 'R';
    microDir *= -1;

    sendDanceCmd(dir);
}

/**
 * Handle detected beat (accent)
 * Implements cycle-aware direction changes
 */
function onBeatDetected() {
    beatCount++;

    beatIndicator.classList.add('active');
    setTimeout(() => beatIndicator.classList.remove('active'), 80);

    const dir = directions[currentDanceDirection];

    // Primary hit
    sendDanceCmd(dir);

    // Kickback/recoil for rhythmic consonance
    setTimeout(() => {
        const opposite = dir === 'F' ? 'B' :
                         dir === 'B' ? 'F' :
                         dir === 'L' ? 'R' : 'L';
        sendDanceCmd(opposite);
    }, 90);

    // Direction change on cycle boundary (tāla-aware)
    if (beatCount % cycleLength === 0) {
        currentDanceDirection = (currentDanceDirection + 1) % directions.length;
        log(`🔥 THIRKAN TURN → ${directions[currentDanceDirection]}`);
    }
}

// ============================================================================
// UI EVENT HANDLERS
// ============================================================================

function openSettings() { 
    document.getElementById('modalOverlay').classList.add('active'); 
}

function closeSettings() { 
    document.getElementById('modalOverlay').classList.remove('active'); 
}

function closeSettingsIfBackdrop(e) { 
    if (e.target === e.currentTarget) closeSettings(); 
}

function resizeCanvas() { 
    canvas.width = canvas.offsetWidth; 
    canvas.height = canvas.offsetHeight; 
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM references
    joystickBase = document.getElementById('joystickBase');
    joystickStick = document.getElementById('joystickStick');
    robot = document.getElementById('robot');
    commandLog = document.getElementById('commandLog');
    seqDisplay = document.getElementById('seqDisplay');
    statusDisplay = document.getElementById('statusDisplay');
    directionIndicators = document.querySelectorAll('.direction-indicator');
    canvas = document.getElementById('visualizerCanvas');
    canvasCtx = canvas.getContext('2d');
    beatIndicator = document.getElementById('beatIndicator');
    rhythmicDanceBtn = document.getElementById('rhythmicDanceBtn');

    // Joystick mouse events
    joystickStick.addEventListener('mousedown', e => { isDragging = true; e.preventDefault(); });
    document.addEventListener('mousemove', e => { if (isDragging) handleJoystickMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup', () => { 
        if (isDragging) { 
            isDragging = false; 
            updateJoystickPosition(0, 0); 
            currentDirection = null; 
            updateDirectionIndicators(null); 
            stopRepeatingCommand(); 
        } 
    });

    // Joystick touch events
    joystickStick.addEventListener('touchstart', e => { isDragging = true; e.preventDefault(); });
    document.addEventListener('touchmove', e => { 
        if (isDragging) { 
            handleJoystickMove(e.touches[0].clientX, e.touches[0].clientY); 
            e.preventDefault(); 
        } 
    });
    document.addEventListener('touchend', () => { 
        if (isDragging) { 
            isDragging = false; 
            updateJoystickPosition(0, 0); 
            currentDirection = null; 
            updateDirectionIndicators(null); 
            stopRepeatingCommand(); 
        } 
    });

    // Keyboard controls
    const keyMap = { 
        'ArrowUp': 'F', 'w': 'F', 'W': 'F', 
        'ArrowDown': 'B', 's': 'B', 'S': 'B', 
        'ArrowLeft': 'L', 'a': 'L', 'A': 'L', 
        'ArrowRight': 'R', 'd': 'R', 'D': 'R' 
    };
    const keysPressed = new Set();
    
    document.addEventListener('keydown', e => { 
        const dir = keyMap[e.key]; 
        if (dir && !keysPressed.has(e.key)) { 
            keysPressed.add(e.key); 
            currentDirection = dir; 
            updateDirectionIndicators(dir); 
            startRepeatingCommand(dir); 
        } 
    });
    
    document.addEventListener('keyup', e => { 
        if (keyMap[e.key]) { 
            keysPressed.delete(e.key); 
            if (keysPressed.size === 0) { 
                currentDirection = null; 
                updateDirectionIndicators(null); 
                stopRepeatingCommand(); 
            } 
        } 
    });

    // Initialize canvas and settings
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    updateMode();
});

// ============================================================================
// EXPORTS (for modular use)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendCmd,
        sendCmdRaw,
        toggleRhythmicDance,
        updateRobotVisualization
    };
}
