# AyeCNSe Robot Control Interface - Architecture

**Copyright (c) 2026 Abhishek Choudhary**

## System Architecture Overview

This document describes the layered architecture of the AyeCNSe Robot Control Interface, designed for extensibility, educational progression, and BCI integration.

## Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Digital Twin (Visualization)                  │
│  - SE(2) kinematics                                     │
│  - Smooth rotation with inertia                         │
│  - Independent of physical robot state                  │
└─────────────────────────────────────────────────────────┘
                           ↑
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Transport & Real-Time Mediation               │
│  - HTTP GET protocol (/cmd endpoint)                    │
│  - Sequence number management                           │
│  - Rate limiting (dance mode)                           │
│  - Same-origin / Custom host modes                      │
└─────────────────────────────────────────────────────────┘
                           ↑
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Intent Abstraction                            │
│  - Joystick (proportional + discrete)                   │
│  - Keyboard control                                     │
│  - Rhythmic dance (tāla-aware)                          │
│  - BCI placeholder (MindWave ready)                     │
└─────────────────────────────────────────────────────────┘
                           ↑
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Kinematics & Mixers                           │
│  - Differential drive math                              │
│  - Proportional control with time-slicing               │
│  - Dead zone handling                                   │
│  - PWM scaling based on magnitude                       │
└─────────────────────────────────────────────────────────┘
                           ↑
┌─────────────────────────────────────────────────────────┐
│  Layer 0: Physical HAL (Hardware Abstraction)           │
│  - Arduino UNO + L293D                                  │
│  - ESP32 + L298N                                        │
│  - Future: Stepper motors, servos, relays              │
└─────────────────────────────────────────────────────────┘
```

## Layer 0: Physical HAL

### Purpose
Make hardware details irrelevant to upper layers.

### Responsibilities
- Motor driver abstraction (L293D vs L298N)
- PWM generation
- Direction control (H-bridge logic)
- Safety limits (current, voltage)

### API Contract
```
Command: <direction>,<duration>,<pwm>
Response: "OK" | "ERROR"
```

### Supported Hardware

#### Arduino UNO + L293D Shield
- Simple plug-and-play
- Educational-grade
- Current limit: ~600mA per channel
- Suitable for small DC motors

#### ESP32 + L298N Module
- Higher current capacity (~2A per channel)
- Built-in WiFi
- More complex wiring
- Recommended for ages 16+

### Future Extensions
- Stepper motor control (4-6 DoF arms)
- Servo control (grippers)
- Relay boards (high-current loads)
- Omni-wheel mixing

## Layer 1: Kinematics & Mixers

### Differential Drive Model

For a robot with two independently driven wheels:

```
v_linear = (v_left + v_right) / 2
v_angular = (v_right - v_left) / wheelbase
```

### Proportional Joystick Mixing

**Input:** 2D joystick position (x, y) normalized to [-1, 1]

**Process:**
1. Calculate magnitude: `r = sqrt(x² + y²)`
2. Apply deadzone filter
3. Compute weights: `w_fb = |y| / (|x| + |y|)`, `w_lr = |x| / (|x| + |y|)`
4. Split duration: `t_fb = total_duration * w_fb`, `t_lr = total_duration * w_lr`
5. Scale PWM by magnitude: `pwm = r * 255`

**Output:** Time-sliced commands
```javascript
sendCmdRaw('F', 150, 200);  // Forward for 150ms at PWM 200
setTimeout(() => {
  sendCmdRaw('R', 50, 200); // Right for 50ms at PWM 200
}, 150);
```

This enables smooth curved motion from a differential drive platform.

### Dead Zone

Prevents jitter near center:
```javascript
const DEADZONE = 0.08;  // 8% of full range
if (magnitude < DEADZONE) {
  sendCmd('S');  // Stop
  return;
}
```

## Layer 2: Intent Abstraction

### Design Principle

**Intent ≠ Command**

This layer translates human intent into robot-specific commands without requiring the user to understand differential drive mechanics.

### Input Modalities

#### 1. Joystick (Proportional)
- Continuous 2D input
- Magnitude → speed
- Angle → direction mix
- Hold behavior → continuous motion

#### 2. Keyboard (Discrete)
- WASD / Arrow keys
- Fixed duration per key press
- Hold behavior → repeated commands
- Simple mental model

#### 3. Rhythmic Dance (Tāla-Aware)
- Web Audio API beat detection
- Focus on low-mid frequencies (percussion)
- Adaptive threshold
- Cycle-aware direction changes

**Algorithm:**
```javascript
energy = avgEnergy(lowMidFrequencies);
if (energy > threshold * ACCENT_MULTIPLIER) {
  onBeat();  // Accent movement
}
if (energy > threshold * 1.1) {
  microMove();  // Thirkan (continuous subtle movement)
}
```

#### 4. BCI (Future)
- NeuroSky MindWave integration
- Attention → PWM gain modulation
- Meditation → motion smoothing
- Blink → mode switch
- Sustained focus → autonomous behaviors

### Mode Switching

Intent sources are exclusive (except BCI, which modulates):
```javascript
if (isDancingRhythmic) {
  // Dance mode overrides manual control
  return;
}
```

## Layer 3: Transport & Real-Time Mediation

### Protocol Specification

#### Request Format
```
GET /cmd?data=<direction>,<duration>,<pwm>&seq=<sequence>
```

#### Parameters
- `direction`: F | B | L | R | S
- `duration`: milliseconds (50-5000 typical)
- `pwm`: 0-255 (motor speed)
- `seq`: monotonically increasing integer

#### Response
```
HTTP 200 OK
Content-Type: text/plain

