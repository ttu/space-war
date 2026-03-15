# UI Layout Redesign — Asymmetric Combat UI

**Date:** 2026-03-15
**Status:** Approved

## Problem

All UI panels (Fleet, Contacts, Ship Detail) are stacked in a single 220px left sidebar. This makes it hard to:
- Track missile salvos fired by selected ship
- See enemy positions and ranges at a glance
- Distinguish friendly vs hostile information
- Manage screen real estate during combat

## Design

### Layout Structure

Asymmetric split — narrow left for fleet/ship status, wider right for combat intel.

| Position | Panel | Width | Content |
|----------|-------|-------|---------|
| Top center | Time Controls | auto | Pause, speed, clock, targeting readout, camera lock (unchanged) |
| Left | Fleet + Ship Detail | ~200px | Fleet roster on top, selected ship detail below |
| Right | Contacts + Missiles + Incoming | ~260px | Enemy contacts, active missile salvos, incoming threats |
| Bottom-left | Orders | auto | Move, Missile, Railgun, Shadows toggle (unchanged) |
| Overlay | Combat Log | ~400px | Hidden by default, toggled with `L`, semi-transparent bottom-center |

### Panel Details

#### Left Side — Fleet Panel
- Ship roster with hull health bars (same as current)
- Selected ship highlighted with `▸` marker
- Click ship name to select + focus camera

#### Left Side — Ship Detail Panel
- **Single select:** Full detail — hull, speed, nav status, systems (reactor/engines/sensors), weapons (ammo + integrity)
- **Multi-select:** Compact row per ship showing hull + ammo summary (e.g., `Destroyer-01  85/100 · M:8 R:4`). Click a ship name to expand its full detail.

#### Right Side — Contacts Panel (moved from left)
- Enemy contacts with **inline distance**, color-coded by range:
  - Red = close/dangerous
  - Yellow = medium range
  - Grey = far/low threat
- Location summary and data age (light-speed delay)
- Click contact to focus camera

#### Right Side — Active Missiles Panel (NEW)
Per-salvo information:
- Salvo count (×4) and target name
- Distance to target (color-coded)
- Guidance mode (Seeker / Hybrid / Ballistic)
- Fuel remaining (seconds)
- Armed status
- Hit probability percentage

#### Right Side — Incoming Threats Panel (NEW)
Enemy missiles targeting the selected ship:
- Missile count per salvo
- Distance and closing speed
- PDC engagement status (Engaging / Out of range)
- Estimated time to arrival

#### Overlay — Combat Log
- Hidden by default
- Toggle with `L` key
- Semi-transparent overlay at bottom-center
- Same content as current (event history with timestamps)
- Does not displace other panels

### Collapsible Panels + Hotkeys

All panels collapsible via header click or keyboard shortcut:

| Key | Panel |
|-----|-------|
| F1 | Fleet |
| F2 | Ship Detail |
| F3 | Contacts |
| F4 | Active Missiles |
| F5 | Incoming Threats |
| L | Combat Log overlay |

Existing hotkeys preserved: `V` (Shadows), `Space` (Pause), etc.

### Unchanged

- Time Controls panel (top center)
- Order Bar (bottom-left)
- Ship Config/Loadout screen
- Camera lock indicator
- Celestial body detail (shown in Ship Detail area when celestial selected)

## Files Affected

### Modified
- `index.html` — CSS layout changes (left-panel → left/right panels, combat-log styles → overlay)
- `src/game/SpaceWarGame.ts` — UI setup: create right panel container, wire new panels, register hotkeys
- `src/ui/ShipDetailPanel.ts` — Split out missile/incoming data, add compact multi-select mode
- `src/ui/ContactsPanel.ts` — Add inline distances with color coding, move to right container
- `src/ui/FleetPanel.ts` — Minor: adjust width for new left panel size
- `src/ui/CombatLog.ts` — Convert to overlay with toggle visibility
- `src/ui/OrderBar.ts` — Minor position adjustment
- `src/core/InputManager.ts` — Register F1-F5, L hotkey bindings

### New
- `src/ui/ActiveMissilesPanel.ts` — Dedicated panel for tracking in-flight missile salvos
- `src/ui/IncomingThreatsPanel.ts` — Panel for enemy missiles targeting selected ship
- `src/ui/PanelManager.ts` — Manages panel collapse/expand state, hotkey registration, persistence

## Data Sources

Active Missiles panel data comes from:
- World query for entities with Missile component + matching faction
- Existing `missileHitProbability()` calculation in ShipDetailPanel
- MissileSystem provides guidance mode, fuel, armed status

Incoming Threats panel data comes from:
- World query for enemy Missile components targeting selected ship entity
- Distance/closing speed calculated from Position + Velocity components
- PDC engagement status from PDCSystem or weapon component state
