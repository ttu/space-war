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
import { PDCSystem } from '../engine/systems/PDCSystem';
import { RailgunSystem } from '../engine/systems/RailgunSystem';
import { DamageSystem } from '../engine/systems/DamageSystem';
import { RadarRenderer } from '../rendering/RadarRenderer';
import { ShipRenderer } from '../rendering/ShipRenderer';
import { CelestialRenderer } from '../rendering/CelestialRenderer';
import { TrailRenderer } from '../rendering/TrailRenderer';
import { MissileRenderer } from '../rendering/MissileRenderer';
import { ProjectileRenderer } from '../rendering/ProjectileRenderer';
import { CommandHandler } from './CommandHandler';
import { applyBoxSelection } from './Selection';
import { loadScenario } from '../engine/data/ScenarioLoader';
import { demoScenario } from '../engine/data/scenarios/demo';
import { showShipConfigScreen } from '../ui/ShipConfigScreen';
import {
  Position,
  Ship,
  Selectable,
  ContactTracker,
  NavigationOrder,
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
  private pdcSystem = new PDCSystem(this.eventBus);
  private railgunSystem = new RailgunSystem(this.eventBus);
  private damageSystem = new DamageSystem(this.eventBus);
  private commandHandler!: CommandHandler;
  private radarRenderer!: RadarRenderer;
  private shipRenderer!: ShipRenderer;
  private celestialRenderer!: CelestialRenderer;
  private trailRenderer!: TrailRenderer;
  private missileRenderer!: MissileRenderer;
  private projectileRenderer!: ProjectileRenderer;

  // UI elements
  private pausedLabel!: HTMLElement;
  private gameTimeLabel!: HTMLElement;
  private speedButtons!: HTMLButtonElement[];
  private targetingReadout!: HTMLElement;
  private targetingReadoutTimeout: ReturnType<typeof setTimeout> | null = null;

  // Box-drag selection state (screen coords while dragging)
  private selectionBoxState: { startScreenX: number; startScreenY: number; endScreenX: number; endScreenY: number } | null = null;
  private selectionBoxLine!: THREE.LineSegments;

  constructor(private canvas: HTMLCanvasElement, private container: HTMLElement) {
    this.setupRenderer();
    this.setupUI();
    this.setupInput();
    this.loadDemoScenario();
    this.commandHandler = new CommandHandler(this.world, this.eventBus);

    this.eventBus.subscribe('RailgunFired', (e) => {
      const p = e.data?.hitProbability as number | undefined;
      if (p != null && this.targetingReadout) {
        this.targetingReadout.textContent = `Hit: ${Math.round(p * 100)}%`;
        this.targetingReadout.classList.add('visible');
        if (this.targetingReadoutTimeout) clearTimeout(this.targetingReadoutTimeout);
        this.targetingReadoutTimeout = setTimeout(() => {
          this.targetingReadout.classList.remove('visible');
          this.targetingReadout.textContent = '';
          this.targetingReadoutTimeout = null;
        }, 2000);
      }
    });

    this.gameLoop = new GameLoop(
      this.gameTime,
      (dt) => this.fixedUpdate(dt),
      (alpha) => this.render(alpha),
    );
  }

  start(): void {
    this.gameLoop.start();
  }

  /**
   * State for e2e tests. Returns counts so tests can assert selection and move orders.
   * Only populated when app is loaded with ?e2e=1 (see main.ts).
   */
  getTestState(): {
    selectedCount: number;
    playerShipsWithMoveOrder: number;
    visibleDestinationMarkerCount: number;
  } {
    const ships = this.world.query(COMPONENT.Ship, COMPONENT.Selectable);
    let selectedCount = 0;
    let playerShipsWithMoveOrder = 0;
    let visibleDestinationMarkerCount = 0;
    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (sel.selected) selectedCount++;
      const nav = this.world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
      if (nav) {
        playerShipsWithMoveOrder++;
        if (nav.phase !== 'arrived') visibleDestinationMarkerCount++;
      }
    }
    return { selectedCount, playerShipsWithMoveOrder, visibleDestinationMarkerCount };
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
    this.projectileRenderer = new ProjectileRenderer(this.scene);

    this.selectionBoxLine = this.createSelectionBoxLine();
    this.scene.add(this.selectionBoxLine);

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
    this.targetingReadout = document.getElementById('targeting-readout')!;

    const btnPause = document.getElementById('btn-pause')!;
    const btn1x = document.getElementById('btn-1x')! as HTMLButtonElement;
    const btn2x = document.getElementById('btn-2x')! as HTMLButtonElement;
    const btn4x = document.getElementById('btn-4x')! as HTMLButtonElement;
    const btn10x = document.getElementById('btn-10x')! as HTMLButtonElement;
    const btn20x = document.getElementById('btn-20x')! as HTMLButtonElement;
    const btn50x = document.getElementById('btn-50x')! as HTMLButtonElement;
    const btn100x = document.getElementById('btn-100x')! as HTMLButtonElement;
    this.speedButtons = [btn1x, btn2x, btn4x, btn10x, btn20x, btn50x, btn100x];

    btnPause.addEventListener('click', () => this.togglePause());
    btn1x.addEventListener('click', () => this.setSpeed(1));
    btn2x.addEventListener('click', () => this.setSpeed(2));
    btn4x.addEventListener('click', () => this.setSpeed(4));
    btn10x.addEventListener('click', () => this.setSpeed(10));
    btn20x.addEventListener('click', () => this.setSpeed(20));
    btn50x.addEventListener('click', () => this.setSpeed(50));
    btn100x.addEventListener('click', () => this.setSpeed(100));

    const btnLoadout = document.getElementById('btn-loadout')!;
    btnLoadout.addEventListener('click', () => this.openLoadoutScreen());

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
        case 'boxSelect':
          this.handleBoxSelect(event.startScreenX, event.startScreenY, event.endScreenX, event.endScreenY, event.shiftKey);
          break;
        case 'boxSelectUpdate':
          this.selectionBoxState = {
            startScreenX: event.startScreenX,
            startScreenY: event.startScreenY,
            endScreenX: event.endScreenX,
            endScreenY: event.endScreenY,
          };
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
    const scales: TimeScale[] = [1, 2, 4, 10, 20, 50, 100];
    const idx = scales.indexOf(this.gameTime.timeScale);
    const newIdx = Math.max(0, Math.min(scales.length - 1, idx + delta));
    this.setSpeed(scales[newIdx]);
  }

  private updatePauseUI(): void {
    this.pausedLabel.classList.toggle('visible', this.gameTime.paused);
  }

  private updateSpeedUI(): void {
    const scales: TimeScale[] = [1, 2, 4, 10, 20, 50, 100];
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

  private handleBoxSelect(
    startScreenX: number,
    startScreenY: number,
    endScreenX: number,
    endScreenY: number,
    shiftKey: boolean,
  ): void {
    this.selectionBoxState = null;

    const p1 = this.camera.screenToWorld(startScreenX, startScreenY, this.canvas);
    const p2 = this.camera.screenToWorld(endScreenX, endScreenY, this.canvas);
    const worldMinX = Math.min(p1.x, p2.x);
    const worldMaxX = Math.max(p1.x, p2.x);
    const worldMinY = Math.min(p1.y, p2.y);
    const worldMaxY = Math.max(p1.y, p2.y);

    applyBoxSelection(this.world, worldMinX, worldMinY, worldMaxX, worldMaxY, shiftKey);
  }

  private createSelectionBoxLine(): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(8 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x44cccc,
      linewidth: 1,
      transparent: true,
      opacity: 0.8,
    });
    return new THREE.LineSegments(geometry, material);
  }

  private updateSelectionBoxVisual(): void {
    if (!this.selectionBoxState) {
      this.selectionBoxLine.visible = false;
      return;
    }
    const p1 = this.camera.screenToWorld(
      this.selectionBoxState.startScreenX,
      this.selectionBoxState.startScreenY,
      this.canvas,
    );
    const p2 = this.camera.screenToWorld(
      this.selectionBoxState.endScreenX,
      this.selectionBoxState.endScreenY,
      this.canvas,
    );
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    const pos = this.selectionBoxLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, minX, minY, 2);
    pos.setXYZ(1, maxX, minY, 2);
    pos.setXYZ(2, maxX, minY, 2);
    pos.setXYZ(3, maxX, maxY, 2);
    pos.setXYZ(4, maxX, maxY, 2);
    pos.setXYZ(5, minX, maxY, 2);
    pos.setXYZ(6, minX, maxY, 2);
    pos.setXYZ(7, minX, minY, 2);
    pos.needsUpdate = true;
    this.selectionBoxLine.visible = true;
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
      this.commandHandler.fireRailgun(clickedEnemy, this.gameTime.elapsed);
    } else {
      this.commandHandler.issueMoveTo(worldPos.x, worldPos.y);
    }
  }

  // --- Simulation ---

  private fixedUpdate(dt: number): void {
    this.sensorSystem.update(this.world, dt, this.gameTime.elapsed);
    this.missileSystem.update(this.world, dt, this.gameTime.elapsed);
    this.pdcSystem.update(this.world, dt, this.gameTime.elapsed);
    this.railgunSystem.update(this.world, dt, this.gameTime.elapsed);
    this.damageSystem.processHitEvents(this.world);
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
    this.projectileRenderer.update(this.world, zoom);

    this.updateSelectionBoxVisual();

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
    loadScenario(this.world, demoScenario);
    this.camera.setPosition(42000, 0);
    this.camera.zoomToFit(30000, 30000);
  }

  /** Open pre-battle loadout editor; on Apply reloads scenario with chosen loadouts. */
  openLoadoutScreen(): void {
    showShipConfigScreen(
      demoScenario,
      this.container,
      (scenario) => {
        loadScenario(this.world, scenario);
        this.camera.setPosition(42000, 0);
        this.camera.zoomToFit(30000, 30000);
      },
      () => {},
    );
  }
}
