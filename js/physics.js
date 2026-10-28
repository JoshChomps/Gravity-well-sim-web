import * as THREE from 'three';
import { G } from './config.js';
import { Planet } from './models.js';

export class GravitySimulator {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.planets = [];
        this.planetCounter = 0;

        this.paused = false;
        this.timeScale = 1.0;
        this.selectedPlanetId = null;

        this.onPlanetsMerged = null; // Callback for UI
    }

    createPlanet(position, velocity, mass, radius, colorArray, name = null) {
        this.planetCounter++;
        if (!name) name = `Planet ${this.planetCounter}`;
        if (!colorArray) {
            const c = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
            colorArray = [c.r, c.g, c.b];
        }

        const planet = new Planet(position, velocity, mass, radius, colorArray, name, this.planetCounter);
        planet.initVisuals(this.scene);
        this.addPlanet(planet);
        return planet;
    }

    addPlanet(planet) {
        this.planets.push(planet);
    }

    getPlanetById(id) {
        return this.planets.find(p => p.id === id);
    }

    removePlanetById(id) {
        const index = this.planets.findIndex(p => p.id === id);
        if (index !== -1) {
            const planet = this.planets[index];
            planet.dispose(this.scene);
            this.planets.splice(index, 1);
            if (this.selectedPlanetId === id) {
                this.selectedPlanetId = null;
            }
        }
    }

    clearPlanets() {
        this.planets.forEach(p => p.dispose(this.scene));
        this.planets = [];
        this.planetCounter = 0;
        this.selectedPlanetId = null;
    }

    calculateForces() {
        const forces = [];
        for (let i = 0; i < this.planets.length; i++) {
            forces.push(new THREE.Vector3());
        }

        for (let i = 0; i < this.planets.length; i++) {
            const p1 = this.planets[i];
            for (let j = i + 1; j < this.planets.length; j++) {
                const p2 = this.planets[j];

                const r = new THREE.Vector3().subVectors(p2.position, p1.position);
                const dist = r.length();

                if (dist < p1.radius + p2.radius) continue;

                const forceMag = (G * p1.mass * p2.mass) / (dist * dist);
                const forceVec = r.normalize().multiplyScalar(forceMag);

                forces[i].add(forceVec);
                forces[j].sub(forceVec); // Newton's 3rd Law
            }
        }
        return forces;
    }

    handleCollisions() {
        let collisionOccurred = true;

        while (collisionOccurred) {
            collisionOccurred = false;
            for (let i = 0; i < this.planets.length; i++) {
                for (let j = i + 1; j < this.planets.length; j++) {
                    const p1 = this.planets[i];
                    const p2 = this.planets[j];

                    const distSq = p1.position.distanceToSquared(p2.position);
                    const minDist = p1.radius + p2.radius;

                    if (distSq < minDist * minDist) {
                        // Merge them
                        const newMass = p1.mass + p2.mass;
                        const newRadius = Math.pow(Math.pow(p1.radius, 3) + Math.pow(p2.radius, 3), 1 / 3);

                        let newVel = new THREE.Vector3();
                        let newPos = new THREE.Vector3();

                        if (newMass > 0) {
                            newVel.copy(p1.velocity).multiplyScalar(p1.mass)
                                .add(p2.velocity.clone().multiplyScalar(p2.mass))
                                .divideScalar(newMass);
                            newPos.copy(p1.position).multiplyScalar(p1.mass)
                                .add(p2.position.clone().multiplyScalar(p2.mass))
                                .divideScalar(newMass);
                        } else {
                            newPos.copy(p1.position).add(p2.position).multiplyScalar(0.5);
                        }

                        // Color blending
                        const c1 = [p1.color.r, p1.color.g, p1.color.b];
                        const c2 = [p2.color.r, p2.color.g, p2.color.b];
                        const newColor = [
                            (c1[0] * p1.mass + c2[0] * p2.mass) / newMass,
                            (c1[1] * p1.mass + c2[1] * p2.mass) / newMass,
                            (c1[2] * p1.mass + c2[2] * p2.mass) / newMass,
                        ];

                        const name = p1.mass >= p2.mass ? p1.name : p2.name;

                        // Create merged planet
                        const newPlanet = this.createPlanet(
                            [newPos.x, newPos.y, newPos.z],
                            [newVel.x, newVel.y, newVel.z],
                            newMass, newRadius, newColor, name
                        );

                        // Handle selection transfer
                        let newSelected = false;
                        if (this.selectedPlanetId === p1.id || this.selectedPlanetId === p2.id) {
                            this.selectedPlanetId = newPlanet.id;
                            newSelected = true;
                        }

                        // Remove old
                        const id1 = p1.id;
                        const id2 = p2.id;
                        this.removePlanetById(id1);
                        this.removePlanetById(id2);

                        if (this.onPlanetsMerged) {
                            this.onPlanetsMerged(newPlanet, newSelected);
                        }

                        collisionOccurred = true;
                        break; // Inner loop
                    }
                }
                if (collisionOccurred) break; // Outer loop
            }
        }
    }

    update(dt) {
        if (this.paused) return;

        // Use a fixed max dt to avoid exploding physics on lag
        const clampedDt = Math.min(dt, 0.05) * this.timeScale;

        // Velocity Verlet
        // 1. Position update and half velocity update
        for (const p of this.planets) {
            p.position.addScaledVector(p.velocity, clampedDt)
                .addScaledVector(p.acceleration, 0.5 * clampedDt * clampedDt);
            p.velocity.addScaledVector(p.acceleration, 0.5 * clampedDt);
        }

        // 1.5 Handle Collisions
        this.handleCollisions();

        // 2. Calculate forces
        const forces = this.calculateForces();

        // 3. Second half velocity update and acceleration update
        for (let i = 0; i < this.planets.length; i++) {
            const p = this.planets[i];
            const force = forces[i];

            const newAcc = p.mass > 0 ? force.clone().divideScalar(p.mass) : new THREE.Vector3();
            p.velocity.addScaledVector(newAcc, 0.5 * clampedDt);
            p.acceleration.copy(newAcc);
        }
    }

    updateVisuals(camera) {
        // Selection state
        for (const p of this.planets) {
            if (p.selectionRing) {
                p.selectionRing.visible = (p.id === this.selectedPlanetId);
            }
            p.updateVisuals(camera);
        }
    }
}
