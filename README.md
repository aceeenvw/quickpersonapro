<div align="center">

# ⊹ Quick Persona Pro ⊹

### _Supercharged persona switcher for SillyTavern_

[![Version](https://img.shields.io/badge/version-1.0.0-b48cff?style=flat-square)](./manifest.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0-7ec4ff?style=flat-square)](./LICENSE)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.12%2B-ffd27e?style=flat-square)](https://github.com/SillyTavern/SillyTavern)
[![i18n](https://img.shields.io/badge/i18n-EN%20%2F%20RU-golden?style=flat-square)](./i18n.json)

**A modern fork of [Extension-QuickPersona](https://github.com/SillyTavern/Extension-QuickPersona) by Cohee1207**
_— rewritten, expanded, polished._

</div>

---

## ✨ What it does

Adds a small avatar button next to the chat input. Click it → grid of all your personas pops up → click to switch. Simple.

But Pro edition adds **search, keyboard navigation, lock indicators, a right-click context menu, a global hotkey, a slash command, a settings panel, and proper i18n** — all in ~700 lines of vanilla JS, no framework bloat.

---

## 🎯 Feature matrix

| | Original Quick Persona | **⊹ Quick Persona Pro ⊹** |
|---|:---:|:---:|
| Avatar-grid dropdown | ✅ | ✅ |
| Click to switch persona | ✅ | ✅ |
| Fuzzy search | ❌ | ✅ |
| Keyboard navigation (arrows / Enter / Esc / Home / End) | ❌ | ✅ |
| Right-click context menu (lock, default, manage) | ❌ | ✅ |
| Lock indicators (chat / character / default) | ❌ | ✅ |
| Shift+Click = lock to chat · Ctrl+Click = lock to character | ❌ | ✅ |
| Global hotkey (default `Ctrl/Cmd + P`) | ❌ | ✅ |
| Slash command `/qp [name] [lock=chat\|character\|default]` | ❌ | ✅ |
| Settings panel (grid columns, placement, toggles) | ❌ | ✅ |
| Description preview in tooltip | ❌ | ✅ |
| Quick "create new persona" button | ❌ | ✅ |
| i18n support (English + Russian included) | ❌ | ✅ |
| Theme-aware glass-morphism UI | partial | ✅ |
| Fixed `popper.destroy()` crash on rapid toggle | ❌ | ✅ |
| Uses `PERSONA_CHANGED` event (not `setTimeout` hack) | ❌ | ✅ |
| Scoped event listeners (no leaks) | ❌ | ✅ |
| Accessibility (ARIA roles, focus-visible, tabindex) | partial | ✅ |

---

## ⌨️ Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl/Cmd + P` | Toggle persona picker (configurable) |
| `Enter` / `Space` on button | Open menu |
| `Arrow keys` inside menu | Navigate avatars |
| `Home` / `End` | Jump to first / last persona |
| `Enter` / `Space` on avatar | Select persona |
| `Escape` | Close menu |
| `Shift + Click` avatar | Select **and** lock to current chat |
| `Ctrl/Cmd + Click` avatar | Select **and** lock to current character |
| `Right-click` avatar or button | Full context menu |
| `Shift + Click` main button | Jump straight into full Persona Management |

---

## 🪄 Slash command

```stscript
/qp                       ← toggles the picker
/qp Alice                 ← switch to persona named "Alice"
/qp Alice lock=chat       ← switch and lock to this chat
/qp Bob   lock=character  ← switch and lock to this character
/qp Bob   lock=default    ← switch and make default
```

---

## 📦 Installation

### Via SillyTavern's built-in installer (recommended)

1. Open SillyTavern → **Extensions** → **Install extension**
2. Paste:
   ```
   https://github.com/aceeenvw/quickpersonapro
   ```
3. Click **Install** → done.

### Manual

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/aceeenvw/quickpersonapro.git
```

Then reload SillyTavern. The extension will appear under **Extensions** and a settings panel will be added under **Extensions → ⊹ Quick Persona Pro ⊹**.

---

## ⚙️ Settings

All configurable under **Extensions → ⊹ Quick Persona Pro ⊹**:

- **Enable search bar** — fuzzy search over persona names, titles, descriptions
- **Enable keyboard navigation** — arrow keys, Enter/Esc
- **Enable context menu** — right-click for rich actions
- **Show lock indicators** — tiny badges on locked personas
- **Show persona name under avatar** — label each persona in the grid
- **Show description tooltip** — hover preview of persona description
- **Decorative glyphs ⊹** — turn the aesthetic on/off
- **Global hotkey** — default `Ctrl/Cmd + P`, pick any single letter
- **Grid columns** — 3 to 12
- **Menu placement** — `top-start`, `top`, `bottom-end`, etc.

Settings are stored under `extension_settings.quickPersonaPro` and sync across devices just like any other SillyTavern setting.

---

## 🌍 Localization

- **English** — primary / source strings
- **Russian** (`ru-ru`) — bundled translation

The extension auto-loads its `i18n.json` on startup and registers Russian strings via SillyTavern's `addLocaleData` API. Set your SillyTavern language to Russian to see it.

Want to contribute another language? Just add a key to [`i18n.json`](./i18n.json) and open a PR.

---

## 🐛 Bug fixes vs. the original

- **Popper null-crash** on rapid open/close — fixed with try/guard
- **100ms `setTimeout` hack** for button refresh — replaced with the dedicated `event_types.PERSONA_CHANGED` event
- **Document-level click handler leak** (bound on every load, never cleaned up) — now scoped to the open session only
- **`big-avatars` height mismatch** — cleaned up grid cell sizing
- **No `aria-expanded` / `role` attributes** — added full ARIA support
- **`CHAT_CHANGED` + `SETTINGS_UPDATED` over-firing** — events split; `CHAT_CHANGED` only updates lock indicators, `PERSONA_CHANGED` handles avatar refresh

---

## 🧩 Technical notes

- Pure vanilla JS + jQuery (ST already ships it) — **no new dependencies**
- Uses SillyTavern's bundled `Popper.js` (positioning) and `Fuse.js` (search) from `/lib.js`
- All imports go through ST's official module paths — no duplicated code
- Live module binding of `user_avatar` — no stale reads after switching
- Settings panel embedded in `index.js` — no separate HTML file to fetch / miss

---

## 📜 License & credits

This project is a fork of **[Extension-QuickPersona](https://github.com/SillyTavern/Extension-QuickPersona)** by **Cohee1207** (the original SillyTavern team), licensed under **AGPL-3.0**. All original copyright is preserved in [LICENSE](./LICENSE).

Fork & upgrade work: **aceenvw** (2025).

> _If you liked the original, please star the upstream. If you like this fork, star this repo too._

---

## 🙏 Acknowledgements

- **Cohee1207** — original Quick Persona extension, the entire SillyTavern project
- **SillyTavern contributors** — events, persona API, i18n, Popper/Fuse bundling
- **aceenvw** — fork maintenance, Pro upgrades

---

<div align="center">

**⊹ Quick Persona Pro ⊹**

_Made with ❤ for roleplay power-users._

</div>
