import * as THREE from 'three';
import { WorldImpl } from '../engine/ecs/World';
import { EventBusImpl } from '../engine/core/EventBus';
import { GameTime, TimeScale } from '../engine/core/GameTime';
import { GameLoop } from '../core/GameLoop';
import { CameraController } from '../core/Camera';
import { InputManager } from '../core/InputManager';
import { PhysicsSystem } from '../engine/systems/PhysicsSystem';
import { NavigationSystem } from '../engine/systems/NavigationSystem';
import { SensorSystem } from '../engine/systems/SensorSystem';
import { MissileSystem } from '../engine/systems/MissileSystem';
import { RadarRenderer } from '../rendering/RadarRenderer';
import { ShipRenderer } from '../rendering/ShipRenderer';
import { CelestialRenderer } from '../rendering/CelestialRenderer';
import { TrailRenderer } from '../rendering/TrailRenderer';
import { MissileRenderer } from '../rendering/MissileRenderer';
import { CommandHandler } from './CommandHandler';
import {
  Position,
  Velocity,
  Ship,
  Thruster,
  CelestialBody,
  Selectable,
  RotationState,
  ThermalSignature,
  SensorArray,
  ContactTracker,
  MissileLauncher,
  COMPONENT,
} from '../engine/components';

export class SpaceWarGame {
  readonly world = new WorldImpl();
  readonly eventBus = new EventBusImpl();
  readonly gameTime = new GameTime();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: CameraController;
  private input!: InputManager;
  private gameLoop!: GameLoop;

  private physicsSystem = new PhysicsSystem();
  private navigationSystem = new NavigationSystem();
  private sensorSystem = new SensorSystem(30, this.eventBus);
  private missileSystem = new MissileSystem(this.eventBus);
  private commandHandler!: CommandHandler;
  private radarRenderer!: RadarRenderer;
  private shipRenderer!: ShipRenderer;
  private celestialRenderer!: CelestialRenderer;
  private trailRenderer!: TrailRenderer;
  private missileRenderer!: MissileRenderer;

  // UI elements
  private pausedLabel!: HTMLElement;
  private gameTimeLabel!: HTMLElement;
  private speedButtons!: HTMLButtonElement[];

  constructor(private canvas: HTMLCanvasElement, private container: HTMLElement) {
    this.setupRenderer();
    this.setupUI();
    this.setupInput();
    this.loadDemoScenario();
    this.commandHandler = new CommandHandler(this.world, this.eventBus);

    this.gameLoop = new GameLoop(
      this.gameTime,
      (dt) => this.fixedUpdate(dt),
      (alpha) => this.render(alpha),
    );
  }

  start(): void {
    this.gameLoop.start();
  }

  private setupRenderer(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020408);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new CameraController(aspect);

