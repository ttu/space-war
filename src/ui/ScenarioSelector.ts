export interface ScenarioEntry {
  id: string;
  label: string;
}

export interface ScenarioSelectorCallbacks {
  onScenarioChange: (id: string) => void;
}

const SCENARIOS: ScenarioEntry[] = [
  { id: 'demo', label: 'Demo — Solar System' },
  { id: 'redDwarf', label: 'Red Dwarf System' },
  { id: 'tutorial', label: 'Tutorial' },
  { id: 'patrol', label: 'Patrol' },
  { id: 'fleet-action', label: 'Fleet Action' },
  { id: 'ambush', label: 'Ambush' },
];

export class ScenarioSelector {
  private select: HTMLSelectElement;

  constructor(
    container: HTMLElement,
    callbacks: ScenarioSelectorCallbacks,
    initialId = 'demo',
  ) {
    this.select = document.createElement('select');
    this.select.className = 'scenario-selector';
    this.select.title = 'Select scenario';

    for (const entry of SCENARIOS) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.label;
      this.select.appendChild(option);
    }

    this.select.value = initialId;

    this.select.addEventListener('change', () => {
      callbacks.onScenarioChange(this.select.value);
    });

    container.appendChild(this.select);
  }

  setScenario(id: string): void {
    this.select.value = id;
  }
}
