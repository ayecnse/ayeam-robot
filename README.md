# AyeCNSe Robot Control Interface

**Copyright (c) 2026 Abhishek Choudhary**

Part of the AyeCNSe Physical AI Platform  
https://icansee.life

## Overview

A production-grade web-based control interface for differential drive robots with support for multiple control modalities, rhythmic dance synchronization, and digital twin visualization.

### Key Features

- **Multi-Modal Control**
  - Proportional joystick (mouse/touch)
  - Keyboard control (WASD/Arrows)
  - Rhythmic dance mode (tāla-aware audio synchronization)
  - BCI-ready architecture (MindWave integration planned)

- **Layered Architecture**
  - Layer 0: Physical HAL abstraction
  - Layer 1: Kinematics & Mixers (differential drive, proportional control)
  - Layer 2: Intent Abstraction
  - Layer 3: Transport & Real-Time Mediation
  - Layer 4: Digital Twin visualization

- **Hardware Support**
  - Arduino UNO + L293D Motor Shield
  - ESP32 + L298N Motor Driver
  - 2WD/4WD differential drive robots
  - Expandable to servo grippers, robot arms, omni-wheels

## Quick Start

### Basic Usage

1. Open `index.html` in a modern web browser
2. Click the settings gear icon (⚙️)
3. Configure connection mode:
   - **Same Origin**: For robot server on same host
   - **Custom Host**: Enter your robot's URL (e.g., `http://192.168.1.100:8080`)
4. Adjust duration (ms) and PWM speed (0-255)
5. Control your robot using:
   - **Joystick**: Click and drag the circular control
   - **Keyboard**: Use WASD or arrow keys
   - **Dance Mode**: Click "Start Rhythmic Dance" and enable microphone

### Rhythmic Dance Mode

The rhythmic dance feature implements tāla-aware movement synchronized to audio input:

1. Click "Start Rhythmic Dance"
2. Allow microphone access when prompted
3. Play music or perform live (Bharatanatyam, Carnatic, tabla, any rhythmic audio)
4. Robot moves:
   - **On each beat**: Small movements (thirkan)
   - **On accents**: Larger movements with kickback
   - **On cycle boundaries**: Direction changes

**Technical Details:**
- Focuses on low-mid frequency transients (percussion/bass)
- Adaptive threshold based on energy history
- Configurable cycle length (default: 8 beats)
- Rate-limited to prevent command overflow

## Architecture

### Command Protocol

Commands are sent as HTTP GET requests:

```
GET /cmd?data=<direction>,<duration>,<pwm>&seq=<sequence>
```

**Parameters:**
- `direction`: F (forward), B (backward), L (left), R (right), S (stop)
- `duration`: Motion duration in milliseconds
- `pwm`: Motor speed (0-255)
- `seq`: Monotonically increasing sequence number

**Example:**
```
GET /cmd?data=F,1000,255&seq=42
```

### Proportional Control

The joystick implements time-sliced command mixing:

1. 2D joystick position → normalized X,Y coordinates
2. Calculate magnitude (r) and angle
3. Compute F/B and L/R weights based on angle
4. Split total duration proportionally
5. Send F/B command, then L/R command after delay

This enables smooth curved motion from a differential drive robot.

### Digital Twin

The on-screen robot visualization implements:
- SE(2) kinematics (position + rotation)
- Smooth angular interpolation
- Configurable inertia and speed scaling
- Independent of physical robot state (open-loop)

## Configuration

### Connection Modes

**Same Origin Mode:**
- Robot server runs on same host as web interface
- Use when interface is served from robot's web server

**Custom Host Mode:**
- Robot server on different machine
- Enter full URL including protocol and port
- Example: `http://192.168.1.100:8080`

### Tuning Parameters

Edit these constants in `src/ayecnse-robot-control.js`:

```javascript
const ACCENT_MULTIPLIER = 2.2;  // Beat detection threshold
const MIN_DANCE_CMD_GAP = 60;   // Min ms between dance commands
const REPEAT_INTERVAL = 250;    // Manual control repeat rate
```

Digital twin visualization:
```javascript
const MOVE_STEP = 10;      // Pixels per move command
const TURN_STEP = 18;      // Degrees per turn command
const ROT_SMOOTH = 0.35;   // Angular inertia (0-1)
```

## Hardware Setup

### Arduino UNO + L293D Shield

```
Arduino UNO
├── L293D Motor Shield
│   ├── M1: Left Motor
│   ├── M2: Right Motor
│   └── Power: 6-12V battery
└── WiFi Shield or USB connection
```

