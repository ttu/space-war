# Game Guide

How to play Space War — a real-time tactical space combat game.

## Overview

You are a fleet commander viewing the battlefield from a tactical radar display (CIC perspective). Command your ships to outmaneuver and destroy the enemy fleet using Newtonian physics, missiles, railguns, and point defense systems.

The game simulates realistic space combat: there is no friction, sensors are limited by light-speed delay, and weapons have real travel times.

## Controls

### Camera

| Input | Action |
|-------|--------|
| Scroll wheel | Zoom in/out |
| **[** / **]** | Zoom out / Zoom in |
| Right-click drag | Pan camera |
| WASD / Arrow keys | Pan camera |

### Selection

| Input | Action |
|-------|--------|
| Left-click ship | Select ship |
| Shift + left-click | Add/remove from selection |
| Left-click drag | Box select all ships in area |
| Left-click empty space | Deselect all |

### Orders

| Input | Action |
|-------|--------|
| Right-click empty space | Move selected ships to location |
| Right-click enemy ship | Fire weapons at target |
| Move button + right-click | Move to location |
| Fire Missile button + right-click enemy | Launch missile salvo |
| Fire Railgun button + right-click enemy | Fire railguns |

### Time

| Input | Action |
|-------|--------|
| Space | Pause / Resume |
| Speed buttons (1x–100x) | Change simulation speed |

## Game Mechanics

### Navigation

Ships use **brachistochrone trajectories** — the fastest point-to-point path using constant thrust:

1. **Rotate** to face the burn direction
2. **Accelerate** at full thrust toward destination
3. **Flip** — rotate 180° to face retrograde
4. **Decelerate** at full thrust to arrive at zero relative velocity
5. **Arrived** — engines off

Trajectory projections are shown as dashed lines:
- **Cyan dashed line**: active navigation burn plan
- **Yellow dashed line**: current drift trajectory (no orders)
- **Cyan crosshair**: destination marker

Ships cannot stop instantly. Heavier ships (Battleship, Carrier) have lower thrust and take longer to maneuver.

Move orders automatically **avoid celestial bodies**: if the straight line to your destination would pass through a planet or moon’s danger zone, the game plots a bypass waypoint so the ship curves around. Ships also correct course in flight if their path later crosses a body.

### Celestial Hazards

Planets, moons, and stations have a **danger zone** (1.5× their radius). Staying inside it damages hull each tick; touching the surface destroys the ship. Missiles and railgun rounds are destroyed in the zone. Keep movement paths clear of gravity wells—the UI shows danger zones as rings around bodies.

### Sensors & Fog of War

The battlefield is subject to full **fog of war**:

- Enemy ships are only visible when detected by your sensors
- Detection is based on **thermal signature** — ships running engines are much easier to detect
- Sensor data arrives with **light-speed delay** — distant contacts show where the ship *was*, not where it *is*
- Contacts fade and become less reliable over time
- Lost contacts disappear after 30 seconds without re-detection

**Visual indicators:**
- Bright, solid icons = strong, recent contact
- Faded icons = old or weak signal data
- Ship positions may be inaccurate for distant/old contacts

### Weapons

#### Missiles

Self-guided projectiles that home in on targets.

- **Guidance modes**: Sensor-guided (using fleet sensors) → Seeker (onboard thermal sensor) → Ballistic (fuel exhausted)
- **Proportional navigation**: missiles steer to intercept, not chase
- Fired in **salvos** (multiple missiles per launch)
- Limited **ammo** and **reload time** between salvos
- **Fuel-limited** — missiles that run out of fuel go ballistic and eventually expire
- Longer range = more time for target to evade or intercept

#### Point Defense Cannons (PDCs)

Short-range automatic weapons that shoot down incoming missiles.

- **Fully automatic** — no player input needed
- Fire at hostile missiles within range (4–6 km)
- Each round destroys one missile from a salvo
- Higher fire rate = more missiles killed per second
- Critical for survival — ships without PDCs are vulnerable to missile salvos

#### Railguns

High-velocity kinetic projectiles for ship-to-ship combat.

