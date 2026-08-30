// RF Remote Card — stateless version
// Every button is a one-shot button.press call. No state is tracked or
// displayed (no "active speed", no on/off indicator) because this is a
// pure one-way RF remote — the physical remote may also be used at any
// time, so nothing in Home Assistant can ever know the fan/light's real
// current state. This card just fires the RF code and gives a brief
// tactile press animation, nothing more.
//
// Install: copy to config/www/rf-remote-card.js, add as a Lovelace
// resource (Settings > Dashboards > (kebab) > Resources), URL:
// /local/rf-remote-card.js, type: JavaScript Module


class RfRemoteCard extends HTMLElement {
  setConfig(config) {
    if (!config.rooms || !config.rooms.length) {
      throw new Error('rf-remote-card: define at least one room under "rooms:"');
    }
    this._config = config;
    this._roomIndex = 0;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this._style();
      this._render();
    }
  }

  getCardSize() { return 8; }

  set hass(hass) {
    this._hass = hass;
    // No state to read back — nothing to do here.
  }

  _room() { return this._config.rooms[this._roomIndex]; }

  _press(entity_id) {
    if (!entity_id || !this._hass) return;
    this._hass.callService('button', 'press', { entity_id });
  }

  _icon(name) {
    const icons = {
      power: '<path d="M12 2v8M6.3 6.3a8 8 0 1 0 11.4 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
      reverse: '<path d="M17 2l4 4-4 4M21 6H8a4 4 0 0 0-4 4v1M7 22l-4-4 4-4M3 18h13a4 4 0 0 0 4-4v-1" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      tempMinus: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      tempPlus: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      tempPreset: '<path d="M12 3a5 5 0 0 0-3 9c0 3 1 6 3 9 2-3 3-6 3-9a5 5 0 0 0-3-9z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
      sunMinus: '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      sunPlus: '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 2v2M12 20v2M4 4l1.4 1.4M18.6 18.6L20 20M2 12h2M20 12h2M4 20l1.4-1.4M18.6 5.4L20 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.1 1.1 1.9V16h5v-.3c.1-.8.5-1.45 1.1-1.9A6 6 0 0 0 12 3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'
    };
    return `<svg viewBox="0 0 24 24">${icons[name] || ''}</svg>`;
  }

  _style() {
    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; }
      .chassis {
        --stone-100:#EDECE8; --stone-200:#DAD8D2; --stone-300:#CFCDC5;
        --face:#F7F6F3; --face-pressed:#D8D6D0; --ink:#2B2C2E; --ink-soft:#8B8A85;
        --aqua:#3E8E86; --aqua-glow:rgba(62,142,134,0.28);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: linear-gradient(180deg, var(--stone-100), var(--stone-300));
        border-radius: 32px;
        padding: 20px 18px 22px;
        box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 -8px 18px rgba(0,0,0,0.06) inset, 0 10px 22px rgba(30,28,24,0.14);
      }
      .room-toggle { display:flex; background: var(--face-pressed); border-radius:999px; padding:4px; margin-bottom:16px; box-shadow: 0 1px 3px rgba(0,0,0,0.12) inset; }
      .room-toggle button { flex:1; border:none; background:transparent; padding:8px 6px; border-radius:999px; font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-soft); cursor:pointer; }
      .room-toggle button.active { background: var(--ink); color:#fff; box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
      .section-label { font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-soft); text-align:center; margin:2px 0 10px; }
      .dial-wrap { position:relative; width:216px; height:216px; margin:0 auto 6px; }
      .dial-ring { position:absolute; inset:0; border-radius:50%; background: radial-gradient(circle at 50% 42%, var(--stone-100), var(--stone-300) 78%); box-shadow: 0 6px 14px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.7) inset; }
      .speed-btn { position:absolute; width:48px; height:48px; border-radius:50%; border:none; background:var(--face); color:var(--ink); font-size:15px; font-weight:700; cursor:pointer; box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.8) inset; transition: transform .1s, box-shadow .1s; }
      .speed-btn:active { transform: scale(0.9); box-shadow: 0 0 0 5px var(--aqua-glow), 0 1px 3px rgba(0,0,0,0.2); }
      .center-btn { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:68px; height:68px; border-radius:50%; border:none; background:var(--face-pressed); color:var(--ink); cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.18) inset; display:flex; align-items:center; justify-content:center; transition: transform .1s; }
      .center-btn:active { transform: translate(-50%,-50%) scale(0.92); background: var(--ink); color: #fff; }
      .center-btn svg { width:24px; height:24px; }
      .reverse-row { display:flex; justify-content:center; margin:4px 0 18px; }
      .pill-btn { border:none; background:var(--face); color:var(--ink); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:8px 16px; border-radius:999px; cursor:pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.7) inset; display:flex; align-items:center; gap:6px; transition: transform .1s; }
      .pill-btn:active { transform: scale(0.95); }
      .pill-btn svg { width:14px; height:14px; }
      .icon-row { display:flex; justify-content:space-between; gap:8px; margin-bottom:12px; }
      .icon-btn { flex:1; border:none; background:var(--face); color:var(--ink); padding:11px 0; border-radius:16px; cursor:pointer; box-shadow: 0 3px 6px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.8) inset; display:flex; align-items:center; justify-content:center; transition: transform .1s; }
      .icon-btn:active { transform: scale(0.92); background: var(--face-pressed); }
      .icon-btn svg { width:16px; height:16px; }
      .bar-row { display:flex; background:var(--face); border-radius:16px; box-shadow: 0 3px 6px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.8) inset; margin-bottom:16px; overflow:hidden; }
      .bar-row button { flex:1; border:none; background:transparent; color:var(--ink); padding:11px 0; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: background .1s; }
      .bar-row button:active { background: var(--face-pressed); }
      .bar-row button.center { border-left:1px solid var(--stone-300); border-right:1px solid var(--stone-300); }
      .bar-row svg { width:15px; height:15px; }
      .timer-row { display:flex; gap:8px; }
      .timer-btn { flex:1; border:none; background:var(--face); color:var(--ink); font-size:12px; font-weight:700; padding:10px 0; border-radius:12px; cursor:pointer; box-shadow: 0 3px 6px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.8) inset; transition: transform .1s; }
      .timer-btn:active { transform: scale(0.94); background: var(--face-pressed); }
    `;
    this.shadowRoot.appendChild(style);
  }

  _render() {
    const root = this.shadowRoot;
    let wrap = root.querySelector('.chassis');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'chassis';
      root.appendChild(wrap);
    }

    const rooms = this._config.rooms;
    const r = this._room();

    wrap.innerHTML = `
      <div class="room-toggle">
        ${rooms.map((rm, i) => `<button data-i="${i}" class="${i === this._roomIndex ? 'active' : ''}">${rm.name}</button>`).join('')}
      </div>

      <div class="section-label">Fan</div>
      <div class="dial-wrap">
        <div class="dial-ring"></div>
        ${[2, 3, 4, 5, 6, 1].map((n, i) => {
          const angle = -90 + i * 60;
          const rad = angle * Math.PI / 180;
          const rr = 84;
          const x = 108 + rr * Math.cos(rad) - 24;
          const y = 108 + rr * Math.sin(rad) - 24;
          return `<button class="speed-btn" data-speed="${n}" style="left:${x}px; top:${y}px;">${n}</button>`;
        }).join('')}
        <button class="center-btn" data-action="off">${this._icon('power')}</button>
      </div>

      <div class="reverse-row">
        <button class="pill-btn" data-action="reverse">${this._icon('reverse')} Reverse</button>
      </div>

      <div class="section-label">Light — Color Temp</div>
      <div class="icon-row">
        <button class="icon-btn" data-action="temp-down">${this._icon('tempMinus')}</button>
        <button class="icon-btn" data-action="temp-preset">${this._icon('tempPreset')}</button>
        <button class="icon-btn" data-action="temp-up">${this._icon('tempPlus')}</button>
      </div>

      <div class="section-label">Light — Brightness</div>
      <div class="bar-row">
        <button data-action="bright-down">${this._icon('sunMinus')}</button>
        <button class="center" data-action="light-toggle">${this._icon('bulb')}</button>
        <button data-action="bright-up">${this._icon('sunPlus')}</button>
      </div>

      <div class="section-label">Timer</div>
      <div class="timer-row">
        <button class="timer-btn" data-timer="1h">1H</button>
        <button class="timer-btn" data-timer="4h">4H</button>
        <button class="timer-btn" data-timer="8h">8H</button>
      </div>
    `;

    wrap.querySelectorAll('[data-i]').forEach(btn => {
      btn.onclick = () => { this._roomIndex = parseInt(btn.dataset.i, 10); this._render(); };
    });

    wrap.querySelectorAll('.speed-btn').forEach(btn => {
      btn.onclick = () => this._press(r['speed' + btn.dataset.speed]);
    });

    wrap.querySelector('[data-action="off"]').onclick = () => this._press(r.fan_off);
    wrap.querySelector('[data-action="reverse"]').onclick = () => this._press(r.fan_reverse);
    wrap.querySelector('[data-action="temp-down"]').onclick = () => this._press(r.temp_down);
    wrap.querySelector('[data-action="temp-preset"]').onclick = () => this._press(r.temp_preset);
    wrap.querySelector('[data-action="temp-up"]').onclick = () => this._press(r.temp_up);
    wrap.querySelector('[data-action="bright-down"]').onclick = () => this._press(r.bright_down);
    wrap.querySelector('[data-action="bright-up"]').onclick = () => this._press(r.bright_up);
    wrap.querySelector('[data-action="light-toggle"]').onclick = () => this._press(r.light_toggle);
    wrap.querySelectorAll('[data-timer]').forEach(btn => {
      btn.onclick = () => this._press(r['timer_' + btn.dataset.timer]);
    });
  }
}

customElements.define('rf-remote-card', RfRemoteCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'rf-remote-card',
  name: 'RF Remote Card',
  description: 'Physical remote-style control for RF fans/lights'
});