OK
```

### Sequence Number Purpose

1. **Uniqueness**: Prevents web caching from hiding repeated commands
2. **Causality**: Establishes clear ordering
3. **Debugging**: Enables command trace analysis
4. **Multi-robot**: Each robot can track its own sequence

### Rate Limiting (Dance Mode)

```javascript
const MIN_DANCE_CMD_GAP = 60;  // ms
if (now - lastDanceCmdTime < MIN_DANCE_CMD_GAP) {
  return;  // Skip this command
}
```

Prevents command queue overflow during high-frequency dance movements.

### Network Modes

#### Same Origin
- Interface served from robot's web server
- No CORS issues
- Simplest deployment
- URL: `/cmd`

#### Custom Host
- Interface on different machine
- Requires CORS headers on robot
- Flexible testing/deployment
- URL: `http://<robot-ip>:<port>/cmd`

## Layer 4: Digital Twin

### Purpose
Provide immediate visual feedback independent of network latency or robot state.

### Kinematics Model

**State:** `(x, y, θ)` in SE(2) (Special Euclidean group in 2D)

**Update rules:**
```javascript
// Rotation commands
if (dir === 'L') targetRotation -= TURN_STEP;
if (dir === 'R') targetRotation += TURN_STEP;

// Translation commands
if (dir === 'F') {
  x += sin(θ) * MOVE_STEP;
  y -= cos(θ) * MOVE_STEP;  // Y inverted in screen coordinates
}
if (dir === 'B') {
  x -= sin(θ) * MOVE_STEP;
  y += cos(θ) * MOVE_STEP;
}
```

### Smooth Rotation

Instead of instant rotation, use angular interpolation:
```javascript
let delta = ((targetRotation - visualRotation + 540) % 360) - 180;
visualRotation += delta * ROT_SMOOTH;  // ROT_SMOOTH = 0.35
```

This creates natural-looking motion.

### Jitter for Realism

Small random displacement simulates physical vibration:
```javascript
const jitterX = Math.random() * 2 - 1;
const jitterY = Math.random() * 2 - 1;
robot.style.transform = 
  `translate(${robotX + jitterX}px, ${robotY + jitterY}px) 
   rotate(${visualRotation}deg)`;
```

### Wheel Animation

