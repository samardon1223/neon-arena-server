# 🕹️ Neon Arena | 2D Multiplayer Arcade Game

A fast-paced, real-time multiplayer browser game built on a high-performance canvas rendering pipeline. This project showcases state-driven gameplay loops, modular client-side logic, and responsive 2D physics architectures.

---

## 🚀 Core Features

* **Real-Time State Loop:** Architected with structural state machine configurations to ensure seamless asset pipeline loading and precise real-time canvas UI score tracking.
* **Rigid Tile-Map Collisions:** Implemented optimized, low-overhead physics collision matrices managing rapid actor interactions across structured tile layouts.
* **Performance-Optimized Canvas Profiles:** Engine rendering configurations tuned specifically to maximize browser framerates and minimize draw calls.

---

## 🛠️ Technical Stack

* **Engine Framework:** Phaser Framework
* **Language:** JavaScript (ES6+) / HTML5 Canvas
* **Architecture:** State Machine Logic, Modular Component Scripts

---

## 💻 Code Architecture Highlights

The project focuses heavily on decoupling core rendering systems from gameplay logic handlers:

### 1. Game State & Asset Pipeline
Leverages Phaser’s native scene lifecycle (`preload`, `create`, `update`) configured with customized texture atlas mapping to eliminate asset loading bottlenecks mid-match.

### 2. Physical Boundary Management
Utilizes a rigid tile-map collision layer map, checking vector intersections dynamically on every engine tick to guarantee glitch-free player boundaries.

---

## 🏃 Local Development Setup

To run this project locally on your machine for testing or debugging:

1. Clone the repository:
```bash
   git clone [https://github.com/samardon1223/neon-arena.git](https://github.com/samardon1223/neon-arena.git)
   ```

2. Open the directory in your code editor (e.g., VS Code).

3. Run a local development server (such as the Live Server extension in VS Code, or using `npx local-server`).

4. Launch your browser and navigate to the local host port (usually `http://127.0.0.1:5500`).
