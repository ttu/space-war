import * as THREE from 'three';
import { WorldImpl } from '../engine/ecs/World';
import { EventBusImpl } from '../engine/core/EventBus';
import { GameTime, TimeScale } from '../engine/core/GameTime';
import { GameLoop } from '../core/GameLoop';
import { CameraController } from '../core/Camera';
import { CameraAnimator } from '../core/CameraAnimator';
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
import { CollisionSystem } from '../engine/systems/CollisionSystem';
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
import { PlayerInteractionHandler } from './PlayerInteractionHandler';
import { loadScenario, fetchScenario } from '../engine/data/ScenarioLoader';
import { demoScenario } from '../engine/data/scenarios/demo';
import { solarSystemScenario } from '../engine/data/scenarios/solarSystem';
import { redDwarfScenario } from '../engine/data/scenarios/redDwarf';
import { provingGroundsScenario } from '../engine/data/scenarios/provingGrounds';
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
import { ScenarioSelector } from '../ui/ScenarioSelector';
import type { PendingOrderType } from '../ui/OrderBar';
import type { EntityId } from '../engine/types';
import {
  Position,
  Ship,
  ContactTracker,
  NavigationOrder,
  CelestialBody,
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
  private scenarioSelector!: ScenarioSelector;
  private playerInteraction!: PlayerInteractionHandler;
  private pendingOrder: PendingOrderType = 'none';
  currentScenarioId = 'solarSystem';

  private cameraLockIndicator: HTMLElement | null = null;

  private targetingReadoutTimeout: ReturnType<typeof setTimeout> | null = null;

  private lastContactsPanelUpdate = 0;
  private readonly contactsPanelIntervalMs = 400;

  private cameraAnimator!: CameraAnimator;

  // Box-drag selection state (screen coords while dragging)
  private selectionBoxState: { startScreenX: number; startScreenY: number; endScreenX: number; endScreenY: number } | null = null;
  private selectionBoxLine!: THREE.LineSegments;

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
    const scenarioParam = params?.get('scenario');
    if (params?.get('e2e') === '1') {
      this.loadE2eScenario();
    } else if (scenarioParam) {
      this.currentScenarioId = scenarioParam;
      this.scenarioSelector.setScenario(scenarioParam);
      // Scenario loaded async in main.ts via loadScenarioByName()
    } else {
      this.loadSolarSystemScenario();
    }
    this.cameraAnimator = new CameraAnimator(this.camera);
    this.commandHandler = new CommandHandler(this.world, this.eventBus);
    this.aiTacticalSystem = new AITacticalSystem(this.eventBus);
    this.playerInteraction = new PlayerInteractionHandler({
      world: this.world,
      camera: this.camera,
      canvas: this.canvas,
      selectionManager: this.selectionManager,
      commandHandler: this.commandHandler,
      gameTime: this.gameTime,
      getPlayerContacts: () => this.getPlayerContacts(),
      getPendingOrder: () => this.pendingOrder,
      clearPendingOrder: () => {
        this.orderBar.setPendingOrder('none');
        this.pendingOrder = 'none';
      },
    });

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

    // Top bar container
    const topBar = document.createElement('div');
    topBar.className = 'top-bar';
    uiRoot.appendChild(topBar);

    this.scenarioSelector = new ScenarioSelector(topBar, {
      onScenarioChange: (id) => this.switchScenario(id),
    });

    this.timeControls = new TimeControls(topBar, this.gameTime, {
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
          if (this.playerInteraction.isDraggingWaypoint) {
            this.playerInteraction.handleWaypointDragEnd(event.endScreenX, event.endScreenY);
          } else {
            this.handleBoxSelect(event.startScreenX, event.startScreenY, event.endScreenX, event.endScreenY, event.shiftKey);
          }
          break;
        case 'boxSelectUpdate':
          if (this.playerInteraction.isDraggingWaypoint) {
            this.playerInteraction.handleWaypointDragMove(event.endScreenX, event.endScreenY);
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
          this.playerInteraction.handleRightClick(event.screenX, event.screenY, event.shiftKey);
          break;
        case 'deleteKey':
          this.playerInteraction.handleDeleteWaypoint(event.screenX, event.screenY);
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
    if (this.playerInteraction.tryStartWaypointDrag(screenX, screenY)) return;

    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const pickRadius = this.camera.getZoom() * 0.04;
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


  // --- Simulation ---

  private fixedUpdate(dt: number): void {
    this.commandHandler.processPendingRailgunBursts(this.world, this.gameTime.elapsed);
    this.sensorSystem.update(this.world, dt, this.gameTime.elapsed);
    this.railgunSystem.update(this.world, dt, this.gameTime.elapsed);
    this.damageSystem.processHitEvents(this.world);
    this.aiStrategicSystem.update(this.world, dt, this.gameTime.elapsed);
    this.aiTacticalSystem.update(this.world, dt, this.gameTime.elapsed);
    this.navigationSystem.update(this.world, dt, this.gameTime.elapsed);
    this.physicsSystem.update(this.world, dt);
    this.collisionSystem.update(this.world);
    this.pdcSystem.update(this.world, dt, this.gameTime.elapsed);
    this.missileSystem.update(this.world, dt, this.gameTime.elapsed);
    this.victorySystem.update(this.world, this.gameTime.elapsed);
    this.trailRenderer.recordPositions(this.world);
    this.missileRenderer.recordPositions(this.world);
  }

  // --- Rendering ---

  private render(alpha: number): void {
    // Camera keyboard panning (skip during focus animation so we don't fight it; skip when camera locked)
    if (!this.cameraAnimator.isAnimating && this.referenceEntityId == null) {
      const camMove = this.input.getCameraMovement();
      if (camMove.x !== 0 || camMove.y !== 0) {
        this.camera.pan(camMove.x, camMove.y, 1 / 60);
      }
    }

    this.cameraAnimator.update();

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

  // --- Scenario switching ---

  async switchScenario(id: string): Promise<void> {
    this.currentScenarioId = id;
    this.gameTime.elapsed = 0;
    this.gameTime.paused = true;
    this.gameTime.setTimeScale(1);
    this.referenceEntityId = null;
    this.combatLog.clear();

    const builtIn: Record<string, () => void> = {
      demo: () => this.loadDemoScenario(),
      solarSystem: () => this.loadSolarSystemScenario(),
      redDwarf: () => this.loadRedDwarfScenario(),
      provingGrounds: () => this.loadProvingGroundsScenario(),
    };

    if (builtIn[id]) {
      builtIn[id]();
    } else {
      await this.loadScenarioByName(id);
    }
    this.updatePauseUI();
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
    this.cameraAnimator.startFocus(targetX, targetY);
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

  private loadSolarSystemScenario(): void {
    loadScenario(this.world, solarSystemScenario);
    this.victorySystem.reset();
    this.centerCameraOnFlagship();
    this.camera.zoomToFit(300_000_000, 300_000_000);
  }

  private loadRedDwarfScenario(): void {
    loadScenario(this.world, redDwarfScenario);
    this.victorySystem.reset();
    this.centerCameraOnFlagship();
    this.camera.zoomToFit(500_000, 500_000);
  }

  private loadProvingGroundsScenario(): void {
    loadScenario(this.world, provingGroundsScenario);
    this.victorySystem.reset();
    this.centerCameraOnFlagship();
    this.camera.zoomToFit(400_000, 400_000);
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
