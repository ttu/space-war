export interface PanelRegistration {
  id: string;
  element: HTMLElement;
  headerElement: HTMLElement;
  hotkey: string; // e.g. 'F1'
}

interface PanelState {
  reg: PanelRegistration;
  collapsed: boolean;
}

export class PanelManager {
  private panels = new Map<string, PanelState>();
  private hotkeyMap = new Map<string, string>(); // hotkey code -> panel id

  register(reg: PanelRegistration): void {
    reg.headerElement.classList.add('panel-header-collapsible');

    const hint = document.createElement('span');
    hint.className = 'panel-hotkey-hint';
    hint.textContent = reg.hotkey;
    reg.headerElement.appendChild(hint);

    reg.headerElement.addEventListener('click', () => this.toggle(reg.id));

    this.panels.set(reg.id, { reg, collapsed: false });
    this.hotkeyMap.set(reg.hotkey, reg.id);
  }

  toggle(id: string): void {
    const state = this.panels.get(id);
    if (!state) return;

    state.collapsed = !state.collapsed;

    if (state.collapsed) {
      state.reg.element.classList.add('panel-collapsed');
      state.reg.headerElement.classList.add('collapsed');
    } else {
      state.reg.element.classList.remove('panel-collapsed');
      state.reg.headerElement.classList.remove('collapsed');
    }
  }

  isCollapsed(id: string): boolean {
    return this.panels.get(id)?.collapsed ?? false;
  }

  handleHotkey(code: string): boolean {
    const id = this.hotkeyMap.get(code);
    if (id === undefined) return false;
    this.toggle(id);
    return true;
  }
}
