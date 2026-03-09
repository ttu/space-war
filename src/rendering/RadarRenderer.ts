import * as THREE from 'three';

/**
 * Renders the background radar grid.
 * Grid spacing adapts to zoom level for readability.
 */
export class RadarRenderer {
  private gridGroup = new THREE.Group();
  private scaleLabel: HTMLDivElement | null = null;
  private currentGridSpacing = 0;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.gridGroup);
  }

  update(cameraX: number, cameraY: number, zoom: number): void {
    const gridSpacing = this.chooseGridSpacing(zoom);
    if (gridSpacing !== this.currentGridSpacing) {
      this.rebuildGrid(gridSpacing, cameraX, cameraY, zoom);
      this.currentGridSpacing = gridSpacing;
    } else {
      this.repositionGrid(gridSpacing, cameraX, cameraY, zoom);
    }
  }

  private chooseGridSpacing(zoom: number): number {
    // Show ~8-15 grid lines across the visible height
    const target = zoom * 2 / 10;
    // Snap to nice values: 100, 500, 1000, 5000, 10000, 50000, 100000, ...
    const niceValues = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];
    for (const v of niceValues) {
      if (v >= target) return v;
    }
    return niceValues[niceValues.length - 1];
  }

  private rebuildGrid(spacing: number, cx: number, cy: number, zoom: number): void {
    // Clear old grid
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0];
      this.gridGroup.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }

    this.buildGridLines(spacing, cx, cy, zoom);
  }

  private repositionGrid(spacing: number, cx: number, cy: number, zoom: number): void {
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0];
      this.gridGroup.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    this.buildGridLines(spacing, cx, cy, zoom);
  }

  private buildGridLines(spacing: number, cx: number, cy: number, zoom: number): void {
    const extent = zoom * 2;
    const startX = Math.floor((cx - extent) / spacing) * spacing;
    const endX = Math.ceil((cx + extent) / spacing) * spacing;
    const startY = Math.floor((cy - extent) / spacing) * spacing;
    const endY = Math.ceil((cy + extent) / spacing) * spacing;

    const vertices: number[] = [];

    // Vertical lines
    for (let x = startX; x <= endX; x += spacing) {
      vertices.push(x, startY, 0, x, endY, 0);
    }
    // Horizontal lines
    for (let y = startY; y <= endY; y += spacing) {
      vertices.push(startX, y, 0, endX, y, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x1a2a3a,
      transparent: true,
      opacity: 0.5,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = -1;
    this.gridGroup.add(lines);
  }

  updateScaleLabel(zoom: number, container: HTMLElement): void {
    if (!this.scaleLabel) {
      this.scaleLabel = document.createElement('div');
      this.scaleLabel.style.cssText = `
        position: absolute;
        bottom: 12px;
        right: 12px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #384858;
        z-index: 10;
      `;
      container.appendChild(this.scaleLabel);
    }
    const spacing = this.chooseGridSpacing(zoom);
    this.scaleLabel.textContent = `Grid: ${this.formatDistance(spacing)}`;
  }

  private formatDistance(km: number): string {
    if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(0)}M km`;
    if (km >= 1000) return `${(km / 1000).toFixed(0)}k km`;
    return `${km} km`;
  }

  dispose(): void {
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0];
      this.gridGroup.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    this.scene.remove(this.gridGroup);
    this.scaleLabel?.remove();
  }
}