**Firmware requirements:**
- `/cmd` endpoint handler
- Parse `data` parameter: `<dir>,<duration>,<pwm>`
- Set motor speeds via L293D
- Return "OK" on success

### ESP32 + L298N

```
ESP32
├── L298N Module
│   ├── IN1, IN2: Left motor control
│   ├── IN3, IN4: Right motor control
│   ├── ENA, ENB: PWM inputs
│   └── 12V power supply
└── Built-in WiFi
```

Recommended for ages 16+ due to wiring complexity.

## API Reference

### JavaScript API

```javascript
// Send discrete command
sendCmd('F');  // Forward with current settings

// Send raw command (low-level)
sendCmdRaw('F', 500, 200);  // Forward, 500ms, PWM=200

// Toggle rhythmic dance
toggleRhythmicDance();

// Update digital twin
updateRobotVisualization('F');
```

### Events

The library fires custom events (planned):
- `robotConnected`: When robot responds
- `beatDetected`: When dance mode detects a beat
- `commandSent`: When command is dispatched

## Educational Roadmap

### Stage 0: Plastic Kit (Ages 8+)
- Battery + switch only
- No programming required
- Understand mechanical assembly

### Stage 1: Arduino UNO Wired (Ages 12+)
- USB connection to computer
- Learn basic commands
- Introduction to control flow

### Stage 2: Arduino UNO + WiFi (Ages 14+)
- Wireless control
- Network configuration
- Same-origin mode

### Stage 3: ESP32 Only (Ages 16+)
- Advanced build (no shield)
- Custom wiring with L298N
- Higher performance

### Stage 4: Expansion (Ages 16+)
- Add servo gripper
- Sensor integration
- Robot arms (4-6 DoF)

## Advanced Topics

### BCI Integration (Planned)

The architecture is BCI-ready for NeuroSky MindWave integration:

```
EEG → Features → Intent Bias → Existing Pipeline
```

**Proposed mapping:**
- Attention ↑ → Increase PWM gain
- Meditation ↑ → Smooth motion, reduce jitter
- Blink → Mode switch
- Sustained focus → Enable autonomous behaviors
- Loss of signal → Emergency stop

### Multi-Robot Support

The sequence number system supports multiple robots:
- Each robot tracks its own sequence
- Commands are idempotent
- No server-side state required

### AyeCNSe Network Integration

When registered on the AyeCNSe network:
- Physical AI capabilities become available
- Model zoo access
- Cognitive behaviors
- Language → intent mapping (ILM)
- "The robot comes to life"

## File Structure

```
ayecnse-robot-control/
├── index.html                  # Main interface
├── src/
│   └── ayecnse-robot-control.js   # Core library
├── examples/
│   ├── arduino-uno/            # Arduino sketches
│   ├── esp32/                  # ESP32 firmware
│   └── python-simulator/       # Testing simulator
├── docs/
│   ├── API.md                  # API documentation
│   ├── HARDWARE.md             # Hardware setup guides
│   └── ARCHITECTURE.md         # System architecture
├── README.md                   # This file
└── LICENSE.txt                 # License information
```

## Browser Compatibility

**Supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Required Features:**
- Web Audio API (for rhythmic dance)
- Touch events (for mobile)
- Fetch API
- ES6+ JavaScript

## Contributing

This is part of the AyeCNSe Physical AI Platform research initiative.

**Areas of focus:**
- Linguistic equity (ILM integration)
- Accessibility (inclusive control modalities)
- Educational scalability
- Neuro-adaptive interfaces

## Related Projects

- **ILM** (Integrative Linguistic Multiscript): Universal transliteration
- **Hindawi Programming System**: Cultural-authentic AGI development
- **Project VIKRAM**: Advanced compute architectures
- **AyeAM**: Autonomous Metaverse / Autonomous Machines
- **AyeAI**: Model zoo and industrial-grade AGI stack

## License

Copyright (c) 2026 Abhishek Choudhary

See LICENSE.txt for full terms.

## Contact

Part of https://icansee.life

**Research Areas:**
- Cognitive Engineering
- Physical AI
- Neuromorphic Systems
- Post-Singularity Humanities
- Staggered Upload (continuity of consciousness)

**Values:**
1. Inclusive, accessible Singularity
2. Resource constraints should not mean compromise
3. Linguistic equity and preservation of human agency

---

*This interface represents 20+ years of research in Physical AI, cognitive systems, and inclusive technology design. Not a "read up yesterday" project.*
