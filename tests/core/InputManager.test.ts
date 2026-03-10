/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { InputManager } from '../../src/core/InputManager';
import type { InputEvent } from '../../src/core/InputManager';

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  return canvas;
}

describe('InputManager - box select', () => {
  it('emits boxSelect when left mouse drags past threshold, and no click', () => {
    const canvas = createCanvas();
    const input = new InputManager(canvas);
    const events: InputEvent[] = [];
    input.onInput((e) => events.push(e));

    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent('mousemove', { button: 0, clientX: 50, clientY: 50 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 50, clientY: 50 }));

    const boxSelects = events.filter((e): e is Extract<InputEvent, { type: 'boxSelect' }> => e.type === 'boxSelect');
    const clicks = events.filter((e) => e.type === 'click');
    expect(boxSelects).toHaveLength(1);
    expect(boxSelects[0].startScreenX).toBe(10);
    expect(boxSelects[0].startScreenY).toBe(10);
    expect(boxSelects[0].endScreenX).toBe(50);
    expect(boxSelects[0].endScreenY).toBe(50);
    expect(clicks).toHaveLength(0);
    input.destroy();
  });

  it('emits click when left mouse released without dragging', () => {
    const canvas = createCanvas();
    const input = new InputManager(canvas);
    const events: InputEvent[] = [];
    input.onInput((e) => events.push(e));

    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 10, clientY: 10 }));

    const boxSelects = events.filter((e) => e.type === 'boxSelect');
    const clicks = events.filter((e) => e.type === 'click');
    expect(clicks).toHaveLength(1);
    expect(boxSelects).toHaveLength(0);
    input.destroy();
  });
});
