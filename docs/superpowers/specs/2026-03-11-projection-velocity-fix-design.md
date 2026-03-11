# Fix Trajectory Projection & Improve Velocity Vector

## Problem

1. Ships appear to "miss" destinations. The trajectory projection line is inaccurate because `estimatePhaseRemaining()` returns the full phase duration instead of remaining time.
2. The velocity vector on ships is too subtle (low opacity, same color as ship, short length) to help visualize drift.

## Changes

### 1. Fix projection line accuracy (TrailRenderer)

- Pass `gameTime` into `TrailRenderer.update()` from SpaceWarGame
- `estimatePhaseRemaining()` calculates: `totalPhaseTime - (gameTime - nav.phaseStartTime)`, clamped to 0
- No visual style changes needed

### 2. Improve velocity vector visibility (ShipRenderer)

- Color: white (`0xcccccc`) instead of faction color
- Opacity: 0.6 (from 0.4)
- Length: `speed * 80` capped at `zoom * 0.4` (from `speed * 50` / `zoom * 0.3`)

### Files

| File | Change |
|------|--------|
| `src/rendering/TrailRenderer.ts` | Accept `gameTime`, fix `estimatePhaseRemaining` |
| `src/rendering/ShipRenderer.ts` | Velocity line color, opacity, length |
| `src/game/SpaceWarGame.ts` | Pass `gameTime` to `TrailRenderer.update()` |
