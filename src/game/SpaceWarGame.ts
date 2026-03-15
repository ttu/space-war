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
import { AIStrategicSystem } from '../engine/systems/AIStrategicSystem';
import { AITacticalSystem } from '../engine/systems/AITacticalSystem';
import { VictorySystem } from '../engine/systems/VictorySystem';
import { CollisionSystem, DANGER_ZONE_MULTIPLIER } from '../engine/systems/CollisionSystem';
import { RadarRenderer } from '../rendering/RadarRenderer';
import { ShipRenderer } from '../rendering/ShipRenderer';
import { CelestialRenderer } from '../rendering/CelestialRenderer';
import { TrailRenderer } from '../rendering/TrailRenderer';
import { MissileRenderer } from '../rendering/MissileRenderer';
import { ProjectileRenderer } from '../rendering/ProjectileRenderer';
import { SensorOcclusionRenderer } from '../rendering/SensorOcclusionRenderer';
import { OffScreenContactRenderer } from '../rendering/OffScreenContactRenderer';
import { PlanetContactIndicatorsRenderer } from '../rendering/PlanetContactIndicatorsRenderer';
import { CommandHandler } from './CommandHandler';
import { SelectionManager } from './SelectionManager';
import { loadScenario, fetchScenario } from '../engine/data/ScenarioLoader';
import { demoScenario } from '../engine/data/scenarios/demo';
import { e2eScenario } from '../engine/data/scenarios/e2e';
import { showShipConfigScreen } from '../ui/ShipConfigScreen';
import { TimeControls } from '../ui/TimeControls';
import { FleetPanel } from '../ui/FleetPanel';
import { ContactsPanel } from '../ui/ContactsPanel';
import { ShipDetailPanel } from '../ui/ShipDetailPanel';
import { OrderBar } from '../ui/OrderBar';
import { CombatLog } from '../ui/CombatLog';
import { ActiveMissilesPanel } from '../ui/ActiveMissilesPanel';
import { IncomingThreatsPanel } from '../ui/IncomingThreatsPanel';
import { PanelManager } from '../ui/PanelManager';
import type { PendingOrderType } from '../ui/OrderBar';
import type { EntityId } from '../engine/types';
import {
  Position,
  Velocity,
  Ship,
  Thruster,
  Missile,
  ContactTracker,
  NavigationOrder,
  CelestialBody,
  COMPONENT,
} from '../engine/components';
import { computeBurnPlan } from './TrajectoryCalculator';
import { getBodiesFromWorld, getSafeWaypoint } from './PlanetAvoidance';

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
  private collisionSystem = new CollisionSystem(this.eventBus);
  private navigationSystem = new NavigationSystem();
  private sensorSystem = new SensorSystem(this.eventBus);
  private missileSystem = new MissileSystem(this.eventBus);
  private pdcSystem = new PDCSystem(this.eventBus);
  private railgunSystem = new RailgunSystem(this.eventBus);
  private damageSystem = new DamageSystem(this.eventBus);
  private aiStrategicSystem = new AIStrategicSystem();
  private aiTacticalSystem!: AITacticalSystem;
  private victorySystem = new VictorySystem(this.eventBus);
  private commandHandler!: CommandHandler;
  private radarRenderer!: RadarRenderer;
  private shipRenderer!: ShipRenderer;
  private celestialRenderer!: CelestialRenderer;
  private trailRenderer!: TrailRenderer;
  private missileRenderer!: MissileRenderer;
  private projectileRenderer!: ProjectileRenderer;
  private offScreenContactRenderer!: OffScreenContactRenderer;
  private planetContactIndicatorsRenderer!: PlanetContactIndicatorsRenderer;
  private sensorOcclusionRenderer!: SensorOcclusionRenderer;
  private shadowsEnabled = true;

  private selectionManager!: SelectionManager;
  private timeControls!: TimeControls;
  private fleetPanel!: FleetPanel;
  private contactsPanel!: ContactsPanel;
  private shipDetailPanel!: ShipDetailPanel;
  private orderBar!: OrderBar;
  private combatLog!: CombatLog;
  private activeMissilesPanel!: ActiveMissilesPanel;
  private incomingThreatsPanel!: IncomingThreatsPanel;
  private panelManager!: PanelManager;
  private pendingOrder: PendingOrderType = 'none';

  private cameraLockIndicator: HTMLElement | null = null;

  private targetingReadoutTimeout: ReturnType<typeof setTimeout> | null = null;

  private lastContactsPanelUpdate = 0;
  private readonly contactsPanelIntervalMs = 400;

  /** Camera focus animation: zoom out → pan to target → zoom in fast. */
  private cameraFocusAnimation: {
    phase: 'zoomOut' | 'pan' | 'zoomIn';
    startTime: number;
    fromX: number;
    fromY: number;
    fromZoom: number;
    targetX: number;
    targetY: number;
    targetZoom: number;
    zoomOutLevel: number;
  } | null = null;
  private static readonly FOCUS_ZOOM_OUT_S = 0.15;
  private static readonly FOCUS_PAN_S = 0.25;
  private static readonly FOCUS_ZOOM_IN_S = 0.12;
  private static readonly FOCUS_ZOOM_OUT_LEVEL = 120_000;
  private static readonly FOCUS_FINAL_ZOOM = 8000;

  // Box-drag selection state (screen coords while dragging)
  private selectionBoxState: { startScreenX: number; startScreenY: number; endScreenX: number; endScreenY: number } | null = null;
  private selectionBoxLine!: THREE.LineSegments;

  private waypointDrag: {
    shipId: EntityId;
    waypointIndex: number; // -1 = destination, 0+ = waypoints[i]
  } | null = null;

  /** When set, camera stays centered on this entity each frame (ship or celestial). */
  private referenceEntityId: EntityId | null = null;

  constructor(private canvas: HTMLCanvasElement, private container: HTMLElement) {
    this.setupRenderer();
    this.selectionManager = new SelectionManager(this.world, (id: EntityId) => {
      const contacts = this.getPlayerContacts();
      const c = contacts?.contacts.get(id);
      return c ? { x: c.lastKnownX, y: c.lastKnownY } : undefined;
    });
    this.setupUI();
    this.setupInput();
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    if (params?.get('e2e') === '1') {
      this.loadE2eScenario();
    } else if (params?.get('scenario')) {
      // Scenario loaded async in main.ts via loadScenarioByName()
    } else {
      this.loadDemoScenario();
    }
    this.commandHandler = new CommandHandler(this.world, this.eventBus);
    this.aiTacticalSystem = new AITacticalSystem(this.commandHandler);

    this.eventBus.subscribe('RailgunFired', (e) => {
      const p = e.data?.hitProbability as number | undefined;
      const readout = this.timeControls?.getTargetingReadoutElement();
      if (p != null && readout) {
        readout.textContent = `Hit: ${Math.round(p * 100)}%`;
        readout.classList.add('visible');
        if (this.targetingReadoutTimeout) clearTimeout(this.targetingReadoutTimeout);
        this.targetingReadoutTimeout = setTimeout(() => {
          readout.classList.remove('visible');
          readout.textContent = '';
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

  /** Set or clear camera lock. When set, camera follows that entity each frame. */
  setCameraLock(entityId: EntityId | null): void {
    this.referenceEntityId = entityId;
  }

  /** Current lock info for UI; null if no lock or entity missing. Clears referenceEntityId when entity is gone. */
  getCameraLock(): { entityId: EntityId; displayName: string } | null {
    if (this.referenceEntityId == null) return null;
    const pos = this.world.getComponent<Position>(this.referenceEntityId, COMPONENT.Position);
    if (!pos) {
      this.referenceEntityId = null;
      return null;
    }
    const ship = this.world.getComponent<Ship>(this.referenceEntityId, COMPONENT.Ship);
    if (ship) return { entityId: this.referenceEntityId, displayName: ship.name };
    const body = this.world.getComponent<CelestialBody>(this.referenceEntityId, COMPONENT.CelestialBody);
    if (body) return { entityId: this.referenceEntityId, displayName: body.name };
    this.referenceEntityId = null;
    return null;
  }

  /**
   * State for e2e tests. Returns counts so tests can assert selection and move orders.
   * Only populated when app is loaded with ?e2e=1 (see main.ts).
   */
  getTestState(): {
    selectedCount: number;
    selectedEnemyCount: number;
    playerShipsWithMoveOrder: number;
    visibleDestinationMarkerCount: number;
    firstEnemyScreenPosition: { x: number; y: number } | null;
    cameraLockDisplayName: string | null;
    firstSelectedId: EntityId | null;
  } {
    const selectedCount = this.selectionManager.getSelectedPlayerIds().length;
    const selectedEnemyCount = this.selectionManager.getSelectedIds().filter((id) => {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
      return ship?.faction === 'enemy';
    }).length;
    const ships = this.world.query(COMPONENT.Ship, COMPONENT.Selectable);
    let playerShipsWithMoveOrder = 0;
    let visibleDestinationMarkerCount = 0;
    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const nav = this.world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
      if (nav) {
        playerShipsWithMoveOrder++;
        if (nav.phase !== 'arrived') visibleDestinationMarkerCount++;
      }
    }
    let firstEnemyScreenPosition: { x: number; y: number } | null = null;
    const enemies = this.world.query(COMPONENT.Position, COMPONENT.Ship).filter((id) => {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      return ship.faction === 'enemy';
    });
    if (enemies.length > 0) {
      const enemyId = enemies[0];
      const pos = this.world.getComponent<Position>(enemyId, COMPONENT.Position)!;
      const contacts = this.getPlayerContacts();
      const contact = contacts?.contacts.get(enemyId);
      const worldX = contact ? contact.lastKnownX : pos.x;
      const worldY = contact ? contact.lastKnownY : pos.y;
      const screen = this.camera.worldToScreen(worldX, worldY, this.canvas);
      const rect = this.canvas.getBoundingClientRect();
      firstEnemyScreenPosition = { x: screen.x - rect.left, y: screen.y - rect.top };
    }
    return {
      selectedCount,
      selectedEnemyCount,
      playerShipsWithMoveOrder,
      visibleDestinationMarkerCount,
      firstEnemyScreenPosition,
      cameraLockDisplayName: this.getCameraLock()?.displayName ?? null,
      firstSelectedId: (() => {
        const ids = this.selectionManager.getSelectedIds();
        return ids.length === 1 ? ids[0] : null;
      })(),
    };
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
    this.offScreenContactRenderer = new OffScreenContactRenderer(this.scene);
    this.planetContactIndicatorsRenderer = new PlanetContactIndicatorsRenderer(this.scene);
    this.sensorOcclusionRenderer = new SensorOcclusionRenderer(this.scene);

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
    const uiRoot = document.createElement('div');
    uiRoot.id = 'ui-root';
    uiRoot.className = 'ui-root';
    this.container.appendChild(uiRoot);

    this.timeControls = new TimeControls(uiRoot, this.gameTime, {
      onPauseToggle: () => this.togglePause(),
      onSpeedChange: (scale) => this.setSpeed(scale),
      onLoadoutClick: () => this.openLoadoutScreen(),
      getCameraLock: () => this.getCameraLock(),
      onClearCameraLock: () => this.setCameraLock(null),
    });

    const leftPanel = document.createElement('div');
    leftPanel.id = 'left-panel';
    leftPanel.className = 'left-panel';
    uiRoot.appendChild(leftPanel);

    this.fleetPanel = new FleetPanel(
      leftPanel,
      this.world,
      () => this.selectionManager.getSelectedPlayerIds(),
      (entityId) => {
        this.selectionManager.setSelectionToEntity(entityId);
        this.focusCameraOnShip(entityId);
      },
    );
    this.shipDetailPanel = new ShipDetailPanel(
      leftPanel,
      this.world,
      () => this.selectionManager.getSelectedIds(),
      (id) => this.getPlayerContacts()?.contacts.get(id),
      () => Array.from(this.getPlayerContacts()?.contacts.keys() ?? []),
      () => this.gameTime.elapsed,
      () => this.selectionManager.getSelectedCelestialId(),
      (entityId) => this.setCameraLock(entityId),
    );

    // Right panel — combat intel
    const rightPanel = document.createElement('div');
    rightPanel.id = 'right-panel';
    rightPanel.className = 'right-panel';
    uiRoot.appendChild(rightPanel);

    this.contactsPanel = new ContactsPanel(
      rightPanel,
      this.world,
      () => this.getPlayerContacts() ?? undefined,
      () => this.gameTime.elapsed,
      (entityId) => {
        this.selectionManager.setSelectionToEntity(entityId);
        this.focusCameraOnContact(entityId);
      },
      () => this.selectionManager.getSelectedPlayerIds(),
    );
    this.activeMissilesPanel = new ActiveMissilesPanel(rightPanel, this.world);
    this.incomingThreatsPanel = new IncomingThreatsPanel(
      rightPanel,
      this.world,
      () => this.selectionManager.getSelectedPlayerIds(),
    );

    const orderBarWrap = document.createElement('div');
    orderBarWrap.id = 'order-bar-wrap';
    orderBarWrap.className = 'order-bar-wrap';
    uiRoot.appendChild(orderBarWrap);
    this.orderBar = new OrderBar(orderBarWrap, {
      onPendingOrderChange: (order) => {
        this.pendingOrder = order;
      },
      onShadowToggle: (enabled) => {
        this.shadowsEnabled = enabled;
      },
    });

    // Combat log overlay (hidden by default, toggled with L)
    this.combatLog = new CombatLog(uiRoot, this.eventBus);

    // Panel manager — collapse/expand with hotkeys
    this.panelManager = new PanelManager();
    const fleetEl = document.getElementById('fleet-panel')!;
    const shipDetailEl = document.getElementById('ship-detail-panel')!;
    const contactsEl = document.getElementById('contacts-panel')!;
    this.panelManager.register({ id: 'fleet', element: fleetEl, headerElement: fleetEl.querySelector('.fleet-panel-header')!, hotkey: 'F1' });
    this.panelManager.register({ id: 'shipDetail', element: shipDetailEl, headerElement: shipDetailEl.querySelector('.ship-detail-header')!, hotkey: 'F2' });
    this.panelManager.register({ id: 'contacts', element: contactsEl, headerElement: contactsEl.querySelector('.contacts-panel-header')!, hotkey: 'F3' });
    this.panelManager.register({ id: 'activeMissiles', element: this.activeMissilesPanel.header.parentElement!, headerElement: this.activeMissilesPanel.header, hotkey: 'F4' });
    this.panelManager.register({ id: 'incomingThreats', element: this.incomingThreatsPanel.header.parentElement!, headerElement: this.incomingThreatsPanel.header, hotkey: 'F5' });

    const infoOverlay = document.createElement('div');
    infoOverlay.id = 'info-overlay';
    infoOverlay.textContent = 'WASD: Pan | Scroll: Zoom | Space: Pause | +/-: Speed | E: Focus enemy | V: Shadows | F1-F5: Panels | L: Combat log';
    uiRoot.appendChild(infoOverlay);

    const cameraLockIndicator = document.createElement('div');
    cameraLockIndicator.id = 'camera-lock-indicator';
    cameraLockIndicator.className = 'camera-lock-indicator';
    cameraLockIndicator.style.display = 'none';
    this.cameraLockIndicator = cameraLockIndicator;
    uiRoot.appendChild(cameraLockIndicator);

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
          if (this.referenceEntityId == null) {
            this.camera.panByScreenDelta(
              event.deltaX,
              event.deltaY,
              event.canvasWidth,
              event.canvasHeight,
            );
          }
          break;
        case 'click':
          this.handleClick(event.screenX, event.screenY, event.shiftKey);
          break;
        case 'boxSelect':
          if (this.waypointDrag) {
            this.handleWaypointDragEnd(event.endScreenX, event.endScreenY);
          } else {
            this.handleBoxSelect(event.startScreenX, event.startScreenY, event.endScreenX, event.endScreenY, event.shiftKey);
          }
          break;
        case 'boxSelectUpdate':
          if (this.waypointDrag) {
            this.handleWaypointDragMove(event.endScreenX, event.endScreenY);
          } else {
            this.selectionBoxState = {
              startScreenX: event.startScreenX,
              startScreenY: event.startScreenY,
              endScreenX: event.endScreenX,
              endScreenY: event.endScreenY,
            };
          }
          break;
        case 'rightClick':
          this.handleRightClick(event.screenX, event.screenY, event.shiftKey);
          break;
        case 'deleteKey':
          this.handleDeleteWaypoint(event.screenX, event.screenY);
          break;
        case 'focusNearestEnemy':
          this.focusNearestEnemy();
          break;
        case 'toggleShadows':
          this.orderBar.toggleShadows();
          break;
        case 'panelToggle':
          if (event.code === 'KeyL') {
            this.combatLog.toggle();
          } else {
            this.panelManager.handleHotkey(event.code);
          }
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
    const scales: TimeScale[] = [1, 2, 4, 10, 20, 50, 100, 1000, 10000];
    const idx = scales.indexOf(this.gameTime.timeScale);
    const newIdx = Math.max(0, Math.min(scales.length - 1, idx + delta));
    this.setSpeed(scales[newIdx]);
  }

  private updatePauseUI(): void {
    this.timeControls?.update();
  }

  private updateSpeedUI(): void {
    this.timeControls?.update();
  }

  private handleClick(screenX: number, screenY: number, shiftKey: boolean): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    if (this.tryStartWaypointDrag(worldPos.x, worldPos.y, pickRadius)) return;

    this.selectionManager.setSelectionFromClick(worldPos.x, worldPos.y, pickRadius, shiftKey);
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

    this.selectionManager.setSelectionFromBox(worldMinX, worldMinY, worldMaxX, worldMaxY, shiftKey);
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

  private handleRightClick(screenX: number, screenY: number, shiftKey = false): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship);
    const playerContacts = this.getPlayerContacts();
    let clickedEnemy: string | null = null;
    let enemyDist = pickRadius;

    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction === 'player') continue;

      let checkX: number, checkY: number;
      if (playerContacts) {
        const contact = playerContacts.contacts.get(id);
        if (!contact) continue;
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
      if (dist < enemyDist) {
        enemyDist = dist;
        clickedEnemy = id;
      }
    }

    let clickedMissile: string | null = null;
    let missileDist = pickRadius;
    const missiles = this.world.query(COMPONENT.Position, COMPONENT.Missile);
    for (const id of missiles) {
      const missile = this.world.getComponent<Missile>(id, COMPONENT.Missile)!;
      if (missile.launcherFaction === 'player') continue;
      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const dx = pos.x - worldPos.x;
      const dy = pos.y - worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < missileDist) {
        missileDist = dist;
        clickedMissile = id;
      }
    }

    const order = this.pendingOrder;
    const railgunTarget =
      order === 'fireRailgun' && (clickedEnemy !== null || clickedMissile !== null)
        ? clickedEnemy === null
          ? clickedMissile
          : clickedMissile === null
            ? clickedEnemy
            : enemyDist <= missileDist
              ? clickedEnemy
              : clickedMissile
        : null;

    if (order === 'fireMissile' && clickedEnemy) {
      this.commandHandler.launchMissile(clickedEnemy, this.gameTime.elapsed);
      this.orderBar.setPendingOrder('none');
      this.pendingOrder = 'none';
    } else if (order === 'fireRailgun' && railgunTarget) {
      this.commandHandler.fireRailgun(railgunTarget, this.gameTime.elapsed);
      this.orderBar.setPendingOrder('none');
      this.pendingOrder = 'none';
    } else if (order === 'move' || order === 'none') {
      // Check if click is on a celestial body — issue orbit instead of move
      let clickedPlanet: EntityId | null = null;
      const celestials = this.world.query(COMPONENT.Position, COMPONENT.CelestialBody);
      for (const id of celestials) {
        const body = this.world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
        const bPos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
        const hitRadius = body.radius * DANGER_ZONE_MULTIPLIER;
        const dx = bPos.x - worldPos.x;
        const dy = bPos.y - worldPos.y;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          clickedPlanet = id;
          break;
        }
      }

      if (clickedPlanet) {
        this.commandHandler.issueOrbitTo(clickedPlanet);
      } else {
        this.commandHandler.issueMoveTo(worldPos.x, worldPos.y, shiftKey);
      }
      if (order === 'move') {
        this.orderBar.setPendingOrder('none');
        this.pendingOrder = 'none';
      }
    }
  }

  private handleDeleteWaypoint(screenX: number, screenY: number): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    const selectedIds = this.selectionManager.getSelectedPlayerIds();
    if (selectedIds.length === 0) return;

    for (const shipId of selectedIds) {
      const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
      if (!nav || nav.phase === 'arrived') continue;

      // Check destination marker
      const ddx = nav.destinationX - worldPos.x;
      const ddy = nav.destinationY - worldPos.y;
      const destDist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (destDist < pickRadius) {
        if (nav.waypoints.length > 0) {
          const next = nav.waypoints.shift()!;
          nav.destinationX = next.x;
          nav.destinationY = next.y;
          nav.targetX = next.x;
          nav.targetY = next.y;
        } else {
          this.world.removeComponent(shipId, COMPONENT.NavigationOrder);
        }
        return;
      }

      // Check waypoint markers
      for (let i = 0; i < nav.waypoints.length; i++) {
        const wp = nav.waypoints[i];
        const dx = wp.x - worldPos.x;
        const dy = wp.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < pickRadius) {
          nav.waypoints.splice(i, 1);
          return;
        }
      }
    }
  }

  private tryStartWaypointDrag(worldX: number, worldY: number, pickRadius: number): boolean {
    const selectedIds = this.selectionManager.getSelectedPlayerIds();
    for (const shipId of selectedIds) {
      const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
      if (!nav || nav.phase === 'arrived') continue;

      // Check destination
      const ddx = nav.destinationX - worldX;
      const ddy = nav.destinationY - worldY;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < pickRadius) {
        this.waypointDrag = { shipId, waypointIndex: -1 };
        return true;
      }

      // Check waypoints
      for (let i = 0; i < nav.waypoints.length; i++) {
        const wp = nav.waypoints[i];
        const dx = wp.x - worldX;
        const dy = wp.y - worldY;
        if (Math.sqrt(dx * dx + dy * dy) < pickRadius) {
          this.waypointDrag = { shipId, waypointIndex: i };
          return true;
        }
      }
    }
    return false;
  }

  private handleWaypointDragMove(screenX: number, screenY: number): void {
    if (!this.waypointDrag) return;
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const nav = this.world.getComponent<NavigationOrder>(this.waypointDrag.shipId, COMPONENT.NavigationOrder);
    if (!nav) { this.waypointDrag = null; return; }

    if (this.waypointDrag.waypointIndex === -1) {
      nav.destinationX = worldPos.x;
      nav.destinationY = worldPos.y;
      nav.targetX = worldPos.x;
      nav.targetY = worldPos.y;
    } else {
      const wp = nav.waypoints[this.waypointDrag.waypointIndex];
      if (wp) { wp.x = worldPos.x; wp.y = worldPos.y; }
    }
  }

  private handleWaypointDragEnd(screenX: number, screenY: number): void {
    if (!this.waypointDrag) return;
    this.handleWaypointDragMove(screenX, screenY);

    // Recompute burn plan if destination was dragged
    if (this.waypointDrag.waypointIndex === -1) {
      const nav = this.world.getComponent<NavigationOrder>(this.waypointDrag.shipId, COMPONENT.NavigationOrder);
      if (nav) {
        const pos = this.world.getComponent<Position>(this.waypointDrag.shipId, COMPONENT.Position)!;
        const vel = this.world.getComponent<Velocity>(this.waypointDrag.shipId, COMPONENT.Velocity)!;
        const thruster = this.world.getComponent<Thruster>(this.waypointDrag.shipId, COMPONENT.Thruster)!;
        const bodies = getBodiesFromWorld(this.world);
        const safe = getSafeWaypoint(pos.x, pos.y, nav.destinationX, nav.destinationY, bodies);
        nav.targetX = safe ? safe.x : nav.destinationX;
        nav.targetY = safe ? safe.y : nav.destinationY;
        nav.burnPlan = computeBurnPlan(pos.x, pos.y, vel.vx, vel.vy, nav.targetX, nav.targetY, thruster.maxThrust);
      }
    }

    this.waypointDrag = null;
  }

  // --- Simulation ---

  private fixedUpdate(dt: number): void {
    this.commandHandler.processPendingRailgunBursts(this.world, this.gameTime.elapsed);
    this.sensorSystem.update(this.world, dt, this.gameTime.elapsed);
    this.pdcSystem.update(this.world, dt, this.gameTime.elapsed);
    this.railgunSystem.update(this.world, dt, this.gameTime.elapsed);
    this.damageSystem.processHitEvents(this.world);
    this.aiStrategicSystem.update(this.world, dt, this.gameTime.elapsed);
    this.aiTacticalSystem.update(this.world, dt, this.gameTime.elapsed);
    this.navigationSystem.update(this.world, dt, this.gameTime.elapsed);
    this.physicsSystem.update(this.world, dt);
    this.collisionSystem.update(this.world);
    this.missileSystem.update(this.world, dt, this.gameTime.elapsed);
    this.victorySystem.update(this.world, this.gameTime.elapsed);
    this.trailRenderer.recordPositions(this.world);
    this.missileRenderer.recordPositions(this.world);
  }

  // --- Rendering ---

  private render(alpha: number): void {
    // Camera keyboard panning (skip during focus animation so we don't fight it; skip when camera locked)
    if (!this.cameraFocusAnimation && this.referenceEntityId == null) {
      const camMove = this.input.getCameraMovement();
      if (camMove.x !== 0 || camMove.y !== 0) {
        this.camera.pan(camMove.x, camMove.y, 1 / 60);
      }
    }

    this.updateCameraFocusAnimation();

    // When locked to an entity, keep camera centered on it
    if (this.referenceEntityId != null) {
      const pos = this.world.getComponent<Position>(this.referenceEntityId, COMPONENT.Position);
      if (!pos) {
        this.referenceEntityId = null;
      } else {
        this.camera.setPosition(pos.x, pos.y);
      }
    }

    const camPos = this.camera.getPosition();
    const zoom = this.camera.getZoom();

    this.radarRenderer.update(camPos.x, camPos.y, zoom);
    this.radarRenderer.updateScaleLabel(zoom, this.container);
    this.celestialRenderer.update(this.world, zoom);
    const playerContacts = this.getPlayerContacts();
    this.shipRenderer.update(this.world, alpha, zoom, playerContacts, this.gameTime.elapsed);
    const selectedPlayerIds = new Set(this.selectionManager.getSelectedPlayerIds());
    this.trailRenderer.update(this.world, zoom, selectedPlayerIds);
    this.missileRenderer.update(this.world, zoom, playerContacts);
    this.projectileRenderer.update(this.world, zoom);
    this.offScreenContactRenderer.update(
      this.world,
      camPos.x,
      camPos.y,
      zoom,
      this.camera.getAspect(),
      playerContacts,
      this.gameTime.elapsed,
    );
    this.planetContactIndicatorsRenderer.update(
      this.world,
      zoom,
      playerContacts,
      this.gameTime.elapsed,
    );
    this.sensorOcclusionRenderer.update(this.world, this.shadowsEnabled);

    this.updateSelectionBoxVisual();

    this.timeControls.update();
    const lock = this.getCameraLock();
    if (this.cameraLockIndicator) {
      if (lock) {
        this.cameraLockIndicator.textContent = `🔒 Camera locked: ${lock.displayName}`;
        this.cameraLockIndicator.style.display = 'block';
      } else {
        this.cameraLockIndicator.style.display = 'none';
      }
    }
    this.fleetPanel.update();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastContactsPanelUpdate >= this.contactsPanelIntervalMs) {
      this.lastContactsPanelUpdate = now;
      this.contactsPanel.update();
    }
    this.shipDetailPanel.update();
    this.activeMissilesPanel.update();
    this.incomingThreatsPanel.update();
    this.combatLog.update();

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
    this.victorySystem.reset();
    this.centerCameraOnFlagship();
    this.camera.zoomToFit(30000, 30000);
  }

  private centerCameraOnFlagship(): void {
    const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship);
    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction === 'player' && ship.flagship) {
        const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
        this.camera.setPosition(pos.x, pos.y);
        return;
      }
    }
  }

  /** Center camera on a ship and zoom in (e.g. when clicking ship name in fleet panel). */
  private focusCameraOnShip(entityId: EntityId): void {
    const pos = this.world.getComponent<Position>(entityId, COMPONENT.Position);
    if (!pos) return;
    this.startCameraFocusAnimation(pos.x, pos.y);
  }

  /** Center camera on a detected enemy contact (last-known position extrapolated by velocity). */
  private focusCameraOnContact(entityId: EntityId): void {
    const tracker = this.getPlayerContacts();
    const contact = tracker?.contacts.get(entityId);
    if (!contact) return;
    const age = this.gameTime.elapsed - contact.receivedTime;
    const x = contact.lastKnownX + contact.lastKnownVx * age;
    const y = contact.lastKnownY + contact.lastKnownVy * age;
    this.startCameraFocusAnimation(x, y);
  }

  private startCameraFocusAnimation(targetX: number, targetY: number): void {
    this.referenceEntityId = null;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pos = this.camera.getPosition();
    const fromZoom = this.camera.getZoom();
    const zoomOutLevel = Math.max(fromZoom, SpaceWarGame.FOCUS_ZOOM_OUT_LEVEL);
    this.cameraFocusAnimation = {
      phase: 'zoomOut',
      startTime: now,
      fromX: pos.x,
      fromY: pos.y,
      fromZoom,
      targetX,
      targetY,
      targetZoom: SpaceWarGame.FOCUS_FINAL_ZOOM,
      zoomOutLevel,
    };
  }

  private updateCameraFocusAnimation(): void {
    const a = this.cameraFocusAnimation;
    if (!a) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedMs = now - a.startTime;

    if (a.phase === 'zoomOut') {
      const durationMs = SpaceWarGame.FOCUS_ZOOM_OUT_S * 1000;
      const t = Math.min(1, elapsedMs / durationMs);
      const smooth = t * t;
      const zoom = a.fromZoom + (a.zoomOutLevel - a.fromZoom) * smooth;
      this.camera.setPosition(a.fromX, a.fromY);
      this.camera.setZoom(zoom);
      if (t >= 1) {
        a.phase = 'pan';
        a.startTime = now;
      }
      return;
    }
    if (a.phase === 'pan') {
      const durationMs = SpaceWarGame.FOCUS_PAN_S * 1000;
      const t = Math.min(1, elapsedMs / durationMs);
      const smooth = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x = a.fromX + (a.targetX - a.fromX) * smooth;
      const y = a.fromY + (a.targetY - a.fromY) * smooth;
      this.camera.setPosition(x, y);
      this.camera.setZoom(a.zoomOutLevel);
      if (t >= 1) {
        a.phase = 'zoomIn';
        a.startTime = now;
      }
      return;
    }
    // zoomIn
    const durationMs = SpaceWarGame.FOCUS_ZOOM_IN_S * 1000;
    const t = Math.min(1, elapsedMs / durationMs);
    const smooth = 1 - (1 - t) * (1 - t);
    const zoom = a.zoomOutLevel + (a.targetZoom - a.zoomOutLevel) * smooth;
    this.camera.setPosition(a.targetX, a.targetY);
    this.camera.setZoom(zoom);
    if (t >= 1) this.cameraFocusAnimation = null;
  }

  /** Focus camera on nearest detected enemy (keyboard shortcut E). */
  private focusNearestEnemy(): void {
    const tracker = this.getPlayerContacts();
    if (!tracker || tracker.contacts.size === 0) return;
    const cam = this.camera.getPosition();
    const gameTime = this.gameTime.elapsed;
    let nearestId: EntityId | null = null;
    let nearestDistSq = Infinity;
    for (const [id, contact] of tracker.contacts) {
      if (contact.lost) continue;
      const age = gameTime - contact.receivedTime;
      const x = contact.lastKnownX + contact.lastKnownVx * age;
      const y = contact.lastKnownY + contact.lastKnownVy * age;
      const dx = x - cam.x;
      const dy = y - cam.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDistSq) {
        nearestDistSq = d2;
        nearestId = id;
      }
    }
    if (nearestId) this.focusCameraOnContact(nearestId);
  }

  loadE2eScenario(): void {
    loadScenario(this.world, e2eScenario);
    this.victorySystem.reset();
    this.camera.setPosition(42000, 0);
    this.camera.zoomToFit(30000, 30000);
  }

  /**
   * Load a scenario by name from /scenarios/{name}.json.
   * Use for tutorial, patrol, fleet-action, ambush.
   */
  async loadScenarioByName(name: string): Promise<void> {
    const scenario = await fetchScenario(name);
    loadScenario(this.world, scenario);
    this.victorySystem.reset();
    this.camera.setPosition(0, 0);
    this.camera.zoomToFit(150000, 150000);
  }

  /** Open pre-battle loadout editor; on Apply reloads scenario with chosen loadouts. */
  openLoadoutScreen(): void {
    showShipConfigScreen(
      demoScenario,
      this.container,
      (scenario) => {
        loadScenario(this.world, scenario);
        this.victorySystem.reset();
        this.centerCameraOnFlagship();
        this.camera.zoomToFit(30000, 30000);
      },
      () => {},
    );
  }
}