- Travel in **straight lines** at constant speed (90–110 km/s)
- Require **lead targeting** — the firing computer predicts where the target will be
- **Hit probability** decreases with range and target speed
- High damage per hit but hard to land
- The targeting display shows hit probability percentage

### Damage System

Ships take damage to multiple systems:

- **Hull**: main health pool, ship destroyed at 0
- **Armor**: reduces incoming damage
- **Subsystems**: reactor, engines, sensors — each can be damaged independently
  - Damaged **engines** reduce thrust capability
  - Damaged **sensors** reduce detection range
- **Weapons**: missile launchers, PDCs, railguns can be damaged or disabled
- **30% chance** of subsystem damage on each hit
- **25% chance** of weapon damage when a subsystem is hit

Missile salvos deal 15 damage per missile. Railgun hits deal 35–60 damage depending on the weapon.

### Ship Classes

Ships range from small, fast corvettes to massive carriers:

| Class | Hull | Armor | Thrust | Role |
|-------|------|-------|--------|------|
| Corvette | 40 | 2 | 0.20 km/s² | Fast scout, light weapons |
| Frigate | 60 | 3 | 0.18 km/s² | Light combatant |
| Destroyer | 80 | 4 | 0.15 km/s² | Medium combatant, balanced loadout |
| Cruiser | 100 | 5 | 0.10 km/s² | Heavy combatant, strong weapons |
| Battleship | 150 | 8 | 0.06 km/s² | Maximum firepower and armor |
| Carrier | 120 | 6 | 0.08 km/s² | Long-range sensors, large missile capacity |

Larger ships carry heavier weapons and more ammunition but are slower to maneuver.

### AI Behavior

Enemy ships operate with two-layer AI:

- **Strategic layer**: fleet-level decisions every 3 seconds
  - **Engage**: move toward and attack detected player ships
  - **Disengage**: retreat when hull drops below 35%
  - **Hold**: wait at position

- **Tactical layer**: per-ship weapon decisions
  - Launches missiles when within 85% of maximum range
  - Fires railguns only when hit probability is 20% or higher
  - Issues movement orders to execute strategic intent

### Victory Conditions

- **Victory**: all enemy ships destroyed while at least one player ship survives
- **Defeat**: all player ships destroyed

## UI Panels

### Time Controls (top bar)

- Pause/resume button and game clock (`T+MM:SS`)
- Speed selection: 1x through 100x
- Targeting readout: shows hit probability when hovering over enemies

### Fleet Panel (left side)

- List of all your ships
- Hull health bars
- Click to select ships
- Highlights currently selected ships

### Ship Detail Panel (right side)

When a single ship is selected:
- Hull, reactor, engines, sensors status
- Current thrust percentage
- Active movement order
- Weapon status: ammo, integrity, reload state

When an enemy contact is selected:
- Last known position and velocity
- Data age (how old the sensor reading is)
- Contact status (active/lost)

### Order Bar (bottom)

Context-sensitive buttons:
- **Move**: click then right-click destination
- **Fire Missile**: click then right-click enemy target
- **Fire Railgun**: click then right-click enemy target

### Combat Log (bottom right)

Scrollable history of combat events:
- Missile launches, interceptions, and impacts
- Railgun shots and hits
- Celestial collisions (ships or projectiles lost to planets/moons)
- Ship detections and lost contacts
- System damage and ship destructions
- Victory/defeat announcements

## Tips

- **Pause frequently** — use pause (Space) to assess the situation and issue complex orders
- **Watch your ammo** — missiles are limited, don't waste salvos at extreme range
- **Use speed advantage** — corvettes and frigates can outmaneuver heavier ships
- **Mind the delay** — distant enemy positions are old data, lead your attacks
- **Avoid gravity wells** — don’t plot moves through planets or moons; use bypass waypoints
- **Protect your PDCs** — ships with damaged point defense are easy missile targets
- **Focus fire** — concentrate weapons on one target to overwhelm its defenses
- **Check hit probability** — don't fire railguns at targets you can't reliably hit
