import * as THREE from 'three';

/**
 * Top-down orthographic camera for the tactical radar view.
 * X = right, Y = up on screen. Camera looks down -Z axis.
 */
export class CameraController {
  public camera: THREE.OrthographicCamera;
  /** Camera center position in world km */
  private position = new THREE.Vector2(0, 0);
  /** Visible half-height in km */
  private zoom = 50000; // Start showing 100,000 km vertically
  private minZoom = 100;
  private maxZoom = 200_000_000;
  private zoomSpeed = 0.001;

  constructor(private aspect: number) {
    this.camera = new THREE.OrthographicCamera(
      -this.zoom * aspect,
      this.zoom * aspect,
      this.zoom,
      -this.zoom,
      0.1,
      10,
    );
    // Pure top-down: camera at (0, 0, 5) looking down
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.updateProjection();
  }

  panByScreenDelta(
    deltaX: number,
    deltaY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const worldPerPixelX = (2 * this.zoom * this.aspect) / canvasWidth;
    const worldPerPixelY = (2 * this.zoom) / canvasHeight;
    // Invert: dragging right moves camera left (pans view right)
    this.position.x -= deltaX * worldPerPixelX;
    this.position.y += deltaY * worldPerPixelY;
    this.updateCameraPosition();
  }

  pan(dx: number, dy: number, deltaTime: number): void {
    const speed = this.zoom * 2 * deltaTime;
    this.position.x += dx * speed;
    this.position.y += dy * speed;
    this.updateCameraPosition();
  }

  zoomBy(delta: number): void {
    const factor = 1 + delta * this.zoomSpeed;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    this.updateProjection();
    this.updateCameraPosition();
  }

  zoomToFit(width: number, height: number, padding = 1.2): void {
    const zoomForWidth = (width * padding) / (2 * this.aspect);
    const zoomForHeight = (height * padding) / 2;
    this.zoom = Math.max(zoomForWidth, zoomForHeight);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.updateProjection();
  }

  private updateProjection(): void {
    this.camera.left = -this.zoom * this.aspect;
    this.camera.right = this.zoom * this.aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraPosition(): void {
    this.camera.position.x = this.position.x;
    this.camera.position.y = this.position.y;
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.updateProjection();
  }

  /** Convert screen pixel position to world km coordinates */
  screenToWorld(screenX: number, screenY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;
    return {
      x: this.position.x + ndcX * this.zoom * this.aspect,
      y: this.position.y + ndcY * this.zoom,
    };
  }

  /** Convert world km to screen pixel position */
  worldToScreen(worldX: number, worldY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const ndcX = (worldX - this.position.x) / (this.zoom * this.aspect);
    const ndcY = (worldY - this.position.y) / this.zoom;
    return {
      x: ((ndcX + 1) / 2) * rect.width + rect.left,
      y: ((-ndcY + 1) / 2) * rect.height + rect.top,
    };
  }

  getPosition(): THREE.Vector2 {
    return this.position.clone();
  }

  getZoom(): number {
    return this.zoom;
  }

  setPosition(x: number, y: number): void {
    this.position.set(x, y);
    this.updateCameraPosition();
  }
}