CSS-based wheel spin synced to movement:
```css
.robot.moving .robot-wheel {
  animation-play-state: running;
}

@keyframes wheelSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

## Cross-Layer Concerns

### Error Handling

Each layer handles errors appropriate to its abstraction level:

- **Layer 0**: Hardware faults → safe state (motors off)
- **Layer 1**: Invalid kinematics → clamp to valid range
- **Layer 2**: Lost input device → graceful fallback
- **Layer 3**: Network timeout → retry or alert
- **Layer 4**: Rendering error → continue without visualization

### Logging

Selective logging to prevent UI overload:
```javascript
function log(msg) {
  if (isDancingRhythmic) return;  // Suppress during dance
  // ... log to UI
}
```

Dance mode can generate 15+ commands/second, which would make the log unreadable.

### State Synchronization

The digital twin is **intentionally** not synchronized with the physical robot. This is a design choice:

**Advantages:**
- Zero latency visual feedback
- Works offline for testing
- Educational: shows "ideal" motion vs actual

**Disadvantages:**
- Drift accumulates over time
- No obstacle awareness
- No correction from sensors

For production systems requiring state sync, add telemetry:
```javascript
// Future: periodic state updates from robot
GET /state → { x, y, theta, battery, ... }
```

## Educational Progression

### Stage 0: Pure Mechanics
- No software
- Battery + switch
- Understand physical constraints

### Stage 1: Discrete Commands
- Keyboard only
- Fixed duration/speed
- Mental model: "press key → robot moves"

### Stage 2: Proportional Control
- Joystick introduced
- Variable speed
- Understanding magnitude vs direction

### Stage 3: Multi-Modal
- Add rhythmic dance
- Understanding context-switching
- Sensor-driven behavior

### Stage 4: BCI Integration
- Neuro-modulation
- Intent amplification
- Assistive technology concepts

## Future Architecture Extensions

### AyeCNSe Network Integration

When registered on AyeCNSe:
```
┌─────────────────────────────────────┐
│  AyeCNSe Cognitive Layer            │
│  - Model zoo access                 │
│  - Semantic behaviors               │
│  - Language → intent (ILM)          │
│  - Multi-robot coordination         │
└─────────────────────────────────────┘
           ↓
    Existing Layers
```

### Sensor Fusion

Add perception layer:
```
Sensors (lidar, ultrasonic, camera)
    ↓
Perception Processing
    ↓
Intent Abstraction (merge with user intent)
    ↓
Kinematics & Mixers
```

### Multi-Robot Swarms

Extend transport layer:
```javascript
// Broadcast command to robot group
sendCmdToGroup(['robot1', 'robot2'], 'F', 1000, 255);

// Coordinated formations
formationControl({
  shape: 'line',
  spacing: 0.5,  // meters
  robots: robotGroup
});
```

## Performance Characteristics

### Latency Budget

- Joystick input → command sent: <10ms
- Command sent → robot ACK: 50-200ms (network dependent)
- Digital twin update: <5ms
- Beat detection cycle: 12ms (83Hz)

### Throughput

- Manual control: 4 commands/sec (REPEAT_INTERVAL = 250ms)
- Dance mode: up to 16 commands/sec (MIN_DANCE_CMD_GAP = 60ms)
- Theoretical max (network): ~100 commands/sec

### Memory Footprint

- JavaScript heap: ~2MB
- Audio buffers: ~4MB (dance mode)
- DOM: ~1MB
- Total: <10MB

## Security Considerations

### Input Validation

All user inputs are sanitized:
```javascript
const duration = Math.max(50, Math.min(5000, parseInt(durationInput)));
const pwm = Math.max(0, Math.min(255, parseInt(pwmInput)));
```

### Network Security

- No authentication (assumes trusted network)
- For production: add token-based auth
- Consider HTTPS for sensitive deployments

### Robot Safety

- PWM limits prevent motor damage
- Duration limits prevent overheating
- Stop command ('S') always available
- No stored state (stateless protocol)

## Testing Strategy

### Unit Testing
- Kinematics functions (Layer 1)
- Beat detection algorithm (Layer 2)
- Sequence number generation (Layer 3)

### Integration Testing
- Mock robot server
- Simulated sensor data
- End-to-end command flow

### Hardware-in-Loop
- Real robot + test scripts
- Measure actual vs expected motion
- Calibrate digital twin parameters

## Conclusion

This architecture balances:
- **Simplicity** (for education)
- **Extensibility** (for research)
- **Performance** (for real-time control)
- **Modularity** (for multi-platform deployment)

Each layer has clear responsibilities and can be upgraded independently, supporting the full educational progression from plastic kit to cognitive robot systems.

---

**Copyright (c) 2026 Abhishek Choudhary**  
Part of the AyeCNSe Physical AI Platform
