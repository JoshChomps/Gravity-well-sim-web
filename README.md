# 3D Gravity Simulator (WebGL Edition)

A high-performance WebGL port of the original PyOpenGL 3D Gravity Simulator, rewritten in native JavaScript and Three.js. It features a complete physics engine with Velocity Verlet integration, real-time N-body gravity solving, and a dynamic spacetime-curvature grid.

## How to Run Locally

Because modern web browsers block loading ES6 JavaScript modules directly from the local filesystem (`file://`) for security reasons, you must run a simple local web server to view the application.

### The Easy Way (Windows)
Simply double-click the `run.bat` file in your file explorer. This will automatically start a local server and open your default web browser to the correct page.

### The Command Line Way
If you prefer to run it manually from the terminal, navigate to this project's folder and execute:

```bash
python server.py
```

Then, open your web browser and navigate to:
**http://127.0.0.1:8080**

*(Note: The `server.py` script is a custom Python HTTP server designed to explicitly disable browser caching, which is extremely helpful when making live code edits).*

## Tests

The physics in `js/physics.js` (forces, Velocity Verlet, collisions and merges) is tested with Node's built-in test runner. Nothing is rendered, so no browser is needed:

```bash
npm install
npm test
```

## Deployment

This version consists entirely of static HTML, CSS, and JS files. There is no backend or build step required.  

To publish this project to the internet:
1. Push this folder to a GitHub repository.
2. Go to the repository settings.
3. Enable **GitHub Pages** pointing to the `main` branch.
4. Your simulator will be live instantly!
