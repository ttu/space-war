export type InputEvent =
  | { type: 'click'; screenX: number; screenY: number; shiftKey: boolean }
  | { type: 'rightClick'; screenX: number; screenY: number }
  | { type: 'boxSelect'; startScreenX: number; startScreenY: number; endScreenX: number; endScreenY: number; shiftKey: boolean }
  | { type: 'boxSelectUpdate'; startScreenX: number; startScreenY: number; endScreenX: number; endScreenY: number }
  | { type: 'zoom'; delta: number }
  | { type: 'cameraPanDrag'; deltaX: number; deltaY: number; canvasWidth: number; canvasHeight: number }
  | { type: 'togglePause' }
  | { type: 'changeSpeed'; delta: number }
  | { type: 'escape' }
  | { type: 'focusNearestEnemy' };

type InputEventCallback = (event: InputEvent) => void;

export class InputManager {
  private keys: Set<string> = new Set();
  private listeners: InputEventCallback[] = [];
  private isRightMouseDown = false;
  private lastMouseScreen = { x: 0, y: 0 };
  private hasRightDragged = false;
  private rightClickEmitted = false;
  /** Set on mousedown(button 2); used to avoid emitting rightClick twice when both mouseup and contextmenu fire (real mouse). */
  private rightMouseButtonDown = false;
  private isLeftMouseDown = false;
  private leftDragStart = { x: 0, y: 0 };
  private hasLeftDragged = false;
  private readonly dragThreshold = 5;
  /** Require more movement for right-drag so right-click isn't lost to accidental pan */
  private readonly rightDragThreshold = 20;
  private boundHandlers: { type: string; handler: EventListener; target: EventTarget; capture?: boolean }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.setupEventListeners();
  }

  onInput(callback: InputEventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private emit(event: InputEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** True if (clientX, clientY) is inside the canvas's bounding rect (for overlay-insensitive hit test). */
  private isPointOverCanvas(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  private addListener(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.boundHandlers.push({ type, handler, target });
  }

  private addListenerCapture(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler, { capture: true });
    this.boundHandlers.push({ type, handler, target, capture: true });
  }

  private setupEventListeners(): void {
    this.addListener(window, 'keydown', ((e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        this.emit({ type: 'togglePause' });
      }
      if (e.code === 'Escape') this.emit({ type: 'escape' });
      if (e.code === 'KeyE') {
        e.preventDefault();
        this.emit({ type: 'focusNearestEnemy' });
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.emit({ type: 'changeSpeed', delta: -1 });
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.emit({ type: 'changeSpeed', delta: 1 });
      if (e.code === 'BracketRight') {
        e.preventDefault();
        this.emit({ type: 'zoom', delta: -100 });
      }
      if (e.code === 'BracketLeft') {
        e.preventDefault();
        this.emit({ type: 'zoom', delta: 100 });
      }
    }) as EventListener);

    this.addListener(window, 'keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
    }) as EventListener);

    this.addListener(this.canvas, 'mousedown', ((e: MouseEvent) => {
      this.lastMouseScreen = { x: e.clientX, y: e.clientY };
      if (e.button === 0) {
        this.isLeftMouseDown = true;
        this.leftDragStart = { x: e.clientX, y: e.clientY };
        this.hasLeftDragged = false;
      } else if (e.button === 2) {
        this.isRightMouseDown = true;
        this.rightMouseButtonDown = true;
        this.hasRightDragged = false;
        this.rightClickEmitted = false;
      }
    }) as EventListener);

    this.addListener(this.canvas, 'mouseup', ((e: MouseEvent) => {
      if (e.button === 0) {
        if (this.hasLeftDragged) {
          this.emit({
            type: 'boxSelect',
            startScreenX: this.leftDragStart.x,
            startScreenY: this.leftDragStart.y,
            endScreenX: e.clientX,
            endScreenY: e.clientY,
            shiftKey: e.shiftKey,
          });
        } else {
          this.emit({ type: 'click', screenX: e.clientX, screenY: e.clientY, shiftKey: e.shiftKey });
        }
        this.isLeftMouseDown = false;
      } else if (e.button === 2) {
        this.isRightMouseDown = false;
        if (!this.hasRightDragged && !this.rightClickEmitted) {
          this.rightClickEmitted = true;
          this.emit({ type: 'rightClick', screenX: e.clientX, screenY: e.clientY });
        }
        // Leave rightMouseButtonDown true so contextmenu (fires after mouseup) can skip emitting; contextmenu clears it.
      }
    }) as EventListener);

    this.addListener(this.canvas, 'mousemove', ((e: MouseEvent) => {
      if (this.isRightMouseDown) {
        const deltaX = e.clientX - this.lastMouseScreen.x;
        const deltaY = e.clientY - this.lastMouseScreen.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > this.rightDragThreshold) this.hasRightDragged = true;
        if (this.hasRightDragged) {
          const rect = this.canvas.getBoundingClientRect();
          this.emit({
            type: 'cameraPanDrag',
            deltaX,
            deltaY,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
          });
        }
        this.lastMouseScreen = { x: e.clientX, y: e.clientY };
      } else if (this.isLeftMouseDown) {
        const deltaX = e.clientX - this.leftDragStart.x;
        const deltaY = e.clientY - this.leftDragStart.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > this.dragThreshold) {
          if (!this.hasLeftDragged) this.hasLeftDragged = true;
          this.emit({
            type: 'boxSelectUpdate',
            startScreenX: this.leftDragStart.x,
            startScreenY: this.leftDragStart.y,
            endScreenX: e.clientX,
            endScreenY: e.clientY,
          });
        }
      }
    }) as EventListener);

    this.addListener(this.canvas, 'wheel', ((e: WheelEvent) => {
      e.preventDefault();
      this.emit({ type: 'zoom', delta: e.deltaY });
    }) as EventListener);

    this.addListener(this.canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);

    // When right-click lands on an overlay, canvas doesn't get mousedown/mouseup; emit rightClick from contextmenu.
    // On macOS touchpad, two-finger tap often fires only contextmenu (no button 2 mousedown/mouseup). The event target
    // can be the overlay div (stacked above canvas) rather than the canvas, so we also treat any contextmenu whose
    // position is over the canvas as a rightClick. Use rightMouseButtonDown to avoid double-emit when real mouse
    // triggers both mouseup and contextmenu.
    this.addListenerCapture(document, 'contextmenu', ((e: Event) => {
      e.preventDefault();
      const me = e as MouseEvent;
      const el = me.target as Element;
      const overCanvas = this.isPointOverCanvas(me.clientX, me.clientY);
      if (overCanvas) {
        if (!this.rightMouseButtonDown) {
          this.emit({ type: 'rightClick', screenX: me.clientX, screenY: me.clientY });
        }
      } else if (!el.closest?.('button')) {
        this.emit({ type: 'rightClick', screenX: me.clientX, screenY: me.clientY });
      }
      this.rightMouseButtonDown = false;
    }) as EventListener);
  }

  getCameraMovement(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const len = Math.sqrt(x * x + y * y);
    if (len > 0) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  destroy(): void {
    for (const { target, type, handler, capture } of this.boundHandlers) {
      target.removeEventListener(type, handler, { capture: !!capture });
    }
    this.boundHandlers = [];
  }
}