    this.radarRenderer = new RadarRenderer(this.scene);
    this.shipRenderer = new ShipRenderer(this.scene);
    this.celestialRenderer = new CelestialRenderer(this.scene);
    this.trailRenderer = new TrailRenderer(this.scene);
    this.missileRenderer = new MissileRenderer(this.scene);

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.resize(w / h);
    });
  }

  private setupUI(): void {
    this.pausedLabel = document.getElementById('paused-label')!;
    this.gameTimeLabel = document.getElementById('game-time')!;

    const btnPause = document.getElementById('btn-pause')!;
    const btn1x = document.getElementById('btn-1x')! as HTMLButtonElement;
    const btn2x = document.getElementById('btn-2x')! as HTMLButtonElement;
    const btn4x = document.getElementById('btn-4x')! as HTMLButtonElement;
    this.speedButtons = [btn1x, btn2x, btn4x];

    btnPause.addEventListener('click', () => this.togglePause());
    btn1x.addEventListener('click', () => this.setSpeed(1));
    btn2x.addEventListener('click', () => this.setSpeed(2));
    btn4x.addEventListener('click', () => this.setSpeed(4));

    this.updatePauseUI();
    this.updateSpeedUI();
  }

  private setupInput(): void {
    this.input = new InputManager(this.canvas);

    this.input.onInput((event) => {
      switch (event.type) {
        case 'togglePause':
          this.togglePause();
          break;
        case 'changeSpeed':
          this.cycleSpeed(event.delta);
          break;
        case 'zoom':
          this.camera.zoomBy(event.delta);
          break;
        case 'cameraPanDrag':
          this.camera.panByScreenDelta(
            event.deltaX,
            event.deltaY,
            event.canvasWidth,
            event.canvasHeight,
          );
          break;
        case 'click':
          this.handleClick(event.screenX, event.screenY, event.shiftKey);
          break;
        case 'rightClick':
          this.handleRightClick(event.screenX, event.screenY);
          break;
      }
    });
  }

  private togglePause(): void {
    this.gameTime.togglePause();
    this.updatePauseUI();
  }

  private setSpeed(scale: TimeScale): void {
    this.gameTime.setTimeScale(scale);
    this.updateSpeedUI();
  }

  private cycleSpeed(delta: number): void {
    const scales: TimeScale[] = [1, 2, 4];
    const idx = scales.indexOf(this.gameTime.timeScale);
    const newIdx = Math.max(0, Math.min(scales.length - 1, idx + delta));
    this.setSpeed(scales[newIdx]);
  }

  private updatePauseUI(): void {
    this.pausedLabel.classList.toggle('visible', this.gameTime.paused);
  }

  private updateSpeedUI(): void {
    const scales: TimeScale[] = [1, 2, 4];
    for (let i = 0; i < this.speedButtons.length; i++) {
      this.speedButtons[i].classList.toggle('active', scales[i] === this.gameTime.timeScale);
    }
  }

  private handleClick(screenX: number, screenY: number, shiftKey: boolean): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);

    // Deselect all if not shift-clicking
    if (!shiftKey) {
      for (const id of ships) {
        const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
        sel.selected = false;
      }
    }

    // Find closest ship to click
    let closestId: string | null = null;
    let closestDist = pickRadius;
    for (const id of ships) {
      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const dx = pos.x - worldPos.x;
      const dy = pos.y - worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    if (closestId) {
      const sel = this.world.getComponent<Selectable>(closestId, COMPONENT.Selectable)!;
      sel.selected = !sel.selected || !shiftKey;
    }
  }

  private handleRightClick(screenX: number, screenY: number): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    // Check if we right-clicked on a detected enemy ship
    const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship);
    const playerContacts = this.getPlayerContacts();
    let clickedEnemy: string | null = null;
    let closestDist = pickRadius;

    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction === 'player') continue;

      // Use detected position for enemy ships
      let checkX: number, checkY: number;
      if (playerContacts) {
        const contact = playerContacts.contacts.get(id);
        if (!contact) continue; // can't target undetected ships
        checkX = contact.lastKnownX;
        checkY = contact.lastKnownY;
      } else {
        const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
        checkX = pos.x;
        checkY = pos.y;
      }

      const dx = checkX - worldPos.x;
      const dy = checkY - worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        clickedEnemy = id;
      }
    }

    if (clickedEnemy) {
      this.commandHandler.launchMissile(clickedEnemy, this.gameTime.elapsed);
    } else {
      this.commandHandler.issueMoveTo(worldPos.x, worldPos.y);
    }
  }

  // --- Simulation ---

  private fixedUpdate(dt: number): void {
    this.sensorSystem.update(this.world, dt, this.gameTime.elapsed);
    this.missileSystem.update(this.world, dt, this.gameTime.elapsed);
    this.navigationSystem.update(this.world, dt, this.gameTime.elapsed);
    this.physicsSystem.update(this.world, dt);
    this.trailRenderer.recordPositions(this.world);
    this.missileRenderer.recordPositions(this.world);
  }

  // --- Rendering ---

  private render(alpha: number): void {
    // Camera keyboard panning
    const camMove = this.input.getCameraMovement();
    if (camMove.x !== 0 || camMove.y !== 0) {
      this.camera.pan(camMove.x, camMove.y, 1 / 60);
    }

    const camPos = this.camera.getPosition();
    const zoom = this.camera.getZoom();

    this.radarRenderer.update(camPos.x, camPos.y, zoom);
    this.radarRenderer.updateScaleLabel(zoom, this.container);
    this.celestialRenderer.update(this.world, zoom);
    const playerContacts = this.getPlayerContacts();
    this.shipRenderer.update(this.world, alpha, zoom, playerContacts, this.gameTime.elapsed);
    this.trailRenderer.update(this.world, zoom);
    this.missileRenderer.update(this.world, zoom);

    // Update time display
    this.gameTimeLabel.textContent = this.gameTime.formatElapsed();

    this.renderer.render(this.scene, this.camera.camera);
  }

  private getPlayerContacts(): ContactTracker | undefined {
    const trackerEntities = this.world.query(COMPONENT.ContactTracker);
    for (const id of trackerEntities) {
      const tracker = this.world.getComponent<ContactTracker>(id, COMPONENT.ContactTracker);
      if (tracker && tracker.faction === 'player') return tracker;
    }
    return undefined;
  }

  // --- Demo scenario ---

  loadDemoScenario(): void {
    this.world.clear();

    // Earth-like planet at origin
    const earth = this.world.createEntity();
    this.world.addComponent<Position>(earth, {
      type: 'Position',
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
    });
    this.world.addComponent<CelestialBody>(earth, {
      type: 'CelestialBody',
      name: 'Terra',
      mass: 5.972e24,
      radius: 6371,
      bodyType: 'planet',
    });

    // Player flagship in high orbit
    const flagship = this.world.createEntity();
    this.world.addComponent<Position>(flagship, {
      type: 'Position',
      x: 42000,
      y: 0,
      prevX: 42000,
      prevY: 0,
    });
    // Orbital velocity for ~42000 km orbit
    const orbitalSpeed = Math.sqrt((6.674e-20 * 5.972e24) / 42000);
    this.world.addComponent<Velocity>(flagship, {
      type: 'Velocity',
      vx: 0,
      vy: orbitalSpeed,
    });
    this.world.addComponent<Ship>(flagship, {
      type: 'Ship',
      name: 'TCS Resolute',
      hullClass: 'cruiser',
      faction: 'player',
      flagship: true,
    });
    this.world.addComponent<Thruster>(flagship, {
      type: 'Thruster',
      maxThrust: 0.1,
      thrustAngle: 0,
      throttle: 0,
      rotationSpeed: 0.5,
    });
    this.world.addComponent<Selectable>(flagship, {
      type: 'Selectable',
      selected: false,
    });
    this.world.addComponent<RotationState>(flagship, {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: 0,
      rotating: false,
    });
    this.world.addComponent<ThermalSignature>(flagship, {
      type: 'ThermalSignature', baseSignature: 50, thrustMultiplier: 200,
    });
    this.world.addComponent<SensorArray>(flagship, {
      type: 'SensorArray', maxRange: 500_000, sensitivity: 1e-12,
    });
    this.world.addComponent<MissileLauncher>(flagship, {
      type: 'MissileLauncher',
      salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
      maxRange: 50_000, missileAccel: 0.5, ammo: 24,
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    // Player escort destroyer
    const escort = this.world.createEntity();
    this.world.addComponent<Position>(escort, {
      type: 'Position',
      x: 42500,
      y: 1000,
      prevX: 42500,
      prevY: 1000,
    });
    this.world.addComponent<Velocity>(escort, {
      type: 'Velocity',
      vx: 0,
      vy: orbitalSpeed * 0.99,
    });
    this.world.addComponent<Ship>(escort, {
      type: 'Ship',
      name: 'TCS Vigilant',
      hullClass: 'destroyer',
      faction: 'player',
      flagship: false,
    });
    this.world.addComponent<Thruster>(escort, {
      type: 'Thruster',
      maxThrust: 0.15,
      thrustAngle: 0,
      throttle: 0,
      rotationSpeed: 0.8,
    });
    this.world.addComponent<Selectable>(escort, {
      type: 'Selectable',
      selected: false,
    });
    this.world.addComponent<RotationState>(escort, {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: 0,
      rotating: false,
    });
    this.world.addComponent<ThermalSignature>(escort, {
      type: 'ThermalSignature', baseSignature: 40, thrustMultiplier: 180,
    });
    this.world.addComponent<SensorArray>(escort, {
      type: 'SensorArray', maxRange: 400_000, sensitivity: 2e-12,
    });
    this.world.addComponent<MissileLauncher>(escort, {
      type: 'MissileLauncher',
      salvoSize: 4, reloadTime: 25, lastFiredTime: 0,
      maxRange: 40_000, missileAccel: 0.6, ammo: 16,
      seekerRange: 4_000, seekerSensitivity: 2e-8,
    });

    // Enemy ships approaching from far away
    const enemy1 = this.world.createEntity();
    this.world.addComponent<Position>(enemy1, {
      type: 'Position',
      x: -80000,
      y: 60000,
      prevX: -80000,
      prevY: 60000,
    });
    this.world.addComponent<Velocity>(enemy1, {
      type: 'Velocity',
      vx: 2.0,
      vy: -1.5,
    });
    this.world.addComponent<Ship>(enemy1, {
      type: 'Ship',
      name: 'UES Aggressor',
      hullClass: 'cruiser',
      faction: 'enemy',
      flagship: true,
    });
    this.world.addComponent<Thruster>(enemy1, {
      type: 'Thruster',
      maxThrust: 0.1,
      thrustAngle: 0,
      throttle: 0.3,
      rotationSpeed: 0.5,
    });
    this.world.addComponent<Selectable>(enemy1, {
      type: 'Selectable',
      selected: false,
    });
    this.world.addComponent<RotationState>(enemy1, {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: 0,
      rotating: false,
    });
    this.world.addComponent<ThermalSignature>(enemy1, {
      type: 'ThermalSignature', baseSignature: 50, thrustMultiplier: 200,
    });
    this.world.addComponent<SensorArray>(enemy1, {
      type: 'SensorArray', maxRange: 500_000, sensitivity: 1e-12,
    });
    this.world.addComponent<MissileLauncher>(enemy1, {
      type: 'MissileLauncher',
      salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
      maxRange: 50_000, missileAccel: 0.5, ammo: 24,
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    const enemy2 = this.world.createEntity();
    this.world.addComponent<Position>(enemy2, {
      type: 'Position',
      x: -75000,
      y: 65000,
      prevX: -75000,
      prevY: 65000,
    });
    this.world.addComponent<Velocity>(enemy2, {
      type: 'Velocity',
      vx: 2.2,
      vy: -1.3,
    });
    this.world.addComponent<Ship>(enemy2, {
      type: 'Ship',
      name: 'UES Raider',
      hullClass: 'frigate',
      faction: 'enemy',
      flagship: false,
    });
    this.world.addComponent<Thruster>(enemy2, {
      type: 'Thruster',
      maxThrust: 0.18,
      thrustAngle: 0,
      throttle: 0.3,
      rotationSpeed: 0.9,
    });
    this.world.addComponent<Selectable>(enemy2, {
      type: 'Selectable',
      selected: false,
    });
    this.world.addComponent<RotationState>(enemy2, {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: 0,
      rotating: false,
    });
    this.world.addComponent<ThermalSignature>(enemy2, {
      type: 'ThermalSignature', baseSignature: 30, thrustMultiplier: 150,
    });
    this.world.addComponent<SensorArray>(enemy2, {
      type: 'SensorArray', maxRange: 300_000, sensitivity: 3e-12,
    });
    this.world.addComponent<MissileLauncher>(enemy2, {
      type: 'MissileLauncher',
      salvoSize: 3, reloadTime: 20, lastFiredTime: 0,
      maxRange: 35_000, missileAccel: 0.6, ammo: 12,
      seekerRange: 3_000, seekerSensitivity: 3e-8,
    });

    // Moon
    const moon = this.world.createEntity();
    this.world.addComponent<Position>(moon, {
      type: 'Position',
      x: 0,
      y: 384400,
      prevX: 0,
      prevY: 384400,
    });
    this.world.addComponent<CelestialBody>(moon, {
      type: 'CelestialBody',
      name: 'Luna',
      mass: 7.342e22,
      radius: 1737,
      bodyType: 'moon',
    });

    // Faction contact trackers
    const playerTracker = this.world.createEntity();
    this.world.addComponent<ContactTracker>(playerTracker, {
      type: 'ContactTracker', faction: 'player', contacts: new Map(),
    });
    const enemyTracker = this.world.createEntity();
    this.world.addComponent<ContactTracker>(enemyTracker, {
      type: 'ContactTracker', faction: 'enemy', contacts: new Map(),
    });

    // Center camera on player fleet
    this.camera.setPosition(42000, 0);
    this.camera.zoomToFit(30000, 30000);
  }
}
