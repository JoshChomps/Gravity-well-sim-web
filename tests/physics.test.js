// Physics checks for js/physics.js, run with Node's built-in test runner:
//   npm install && npm test
// No browser or WebGL is needed: three.js objects are created but never rendered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G } from '../js/config.js';
import { GravitySimulator } from '../js/physics.js';

function makeSim(bodies) {
    const sim = new GravitySimulator(new THREE.Scene(), null);
    for (const [pos, vel, mass, radius] of bodies) {
        sim.createPlanet(pos, vel, mass, radius, [1, 1, 1]);
    }
    const forces = sim.calculateForces();
    sim.planets.forEach((p, i) => p.acceleration.copy(forces[i]).divideScalar(p.mass));
    return sim;
}

function momentum(sim) {
    const total = new THREE.Vector3();
    for (const p of sim.planets) total.addScaledVector(p.velocity, p.mass);
    return total;
}

function energy(sim) {
    let e = 0;
    for (const p of sim.planets) e += 0.5 * p.mass * p.velocity.lengthSq();
    for (let i = 0; i < sim.planets.length; i++) {
        for (let j = i + 1; j < sim.planets.length; j++) {
            const a = sim.planets[i];
            const b = sim.planets[j];
            e -= (G * a.mass * b.mass) / a.position.distanceTo(b.position);
        }
    }
    return e;
}

function circularOrbit(r = 10, centralMass = 500) {
    const v = Math.sqrt((G * centralMass) / r);
    const sim = makeSim([
        [[0, 0, 0], [0, 0, 0], centralMass, 1],
        [[r, 0, 0], [0, 0, v], 1e-3, 0.1],
    ]);
    return { sim, r, v };
}

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('two-body force matches Newton', () => {
    const sim = makeSim([[[0, 0, 0], [0, 0, 0], 100, 0.5], [[4, 0, 0], [0, 0, 0], 10, 0.5]]);
    const [f0, f1] = sim.calculateForces();
    const expected = (G * 100 * 10) / 16;
    close(f0.x, expected, 1e-12, 'force on body 0');
    close(f1.x, -expected, 1e-12, 'force on body 1');
});

test('forces sum to zero', () => {
    const bodies = [];
    for (let i = 0; i < 8; i++) {
        bodies.push([[Math.sin(i) * 20, Math.cos(i * 1.7) * 20, i * 3 - 10], [0, 0, 0], 1 + i * 10, 0.1]);
    }
    const total = new THREE.Vector3();
    for (const f of makeSim(bodies).calculateForces()) total.add(f);
    assert.ok(total.length() < 1e-9, `net force ${total.length()}`);
});

test('momentum is conserved', () => {
    const sim = makeSim([
        [[-4, 0, 0], [0, 0, 1.2], 300, 0.5],
        [[4, 0, 0], [0, 0.3, -1.0], 200, 0.5],
        [[0, 2, 12], [1.5, 0, 0], 10, 0.3],
    ]);
    const before = momentum(sim);
    for (let i = 0; i < 2000; i++) sim.update(0.01);
    assert.equal(sim.planets.length, 3, 'bodies merged; the test needs a collision-free setup');
    assert.ok(momentum(sim).distanceTo(before) < 1e-9);
});

test('circular orbit keeps its radius and energy over one period', () => {
    const { sim, r, v } = circularOrbit();
    const start = energy(sim);
    const steps = Math.floor((2 * Math.PI * r) / v / 0.01);
    let worst = 0;
    for (let i = 0; i < steps; i++) {
        sim.update(0.01);
        worst = Math.max(worst, Math.abs(sim.planets[1].position.distanceTo(sim.planets[0].position) - r));
    }
    assert.ok(worst / r < 0.01, `radius drifted by ${worst}`);
    assert.ok(Math.abs(energy(sim) - start) / Math.abs(start) < 1e-4, 'energy drifted');
});

test('paused simulation does not move', () => {
    const { sim } = circularOrbit();
    sim.paused = true;
    const before = sim.planets[1].position.clone();
    sim.update(0.1);
    assert.ok(sim.planets[1].position.equals(before));
});

test('large frame times are clamped to 0.05 s', () => {
    const a = circularOrbit().sim;
    const b = circularOrbit().sim;
    a.update(5);
    b.update(0.05);
    assert.ok(a.planets[1].position.distanceTo(b.planets[1].position) < 1e-12);
});

test('time scale multiplies the step', () => {
    const a = circularOrbit().sim;
    const b = circularOrbit().sim;
    b.timeScale = 2;
    a.update(0.02);
    b.update(0.01);
    assert.ok(a.planets[1].position.distanceTo(b.planets[1].position) < 1e-12);
});

test('merge conserves mass, momentum, centre of mass and volume', () => {
    const sim = makeSim([[[0, 0, 0], [1, 0, 0], 30, 1.0], [[1.5, 0, 0], [-2, 1, 0], 10, 0.8]]);
    const p = momentum(sim);
    const com = new THREE.Vector3();
    for (const b of sim.planets) com.addScaledVector(b.position, b.mass / 40);
    let mergedEvents = 0;
    sim.onPlanetsMerged = () => mergedEvents++;
    sim.handleCollisions();
    assert.equal(sim.planets.length, 1);
    assert.equal(mergedEvents, 1);
    const m = sim.planets[0];
    close(m.mass, 40, 1e-12, 'mass');
    assert.ok(m.velocity.clone().multiplyScalar(m.mass).distanceTo(p) < 1e-9, 'momentum');
    assert.ok(m.position.distanceTo(com) < 1e-12, 'centre of mass');
    close(m.radius ** 3, 1 + 0.8 ** 3, 1e-9, 'volume');
});

test('selection moves to the merged body', () => {
    const sim = makeSim([[[0, 0, 0], [0, 0, 0], 5, 1], [[0.5, 0, 0], [0, 0, 0], 50, 1]]);
    sim.selectedPlanetId = sim.planets[0].id;
    sim.handleCollisions();
    assert.equal(sim.selectedPlanetId, sim.planets[0].id);
});
