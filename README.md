<div align="center">

# ⊹ QUICK PERSONA PRO ⊹

### _Supercharged persona switcher for SillyTavern_

[![Version](https://img.shields.io/badge/version-1.0.2-b48cff?style=flat-square)](./manifest.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0-7ec4ff?style=flat-square)](./LICENSE)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.12%2B-ffd27e?style=flat-square)](https://github.com/SillyTavern/SillyTavern)
[![i18n](https://img.shields.io/badge/i18n-EN%20%2F%20RU-golden?style=flat-square)](./i18n.json)
[![Mobile](https://img.shields.io/badge/mobile-optimized-4ade80?style=flat-square)](#-mobile-support)

**A modern fork of [Extension-QuickPersona](https://github.com/SillyTavern/Extension-QuickPersona) by Cohee1207**
_— rewritten, expanded, polished._

</div>

---

## ✨ What it does

Adds a small avatar button next to the chat input. Click it → grid of all your personas pops up → click to switch. Simple.

But **⊹ QUICK PERSONA PRO ⊹** adds **search, keyboard navigation, lock indicators, a right-click context menu, a global hotkey, a slash command, a full settings panel, full mobile/touch support, and proper i18n** — all in vanilla JS, no framework bloat.

---

## 🎯 Feature matrix

| | Original Quick Persona | **⊹ QUICK PERSONA PRO ⊹** |
|---|:---:|:---:|
| Avatar-grid dropdown | ✅ | ✅ |
| Click to switch persona | ✅ | ✅ |
| Fuzzy search | ❌ | ✅ |
| Keyboard navigation (arrows / Enter / Esc / Home / End) | ❌ | ✅ |
| Right-click context menu (lock, default, manage) | ❌ | ✅ |
| **Mobile / touch support** (long-press + quick-action toolbar) | ❌ | ✅ |
| Lock indicators (chat / character / default) | ❌ | ✅ |
| Shift+Click = lock to chat · Ctrl+Click = lock to character | ❌ | ✅ |
| Global hotkey `Ctrl/Cmd + Shift + P` (configurable modifiers) | ❌ | ✅ |
| Slash command `/qpp [name] [lock=…]` | ❌ | ✅ |
| Settings panel (grid columns, placement, toggles, hotkey builder) | ❌ | ✅ |
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
| `Ctrl/Cmd + Shift + P` | Toggle persona picker _(default — modifiers + key configurable)_ |
| `Enter` / `Space` on button | Open menu |
| `Arrow keys` inside menu | Navigate avatars |
| `Home` / `End` | Jump to first / last persona |
| `Enter` / `Space` on avatar | Select persona |
| `Escape` | Close menu |
| `Shift + Click` avatar | Select **and** lock to current chat |
| `Ctrl/Cmd + Click` avatar | Select **and** lock to current character |
| `Right-click` avatar or button | Full context menu |
| `Shift + Click` main button | Jump straight into full Persona Management |

> **Why `Ctrl/Cmd + Shift + P` and not `Ctrl/Cmd + P`?**
> `Ctrl/Cmd + P` is hard-reserved by most browsers for **Print**, which
> they catch before any web page can intercept. The default was chosen to
> avoid that conflict. You can change modifiers and key in the settings panel.

---

## 📱 Mobile support

**⊹ QUICK PERSONA PRO ⊹** is fully touch-optimized:

- **Long-press** any persona (or the main button) = equivalent of right-click → full context menu
- **Quick-action toolbar** — on touch devices a visible row appears at the top of the menu with **Chat / Character / Default** lock toggles for the currently-active persona. This is the mobile equivalent of Shift+Click / Ctrl+Click.
- **Bigger tap targets** — cells grow to 56×56, icon buttons to 36×36, context menu items to 44px tall (Apple/Google HIG recommended minimum)
- **Search field uses 16px font** on mobile — prevents iOS Safari from auto-zooming when focused
- **Auto-shrinking grid** — columns automatically reduce on narrow phones so the menu fits on-screen
- **Explicit close button** (✕) in menu header — added automatically on touch devices
- **`svh` viewport units** — menu respects dynamic browser chrome (iOS toolbars)
- **Soft keyboard doesn't hijack focus** — search auto-focus skipped on touch so it only opens when the user deliberately taps it

Works on: iOS Safari, Android Chrome, iPad, tablet browsers. No changes needed — the extension auto-detects `pointer: coarse`.

---

## 🪄 Slash command

```stscript
/qpp                       ← toggles the picker
/qpp Alice                 ← switch to persona named "Alice"
/qpp Alice lock=chat       ← switch and lock to this chat
/qpp Bob   lock=character  ← switch and lock to this character
/qpp Bob   lock=default    ← switch and make default
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

Then reload SillyTavern. The extension will appear under **Extensions** and a settings panel will be added under **Extensions → ⊹ QUICK PERSONA PRO ⊹**.

---

## ⚙️ Settings

All configurable under **Extensions → ⊹ QUICK PERSONA PRO ⊹**:

- **Enable search bar** — fuzzy search over persona names, titles, descriptions
- **Enable keyboard navigation** — arrow keys, Enter/Esc
- **Enable context menu** — right-click (desktop) / long-press (mobile) for rich actions
- **Show lock indicators** — tiny badges on locked personas
- **Show persona name under avatar** — label each persona in the grid
- **Show description tooltip** — hover preview of persona description
- **Decorative glyphs ⊹** — turn the aesthetic on/off
- **Mobile quick-action toolbar** — visible chat/character/default lock toggles on touch devices
- **Global hotkey** — pick any modifier combination (Ctrl/Cmd, Shift, Alt/Option) + single letter
- **Grid columns** — **`Auto`** (adaptive, recommended) or a fixed number 3–12.
  Auto picks a sensible column count for the current viewport:
  _phone → 3, narrow → 4, tablet → 5, desktop → 6, ultrawide → 7._
  Unchecking "Auto" reveals a number field for an explicit override that
  persists across refreshes.
- **Menu placement** — `top-start`, `top`, `bottom-end`, etc.

Settings are stored under `extension_settings.quickPersonaPro` and sync across devices just like any other SillyTavern setting.

---

## 🌍 Localization

- **English** — primary / source strings
- **Russian** (`ru-ru`) — bundled translation

The extension auto-loads its `i18n.json` on startup and registers Russian strings via SillyTavern's `addLocaleData` API. Set your SillyTavern language to Russian to see it.

Want to contribute another language? Just add a key to [`i18n.json`](./i18n.json) and open a PR.

---

## 🛡️ Resilience

- **Broken-image fallback** — if a persona's thumbnail fails to load (deleted
  file, orphan persona entry, server hiccup), the extension silently falls
  back to SillyTavern's default user avatar (`/img/ai4.png`) instead of
  showing the browser's broken-image icon.
- **Pre-init safety** — the main button shows the default avatar during the
  brief window between extension load and SillyTavern's persona state
  initialization.

---

## 🐛 Bug fixes & improvements vs. the original

- **Popper null-crash** on rapid open/close — fixed with try/guard
- **100ms `setTimeout` hack** for button refresh — replaced with the dedicated `event_types.PERSONA_CHANGED` event
- **Document-level click handler leak** (bound on every load, never cleaned up) — now scoped to the open session only
- **`big-avatars` height mismatch** — cleaned up grid cell sizing
- **No `aria-expanded` / `role` attributes** — added full ARIA support
- **`CHAT_CHANGED` + `SETTINGS_UPDATED` over-firing** — events split; `CHAT_CHANGED` only updates lock indicators, `PERSONA_CHANGED` handles avatar refresh
- **Hotkey reliability** — capture-phase `window` listener, uses `ev.code` fallback for non-Latin keyboard layouts (e.g., Cyrillic)
- **Mobile tap race** — outside-click handler armed with an 80ms delay after open to prevent iOS Safari from instant-closing on the tap that opened it

---

## 🧩 Technical notes

- Pure vanilla JS + jQuery (ST already ships it) — **no new dependencies**
- Uses SillyTavern's bundled `Popper.js` (positioning) and `Fuse.js` (search) from `/lib.js`
- Uses `addLongPressEvent` from ST's `utils.js` for proper touch lifecycle
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
- **SillyTavern contributors** — events, persona API, i18n, Popper/Fuse bundling, `addLongPressEvent`
- **aceenvw** — fork maintenance, Pro upgrades

---

<div align="center">

**⊹ QUICK PERSONA PRO ⊹**

_Made with ❤ for roleplay power-users._

</div>
