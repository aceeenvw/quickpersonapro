/*
 * ⊹ QUICK PERSONA PRO ⊹
 * Supercharged persona switcher for SillyTavern.
 * Fork of Extension-QuickPersona by Cohee1207 (AGPL-3.0).
 * Author: aceenvw — https://github.com/aceeenvw/quickpersonapro
 */

import {
    animation_duration,
    eventSource,
    event_types,
    getThumbnailUrl,
    saveSettingsDebounced,
} from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import {
    getUserAvatar,
    getUserAvatars,
    setUserAvatar,
    user_avatar,
    isPersonaLocked,
    togglePersonaLock,
} from '../../../personas.js';
import { extension_settings } from '../../../extensions.js';
import { Popper, Fuse } from '../../../../lib.js';
import { t, addLocaleData, getCurrentLocale } from '../../../i18n.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } from '../../../slash-commands/SlashCommandArgument.js';

// ─── constants ──────────────────────────────────────────────────────────────
const MODULE = 'quickPersonaPro';
const GLYPH = '⊹';
const BRAND = `${GLYPH} QUICK PERSONA PRO ${GLYPH}`;
const FALLBACK_AVATAR_URL = '/img/ai4.png';
const THUMB_W = 96, THUMB_H = 144;

// ─── platform detection ─────────────────────────────────────────────────────
const IS_TOUCH = (() => {
    try {
        return window.matchMedia?.('(pointer: coarse)').matches
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    } catch { return false; }
})();
const IS_FIREFOX = /firefox/i.test(navigator.userAgent || '');
const isMac = () => /mac|iphone|ipad|ipod/i.test(navigator.userAgent || navigator.platform || '');

// ─── provenance marker ──────────────────────────────────────────────────────
// Verify in devtools: window.__qpp_provenance() → { a, v, h }
const __QPP_PROV__ = (() => {
    const seed = [0x61, 0x63, 0x65, 0x65, 0x6e, 0x76, 0x77];
    const a = String.fromCharCode.apply(null, seed);
    const v = '1.0.6';
    let h = 0x811c9dc5;
    for (const c of (a + '@' + v)) { h ^= c.charCodeAt(0); h = (h * 0x01000193) >>> 0; }
    const sig = { a, v, h: h.toString(16).padStart(8, '0') };
    try {
        Object.defineProperty(globalThis, '__qpp_provenance', {
            value: () => ({ ...sig }), enumerable: false,
        });
    } catch { /* noop */ }
    return sig;
})();

// ─── settings ───────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = Object.freeze({
    enableSearch: true,
    enableKeyboardNav: true,
    enableContextMenu: true,
    enableLockIndicators: true,
    enableHotkey: true,
    hotkey: 'p',
    hotkeyCtrl: true,
    hotkeyShift: true,
    hotkeyAlt: false,
    gridColumns: 'auto',
    showPersonaName: true,
    showDescriptionTooltip: true,
    glyphInHeader: true,
    menuPlacement: 'top-start',
    touchActionRow: true,
});

/** Ensure settings object exists and back-fills any missing keys from schema. */
function settings() {
    if (!extension_settings[MODULE] || typeof extension_settings[MODULE] !== 'object') {
        extension_settings[MODULE] = structuredClone(DEFAULT_SETTINGS);
    } else {
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            if (!(k in extension_settings[MODULE])) extension_settings[MODULE][k] = v;
        }
    }
    return extension_settings[MODULE];
}

// ─── html helpers ───────────────────────────────────────────────────────────
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => HTML_ESC[c]);
const escapeAttr = (s) => escapeHtml(s).replace(/\n/g, '&#10;');

// ─── long-press ─────────────────────────────────────────────────────────────
/**
 * Pointer-event based long-press with movement tolerance, visual feedback,
 * haptic buzz, and native-gesture suppression. Falls back to Touch Events on
 * browsers without PointerEvent.
 *
 * @param {string} selector CSS selector for target elements (event delegation).
 * @param {(this: Element, ev: PointerEvent|TouchEvent) => void} callback
 * @param {{delay?: number, tolerance?: number}} [opts]
 */
function qppLongPress(selector, callback, { delay = 400, tolerance = 10 } = {}) {
    const supportsPointer = 'PointerEvent' in window;
    let timer = null, target = null, startX = 0, startY = 0, suppressClickUntil = 0;

    const reset = () => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (target) target.classList.remove('qpp-pressing');
        target = null;
    };

    const onStart = (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        if (ev.isPrimary === false) return;
        const el = ev.target?.closest?.(selector);
        if (!el) return;

        reset();
        target = el;
        const pt = pointXY(ev);
        startX = pt.x; startY = pt.y;
        target.classList.add('qpp-pressing');

        timer = setTimeout(() => {
            if (!target) return;
            try { navigator.vibrate?.(15); } catch { /* noop */ }
            try { callback.call(target, ev); } catch (e) { console.error('[QPP] long-press', e); }
            suppressClickUntil = Date.now() + 600;
            reset();
        }, delay);
    };

    const onMove = (ev) => {
        if (!target || timer === null) return;
        const pt = pointXY(ev);
        if (Math.hypot(pt.x - startX, pt.y - startY) > tolerance) reset();
    };

    const onEnd = () => reset();

    const onClickEater = (ev) => {
        if (Date.now() < suppressClickUntil) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
        }
    };

    if (supportsPointer) {
        document.addEventListener('pointerdown', onStart, { passive: true });
        document.addEventListener('pointermove', onMove, { passive: true });
        document.addEventListener('pointerup', onEnd, { passive: true });
        document.addEventListener('pointercancel', onEnd, { passive: true });
    } else {
        document.addEventListener('touchstart', onStart, { passive: true });
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd, { passive: true });
        document.addEventListener('touchcancel', onEnd, { passive: true });
    }
    window.addEventListener('blur', onEnd);
    document.addEventListener('scroll', onEnd, { capture: true, passive: true });
    document.addEventListener('click', onClickEater, { capture: true });

    // Block the native image-save / text-select popup on touch within our selector —
    // they fire before the 500ms OS-level timer and compete with our gesture.
    if (IS_TOUCH) {
        document.addEventListener('contextmenu', (ev) => {
            if (ev.target?.closest?.(selector)) ev.preventDefault();
        }, { capture: true });
    }

    function pointXY(ev) {
        if ('clientX' in ev) return { x: ev.clientX, y: ev.clientY };
        const t = ev.touches?.[0] || ev.changedTouches?.[0];
        return t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 };
    }
}

/** Extract page-based (x,y) from a PointerEvent or TouchEvent. */
function pointerPageXY(ev) {
    if (ev && typeof ev.pageX === 'number') return { x: ev.pageX, y: ev.pageY };
    const t = ev?.touches?.[0] || ev?.changedTouches?.[0];
    if (t) return { x: t.pageX, y: t.pageY };
    return { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
}

// ─── i18n ───────────────────────────────────────────────────────────────────
async function loadLocale() {
    const locale = getCurrentLocale();
    if (!locale || locale === 'en' || locale.startsWith('en-')) return;
    try {
        const url = new URL('./i18n.json', import.meta.url);
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data[locale] && typeof data[locale] === 'object') {
            addLocaleData(locale, data[locale]);
        }
    } catch (err) {
        console.debug('[QPP] locale load skipped:', err?.message);
    }
}

// ─── module state ───────────────────────────────────────────────────────────
/** @type {ReturnType<typeof Popper.createPopper>|null} */
let popper = null;
let isOpen = false;
let cachedAvatars = null;
let focusedIndex = -1;
let outsideClickHandler = null;
let keyHandler = null;

// Probe: does ST's getThumbnailUrl honor the `t` cache-bust param? (sanity check
// against very old ST versions that served raw /User Avatars/ directly.)
const supportsPersonaThumbnails = getThumbnailUrl('persona', 'test.png', true).includes('&t=');

// ─── pure helpers ───────────────────────────────────────────────────────────
/**
 * Adaptive grid columns. Explicit numeric values win; 'auto' derives from
 * viewport + pointer type.
 *   phone (touch + <420px) → 3 · narrow (<600px) → 4 · tablet (<900px) → 5
 *   desktop (<1400px) → 6 · ultrawide (≥1400px) → 7
 * Clamped to what fits 60px cells in the minor axis.
 */
function resolveGridColumns(raw) {
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 3 && num <= 12) return Math.floor(num);

    const w = window.innerWidth || 1024;
    let cols;
    if (IS_TOUCH && w < 420)  cols = 3;
    else if (w < 600)         cols = 4;
    else if (w < 900)         cols = 5;
    else if (w < 1400)        cols = 6;
    else                      cols = 7;

    return Math.min(cols, Math.max(3, Math.floor((w - 40) / 60)));
}

/**
 * Cacheable thumbnail URL on Chromium / WebKit, cache-busted on Firefox (which
 * has a known caching bug with query-string thumbnail URLs — see ST's
 * personas.js:204 using isFirefox()). ST invalidates the cache itself when
 * personas are replaced/renamed, so we don't need to force-bust.
 */
function getImageUrl(userAvatar) {
    if (supportsPersonaThumbnails) return getThumbnailUrl('persona', userAvatar, IS_FIREFOX);
    return `${getUserAvatar(userAvatar)}?t=${Date.now()}`;
}

function personaMeta(avatarId) {
    const name = power_user.personas?.[avatarId] || avatarId;
    const title = power_user.persona_descriptions?.[avatarId]?.title || '';
    const description = power_user.persona_descriptions?.[avatarId]?.description || '';
    return { name, title, description };
}

function formatTooltip(avatarId) {
    const { name, title, description } = personaMeta(avatarId);
    const cfg = settings();
    let tip = title ? `${name} — ${title}` : name;
    if (cfg.showDescriptionTooltip && description) {
        const snippet = description.length > 180 ? description.slice(0, 180) + '…' : description;
        tip += `\n\n${snippet}`;
    }
    const locks = [];
    if (isPersonaLocked('chat'))                     locks.push(t`chat`);
    if (isPersonaLocked('character'))                locks.push(t`character`);
    if (avatarId === power_user.default_persona)     locks.push(t`default`);
    if (avatarId === user_avatar && locks.length) {
        tip += `\n\n${t`Locked to`}: ${locks.join(', ')}`;
    }
    return tip;
}

// ─── main button ────────────────────────────────────────────────────────────
function addQuickPersonaButton() {
    if ($('#quickPersona').length) return;
    $('#leftSendForm').append(`
        <div id="quickPersona" class="interactable" tabindex="0"
             role="button" aria-haspopup="menu" aria-expanded="false"
             title="${BRAND}" data-qpp-sig="${__QPP_PROV__.h}">
            <img id="quickPersonaImg" alt=""
                 src="${FALLBACK_AVATAR_URL}"
                 decoding="async" fetchpriority="high"
                 width="${THUMB_W}" height="${THUMB_H}" />
            <div id="quickPersonaCaret" class="fa-fw fa-solid fa-caret-up"></div>
            <div id="quickPersonaLockBadge" class="qpp-lock-badge" aria-hidden="true"></div>
        </div>`);
    $('#quickPersonaImg').on('error', onAvatarImgError);
    $('#quickPersona')
        .on('click', onButtonClick)
        .on('keydown', onButtonKeydown)
        .on('contextmenu', onButtonContextMenu);
}

/** @this {HTMLImageElement} Fall back to ST's default avatar on load failure. */
function onAvatarImgError() {
    if (this.dataset.qppFellBack === '1') return;
    this.dataset.qppFellBack = '1';
    this.src = FALLBACK_AVATAR_URL;
}

function onButtonClick(e) {
    if (e.shiftKey) { openPersonaManagementPanel(); return; }
    toggleQuickPersonaSelector();
}

function onButtonKeydown(e) {
    if (!settings().enableKeyboardNav) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleQuickPersonaSelector();
    }
}

function onButtonContextMenu(e) {
    if (!settings().enableContextMenu) return;
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY, user_avatar);
}

function openPersonaManagementPanel() {
    const btn = document.querySelector('#persona-management-button .drawer-toggle');
    if (btn instanceof HTMLElement) btn.click();
}

function refreshButton() {
    const hasAvatar = typeof user_avatar === 'string' && user_avatar.length > 0;
    const imgUrl = hasAvatar ? getImageUrl(user_avatar) : FALLBACK_AVATAR_URL;
    const tooltip = hasAvatar ? formatTooltip(user_avatar) : BRAND;

    const imgEl = document.getElementById('quickPersonaImg');
    if (imgEl) {
        // Skip src reassignment if unchanged — avoids redundant decode on frequent events.
        if (imgEl.dataset.qppSrc !== imgUrl) {
            imgEl.dataset.qppSrc = imgUrl;
            delete imgEl.dataset.qppFellBack;
            imgEl.src = imgUrl;
        }
        imgEl.title = tooltip;
    }
    $('#quickPersona').attr('title', tooltip);

    const $badge = $('#quickPersonaLockBadge');
    $badge.removeClass('qpp-has-lock qpp-lock-chat qpp-lock-char qpp-lock-default').empty();
    if (!settings().enableLockIndicators) return;

    if (isPersonaLocked('chat')) {
        $badge.addClass('qpp-has-lock qpp-lock-chat').html('<i class="fa-solid fa-comment"></i>');
    } else if (isPersonaLocked('character')) {
        $badge.addClass('qpp-has-lock qpp-lock-char').html('<i class="fa-solid fa-user-lock"></i>');
    } else if (user_avatar === power_user.default_persona) {
        $badge.addClass('qpp-has-lock qpp-lock-default').html('<i class="fa-solid fa-star"></i>');
    }
}

// ─── menu ───────────────────────────────────────────────────────────────────
async function toggleQuickPersonaSelector() {
    if (isOpen) return closeQuickPersonaSelector();
    await openQuickPersonaSelector();
}

async function openQuickPersonaSelector() {
    if (isOpen) return;
    isOpen = true;

    const cfg = settings();
    const userAvatars = cachedAvatars ?? (cachedAvatars = await getUserAvatars(false));
    // Recomputed on each open so orientation / window-resize naturally takes effect.
    const effCols = resolveGridColumns(cfg.gridColumns);
    const showMobileToolbar = IS_TOUCH && cfg.touchActionRow;

    const $menu = $(`
        <div id="quickPersonaMenu" role="menu" aria-label="${BRAND}"
             class="${IS_TOUCH ? 'qpp-touch' : 'qpp-mouse'}">
            <div class="qpp-menu-header">
                <div class="qpp-menu-title">${cfg.glyphInHeader ? `${GLYPH} ` : ''}${t`QUICK PERSONA PRO`}${cfg.glyphInHeader ? ` ${GLYPH}` : ''}</div>
                <div class="qpp-menu-actions">
                    <div class="qpp-icon-btn fa-solid fa-plus" data-action="new"
                         title="${t`Create new persona`}" tabindex="0" role="button"></div>
                    <div class="qpp-icon-btn fa-solid fa-gear" data-action="manage"
                         title="${t`Open Persona Management`}" tabindex="0" role="button"></div>
                    <div class="qpp-icon-btn fa-solid fa-xmark qpp-close-mobile" data-action="close"
                         title="${t`Close`}" tabindex="0" role="button"></div>
                </div>
            </div>
            ${showMobileToolbar ? `
                <div class="qpp-touch-toolbar" role="toolbar" aria-label="${t`Quick lock actions for current persona`}">
                    <button class="qpp-tb-btn" data-touch-action="lock-chat" type="button"
                            title="${t`Lock to chat`}">
                        <i class="fa-solid fa-comment"></i>
                        <span>${t`Chat`}</span>
                    </button>
                    <button class="qpp-tb-btn" data-touch-action="lock-char" type="button"
                            title="${t`Lock to character`}">
                        <i class="fa-solid fa-user-lock"></i>
                        <span>${t`Character`}</span>
                    </button>
                    <button class="qpp-tb-btn" data-touch-action="default" type="button"
                            title="${t`Set as default`}">
                        <i class="fa-solid fa-star"></i>
                        <span>${t`Default`}</span>
                    </button>
                </div>` : ''}
            ${cfg.enableSearch ? `
                <div class="qpp-search-wrap">
                    <i class="fa-solid fa-magnifying-glass qpp-search-icon"></i>
                    <input type="text" class="qpp-search text_pole"
                           placeholder="${t`Search personas…`}"
                           aria-label="${t`Search personas`}"
                           autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
                </div>` : ''}
            <ul class="list-group qpp-grid" style="--qpp-cols:${effCols};"></ul>
            ${cfg.showPersonaName ? `<div class="qpp-menu-footer"><span class="qpp-current-name"></span></div>` : ''}
            ${IS_TOUCH ? `<div class="qpp-hint">${t`Tip: long-press any persona for more actions.`}</div>` : ''}
        </div>`);

    buildMenuItems($menu.find('.qpp-grid'), userAvatars, '');
    updateFooter($menu);
    if (showMobileToolbar) syncTouchToolbarState($menu);

    $menu.hide().appendTo(document.body);
    $('#quickPersonaCaret').removeClass('fa-caret-up').addClass('fa-caret-down');
    $('#quickPersona').attr('aria-expanded', 'true');
    $menu.fadeIn(animation_duration);

    popper = Popper.createPopper(
        document.getElementById('quickPersona'),
        document.getElementById('quickPersonaMenu'),
        {
            placement: cfg.menuPlacement,
            modifiers: [
                { name: 'offset', options: { offset: [0, 8] } },
                { name: 'preventOverflow', options: { padding: 8 } },
            ],
        },
    );

    $menu.on('click', '.qpp-grid li', onPersonaItemClick);
    $menu.on('contextmenu', '.qpp-grid li', onPersonaItemContextMenu);
    $menu.on('click', '[data-action]', onMenuAction);
    $menu.on('click', '[data-touch-action]', onTouchToolbarAction);

    if (cfg.enableSearch) {
        $menu.find('.qpp-search').on('input', (e) => {
            buildMenuItems($menu.find('.qpp-grid'), userAvatars, String(e.target.value || '').trim());
            focusedIndex = -1;
        });
        // Skip autofocus on touch: pops soft keyboard and covers the menu.
        if (!IS_TOUCH && document.activeElement === document.getElementById('quickPersona')) {
            setTimeout(() => $menu.find('.qpp-search').trigger('focus'), 50);
        }
    }

    // 80ms arm delay so the tap that opened us doesn't immediately close us
    // via the capture-phase outside-click handler (observed on iOS Safari).
    let armed = false;
    setTimeout(() => { armed = true; }, 80);
    outsideClickHandler = (ev) => {
        if (!isOpen || !armed) return;
        if (ev.target.closest('#quickPersonaMenu, #quickPersona, .qpp-context-menu')) return;
        closeQuickPersonaSelector();
    };
    document.addEventListener('click', outsideClickHandler, true);

    if (cfg.enableKeyboardNav) {
        keyHandler = (ev) => onMenuKeydown(ev, $menu);
        document.addEventListener('keydown', keyHandler, true);
    }

    popper.update();
}

function closeQuickPersonaSelector() {
    if (!isOpen) return;
    isOpen = false;
    focusedIndex = -1;

    $('#quickPersonaCaret').removeClass('fa-caret-down').addClass('fa-caret-up');
    $('#quickPersona').attr('aria-expanded', 'false');

    const $menu = $('#quickPersonaMenu');
    $menu.fadeOut(animation_duration, () => $menu.remove());

    if (outsideClickHandler) { document.removeEventListener('click', outsideClickHandler, true); outsideClickHandler = null; }
    if (keyHandler)          { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
    if (popper)              { try { popper.destroy(); } catch { /* noop */ } popper = null; }

    closeContextMenu();
}

/**
 * Build the persona grid into `$list` via a single DocumentFragment.
 * Uses lazy/async image loading, intrinsic sizing, and fetchpriority on the
 * active persona for fast cold loads and zero reflow.
 */
function buildMenuItems($list, avatars, search) {
    const listEl = $list[0];
    listEl.textContent = '';

    let filtered = avatars;
    if (search) {
        const index = avatars.map(a => ({ id: a, ...personaMeta(a) }));
        const fuse = new Fuse(index, {
            keys: ['name', 'title', 'description', 'id'],
            threshold: 0.4,
            ignoreLocation: true,
        });
        filtered = fuse.search(search).map(r => r.item.id);
    }

    if (!filtered.length) {
        const empty = document.createElement('li');
        empty.className = 'qpp-empty';
        empty.setAttribute('aria-disabled', 'true');
        empty.textContent = t`No personas match.`;
        listEl.appendChild(empty);
        return;
    }

    const cfg = settings();
    const showName = !!cfg.showPersonaName;
    const showLocks = !!cfg.enableLockIndicators;
    const frag = document.createDocumentFragment();

    for (const avatarId of filtered) {
        const { name } = personaMeta(avatarId);
        const isSelected = avatarId === user_avatar;
        const isDefault = avatarId === power_user.default_persona;
        const chatLocked = showLocks && isSelected && isPersonaLocked('chat');
        const charLocked = showLocks && isSelected && isPersonaLocked('character');

        const li = document.createElement('li');
        li.className = 'list-group-item interactable qpp-item';
        li.tabIndex = 0;
        li.setAttribute('role', 'menuitem');
        li.title = formatTooltip(avatarId);
        // jQuery .data() keeps the raw id out of HTML attributes — filenames
        // with dots (i.e. all of them) would get mangled by CSS.escape.
        $(li).data('avatarId', avatarId);

        const img = document.createElement('img');
        img.className = 'quickPersonaMenuImg';
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width = THUMB_W;
        img.height = THUMB_H;
        if (isSelected) {
            img.setAttribute('fetchpriority', 'high');
            img.classList.add('selected');
        }
        if (isDefault) img.classList.add('default');
        img.addEventListener('error', onAvatarImgError);
        img.src = getImageUrl(avatarId);
        li.appendChild(img);

        if (isDefault || chatLocked || charLocked) {
            const stack = document.createElement('div');
            stack.className = 'qpp-lock-stack';
            stack.setAttribute('aria-hidden', 'true');
            if (isDefault)  stack.insertAdjacentHTML('beforeend', '<i class="qpp-lk qpp-lk-default fa-solid fa-star"></i>');
            if (chatLocked) stack.insertAdjacentHTML('beforeend', '<i class="qpp-lk qpp-lk-chat fa-solid fa-comment"></i>');
            if (charLocked) stack.insertAdjacentHTML('beforeend', '<i class="qpp-lk qpp-lk-char fa-solid fa-user-lock"></i>');
            li.appendChild(stack);
        }

        if (showName) {
            const label = document.createElement('div');
            label.className = 'qpp-item-name';
            label.textContent = name;
            li.appendChild(label);
        }

        frag.appendChild(li);
    }

    listEl.appendChild(frag);
}

/** Raw avatar id stashed via jQuery .data() (not HTML attribute). */
function getItemAvatarId(el) {
    if (!el) return undefined;
    const v = $(el).data('avatarId');
    return typeof v === 'string' ? v : undefined;
}

async function onPersonaItemClick(e) {
    const avatarId = getItemAvatarId(e.currentTarget);
    if (!avatarId) return;
    closeQuickPersonaSelector();
    if (e.shiftKey) {
        await setUserAvatar(avatarId);
        await togglePersonaLock('chat');
        return;
    }
    if (e.ctrlKey || e.metaKey) {
        await setUserAvatar(avatarId);
        await togglePersonaLock('character');
        return;
    }
    await setUserAvatar(avatarId);
}

function onPersonaItemContextMenu(e) {
    if (!settings().enableContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    const avatarId = getItemAvatarId(e.currentTarget);
    if (avatarId) showContextMenu(e.pageX, e.pageY, avatarId);
}

function onMenuAction(e) {
    const action = $(e.currentTarget).attr('data-action');
    if (action === 'close') { closeQuickPersonaSelector(); return; }
    closeQuickPersonaSelector();
    if (action === 'new') {
        const addBtn = document.getElementById('create_dummy_persona');
        openPersonaManagementPanel();
        if (addBtn instanceof HTMLElement) setTimeout(() => addBtn.click(), 300);
    }
    if (action === 'manage') openPersonaManagementPanel();
}

/** Mobile toolbar: applies a lock action to the currently-active persona. */
async function onTouchToolbarAction(e) {
    e.preventDefault();
    e.stopPropagation();
    const action = $(e.currentTarget).attr('data-touch-action');
    if      (action === 'lock-chat') await togglePersonaLock('chat');
    else if (action === 'lock-char') await togglePersonaLock('character');
    else if (action === 'default')   await togglePersonaLock('default');

    const $menu = $('#quickPersonaMenu');
    updateFooter($menu);
    syncTouchToolbarState($menu);
    const userAvatars = cachedAvatars ?? (cachedAvatars = await getUserAvatars(false));
    const search = String($menu.find('.qpp-search').val() || '').trim();
    buildMenuItems($menu.find('.qpp-grid'), userAvatars, search);
    refreshButton();
}

function syncTouchToolbarState($menu) {
    $menu.find('[data-touch-action="lock-chat"]').toggleClass('qpp-active', isPersonaLocked('chat'));
    $menu.find('[data-touch-action="lock-char"]').toggleClass('qpp-active', isPersonaLocked('character'));
    $menu.find('[data-touch-action="default"]').toggleClass('qpp-active', user_avatar === power_user.default_persona);
}

function onMenuKeydown(ev, $menu) {
    if (!isOpen) return;
    const items = $menu.find('.qpp-grid li.qpp-item').get();
    if (ev.key === 'Escape') {
        ev.preventDefault();
        closeQuickPersonaSelector();
        document.getElementById('quickPersona')?.focus();
        return;
    }
    if (!items.length) return;

    const cols = Math.max(1, Math.min(items.length, resolveGridColumns(settings().gridColumns)));
    const within = document.activeElement && $menu[0].contains(document.activeElement);
    if (!within && ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;

    switch (ev.key) {
        case 'ArrowDown':  ev.preventDefault(); focusedIndex = Math.min(items.length - 1, focusedIndex + cols); break;
        case 'ArrowUp':    ev.preventDefault(); focusedIndex = Math.max(0, focusedIndex - cols); break;
        case 'ArrowRight': ev.preventDefault(); focusedIndex = Math.min(items.length - 1, focusedIndex + 1); break;
        case 'ArrowLeft':  ev.preventDefault(); focusedIndex = Math.max(0, focusedIndex - 1); break;
        case 'Home':       ev.preventDefault(); focusedIndex = 0; break;
        case 'End':        ev.preventDefault(); focusedIndex = items.length - 1; break;
        case 'Enter':
        case ' ':
            if (focusedIndex >= 0) { ev.preventDefault(); items[focusedIndex]?.click(); }
            return;
        default: return;
    }

    if (focusedIndex < 0) focusedIndex = 0;
    items[focusedIndex]?.focus();
}

// ─── context menu ───────────────────────────────────────────────────────────
function closeContextMenu() {
    $('.qpp-context-menu').remove();
}

function showContextMenu(x, y, avatarId) {
    closeContextMenu();
    const { name } = personaMeta(avatarId);
    const isCurrent = avatarId === user_avatar;
    const isDefault = avatarId === power_user.default_persona;
    const chatLocked = isCurrent && isPersonaLocked('chat');
    const charLocked = isCurrent && isPersonaLocked('character');

    const $cm = $(`
        <div class="qpp-context-menu" role="menu">
            <div class="qpp-cm-header">${escapeHtml(name)}</div>
            ${!isCurrent ? `<div class="qpp-cm-item" data-act="select"><i class="fa-solid fa-check"></i> ${t`Select persona`}</div>` : ''}
            <div class="qpp-cm-item" data-act="lock-chat"><i class="fa-solid fa-comment"></i> ${chatLocked ? t`Unlock from chat` : t`Lock to chat`}</div>
            <div class="qpp-cm-item" data-act="lock-char"><i class="fa-solid fa-user-lock"></i> ${charLocked ? t`Unlock from character` : t`Lock to character`}</div>
            <div class="qpp-cm-item" data-act="default"><i class="fa-solid fa-star"></i> ${isDefault ? t`Remove default` : t`Set as default`}</div>
            <div class="qpp-cm-sep"></div>
            <div class="qpp-cm-item" data-act="manage"><i class="fa-solid fa-gear"></i> ${t`Open Persona Management`}</div>
        </div>`);

    $cm.css({ left: x + 'px', top: y + 'px' });
    $(document.body).append($cm);

    // Keep on-screen
    const rect = $cm[0].getBoundingClientRect();
    if (rect.right > window.innerWidth)   $cm.css({ left: (window.innerWidth - rect.width - 8) + 'px' });
    if (rect.bottom > window.innerHeight) $cm.css({ top:  (window.innerHeight - rect.height - 8) + 'px' });

    $cm.on('click', '.qpp-cm-item', async (e) => {
        const act = $(e.currentTarget).attr('data-act');
        closeContextMenu();
        switch (act) {
            case 'select':
                await setUserAvatar(avatarId);
                break;
            case 'lock-chat':
                if (!isCurrent) await setUserAvatar(avatarId);
                await togglePersonaLock('chat');
                break;
            case 'lock-char':
                if (!isCurrent) await setUserAvatar(avatarId);
                await togglePersonaLock('character');
                break;
            case 'default':
                if (!isCurrent) await setUserAvatar(avatarId);
                await togglePersonaLock('default');
                break;
            case 'manage':
                openPersonaManagementPanel();
                break;
        }
    });

    setTimeout(() => {
        const off = (ev) => {
            if (ev.target.closest('.qpp-context-menu')) return;
            closeContextMenu();
            document.removeEventListener('click', off, true);
        };
        document.addEventListener('click', off, true);
    }, 0);
}

function updateFooter($menu) {
    const { name, title } = personaMeta(user_avatar);
    const locks = [];
    if (isPersonaLocked('chat')) locks.push(`<span class="qpp-chip qpp-chip-chat"><i class="fa-solid fa-comment"></i> ${t`chat`}</span>`);
    if (isPersonaLocked('character')) locks.push(`<span class="qpp-chip qpp-chip-char"><i class="fa-solid fa-user-lock"></i> ${t`character`}</span>`);
    if (user_avatar === power_user.default_persona) locks.push(`<span class="qpp-chip qpp-chip-default"><i class="fa-solid fa-star"></i> ${t`default`}</span>`);
    const label = title ? `${escapeHtml(name)} <span class="qpp-title">${escapeHtml(title)}</span>` : escapeHtml(name);
    $menu.find('.qpp-current-name').html(`<i class="fa-solid fa-user"></i> ${label} ${locks.join('')}`);
}

// ─── slash commands ─────────────────────────────────────────────────────────
function registerSlashCommands() {
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'qpp',
            helpString: `${BRAND}: toggle the persona picker or switch by name.`,
            returns: 'current persona name',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'persona name (optional; toggles menu if omitted)',
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            ],
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'lock',
                    description: 'lock target after switching',
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumList: ['chat', 'character', 'default'],
                }),
            ],
            callback: async (args, value) => {
                const nameArg = typeof value === 'string' ? value.trim() : '';
                if (!nameArg) {
                    await toggleQuickPersonaSelector();
                    return personaMeta(user_avatar).name;
                }
                const match = Object.entries(power_user.personas || {})
                    .find(([, n]) => String(n).toLowerCase() === nameArg.toLowerCase());
                if (!match) {
                    toastr.warning(t`Persona not found: ${nameArg}`, BRAND);
                    return '';
                }
                await setUserAvatar(match[0]);
                if (args?.lock && ['chat', 'character', 'default'].includes(String(args.lock))) {
                    await togglePersonaLock(String(args.lock));
                }
                return match[1];
            },
        }));
    } catch (err) {
        console.warn('[QPP] slash command registration failed:', err);
    }
}

// ─── global hotkey ──────────────────────────────────────────────────────────
/**
 * Matches the configured hotkey against a KeyboardEvent. `ev.code` fallback
 * means the hotkey works on non-Latin keyboard layouts (Cyrillic, etc.).
 */
function matchesHotkey(ev) {
    const cfg = settings();
    if (!cfg.enableHotkey || !cfg.hotkey) return false;

    const hasCtrl = ev.ctrlKey || ev.metaKey;
    if (hasCtrl !== !!cfg.hotkeyCtrl) return false;
    if (ev.shiftKey !== !!cfg.hotkeyShift) return false;
    if (ev.altKey !== !!cfg.hotkeyAlt) return false;

    const key = String(cfg.hotkey).toLowerCase();
    const evKey = String(ev.key || '').toLowerCase();
    const evCode = String(ev.code || '').toLowerCase();
    return evKey === key || evCode === 'key' + key;
}

function onGlobalHotkey(ev) {
    if (!matchesHotkey(ev)) return;
    // Capture phase: beat both ST's router and the browser's default (e.g. Ctrl+P = Print).
    ev.preventDefault();
    ev.stopPropagation();
    toggleQuickPersonaSelector();
}

// ─── settings panel ─────────────────────────────────────────────────────────
function renderSettingsPanel() {
    if ($('#qpp-settings-panel').length) return;

    const cfg = settings();
    const html = `
    <div id="qpp-settings-panel" class="qpp-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${BRAND}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <small class="qpp-muted">${t`Supercharged persona switcher. Based on Quick Persona by Cohee1207.`}</small>

                <label class="checkbox_label qpp-mt">
                    <input type="checkbox" id="qpp-enableSearch" ${cfg.enableSearch ? 'checked' : ''}>
                    <span>${t`Enable search bar`}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-enableKeyboardNav" ${cfg.enableKeyboardNav ? 'checked' : ''}>
                    <span>${t`Enable keyboard navigation (arrows / Enter / Esc)`}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-enableContextMenu" ${cfg.enableContextMenu ? 'checked' : ''}>
                    <span>${t`Enable right-click context menu`}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-enableLockIndicators" ${cfg.enableLockIndicators ? 'checked' : ''}>
                    <span>${t`Show lock indicators (chat / character / default)`}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-showPersonaName" ${cfg.showPersonaName ? 'checked' : ''}>
                    <span>${t`Show persona name under each avatar`}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-showDescriptionTooltip" ${cfg.showDescriptionTooltip ? 'checked' : ''}>
                    <span>${t`Show description preview in tooltip`}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-glyphInHeader" ${cfg.glyphInHeader ? 'checked' : ''}>
                    <span>${t`Decorative glyphs`} ${GLYPH}</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="qpp-touchActionRow" ${cfg.touchActionRow ? 'checked' : ''}>
                    <span>${t`Show mobile quick-action toolbar (touch devices)`}</span>
                </label>

                <div class="qpp-hotkey-block qpp-mt">
                    <label class="checkbox_label">
                        <input type="checkbox" id="qpp-enableHotkey" ${cfg.enableHotkey ? 'checked' : ''}>
                        <span><b>${t`Global hotkey`}</b></span>
                    </label>
                    <div class="qpp-hotkey-row">
                        <label class="checkbox_label qpp-inline">
                            <input type="checkbox" id="qpp-hotkeyCtrl" ${cfg.hotkeyCtrl ? 'checked' : ''}>
                            <span>Ctrl/Cmd</span>
                        </label>
                        <label class="checkbox_label qpp-inline">
                            <input type="checkbox" id="qpp-hotkeyShift" ${cfg.hotkeyShift ? 'checked' : ''}>
                            <span>Shift</span>
                        </label>
                        <label class="checkbox_label qpp-inline">
                            <input type="checkbox" id="qpp-hotkeyAlt" ${cfg.hotkeyAlt ? 'checked' : ''}>
                            <span>Alt/Option</span>
                        </label>
                        <span class="qpp-muted">+</span>
                        <input type="text" id="qpp-hotkey" class="qpp-inline-input" maxlength="1" value="${escapeAttr(String(cfg.hotkey || ''))}">
                        <span class="qpp-muted qpp-ml qpp-hotkey-preview"></span>
                    </div>
                    <small class="qpp-muted">${t`Default is Ctrl/Cmd + Shift + P (avoids the browser's Print shortcut).`}</small>
                </div>

                <div class="qpp-row qpp-mt">
                    <label for="qpp-gridColumns">${t`Grid columns`}</label>
                    <label class="checkbox_label qpp-inline">
                        <input type="checkbox" id="qpp-gridAuto" ${cfg.gridColumns === 'auto' ? 'checked' : ''}>
                        <span>${t`Auto`}</span>
                    </label>
                    <input type="number" id="qpp-gridColumns" min="3" max="12" step="1"
                           class="text_pole qpp-num"
                           ${cfg.gridColumns === 'auto' ? 'disabled' : ''}
                           value="${cfg.gridColumns === 'auto' ? resolveGridColumns('auto') : (Number(cfg.gridColumns) || 5)}">
                    <span class="qpp-muted qpp-grid-auto-hint"></span>
                </div>
                <div class="qpp-row">
                    <label for="qpp-menuPlacement">${t`Menu placement`}</label>
                    <select id="qpp-menuPlacement" class="text_pole">
                        ${['top-start','top','top-end','bottom-start','bottom','bottom-end']
                            .map(p => `<option value="${p}" ${cfg.menuPlacement === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>

                <div class="qpp-row qpp-mt">
                    <button class="menu_button" id="qpp-reset">${t`Reset defaults`}</button>
                    <span class="qpp-muted qpp-ml">v${__QPP_PROV__.v} · ${__QPP_PROV__.a}${IS_TOUCH ? ' · 📱 touch' : ''}</span>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(html);

    const bindCheckbox = (id, key, refresh = true) => $(`#${id}`).on('change', function () { cfg[key] = this.checked; saveSettingsDebounced(); if (refresh) refreshAll(); updateHotkeyPreview(); });
    bindCheckbox('qpp-enableSearch', 'enableSearch');
    bindCheckbox('qpp-enableKeyboardNav', 'enableKeyboardNav');
    bindCheckbox('qpp-enableContextMenu', 'enableContextMenu');
    bindCheckbox('qpp-enableLockIndicators', 'enableLockIndicators');
    bindCheckbox('qpp-showPersonaName', 'showPersonaName');
    bindCheckbox('qpp-showDescriptionTooltip', 'showDescriptionTooltip');
    bindCheckbox('qpp-glyphInHeader', 'glyphInHeader');
    bindCheckbox('qpp-touchActionRow', 'touchActionRow');
    // Hotkey modifiers do not require a full menu refresh
    bindCheckbox('qpp-enableHotkey', 'enableHotkey', false);
    bindCheckbox('qpp-hotkeyCtrl', 'hotkeyCtrl', false);
    bindCheckbox('qpp-hotkeyShift', 'hotkeyShift', false);
    bindCheckbox('qpp-hotkeyAlt', 'hotkeyAlt', false);

    $('#qpp-hotkey').on('input', function () {
        const v = String(this.value || '').trim().slice(0, 1).toLowerCase();
        cfg.hotkey = v;
        this.value = v;
        saveSettingsDebounced();
        updateHotkeyPreview();
    });

    function updateHotkeyPreview() {
        const parts = [];
        if (cfg.hotkeyCtrl)  parts.push(isMac() ? '⌘' : 'Ctrl');
        if (cfg.hotkeyShift) parts.push('⇧');
        if (cfg.hotkeyAlt)   parts.push(isMac() ? '⌥' : 'Alt');
        if (cfg.hotkey)      parts.push(String(cfg.hotkey).toUpperCase());
        $('.qpp-hotkey-preview').text(cfg.enableHotkey && parts.length ? '= ' + parts.join(' + ') : t`(disabled)`);
    }
    updateHotkeyPreview();
    $('#qpp-gridColumns').on('change', function () {
        const n = Math.max(3, Math.min(12, Number(this.value) || 5));
        cfg.gridColumns = n;
        this.value = String(n);
        saveSettingsDebounced();
        updateGridAutoHint();
    });
    $('#qpp-gridAuto').on('change', function () {
        const $num = $('#qpp-gridColumns');
        if (this.checked) {
            cfg.gridColumns = 'auto';
            $num.prop('disabled', true).val(String(resolveGridColumns('auto')));
        } else {
            // Falling back to explicit: take the currently computed auto value as the starting point
            const n = resolveGridColumns('auto');
            cfg.gridColumns = n;
            $num.prop('disabled', false).val(String(n));
        }
        saveSettingsDebounced();
        updateGridAutoHint();
    });

    function updateGridAutoHint() {
        const $hint = $('.qpp-grid-auto-hint');
        if (cfg.gridColumns === 'auto') {
            const n = resolveGridColumns('auto');
            const w = window.innerWidth;
            const suffix = IS_TOUCH ? t`, touch` : '';
            $hint.text(t`(= ${n} columns at ${w}px${suffix})`);
        } else {
            $hint.text('');
        }
    }
    updateGridAutoHint();
    $('#qpp-menuPlacement').on('change', function () {
        cfg.menuPlacement = String(this.value || 'top-start');
        saveSettingsDebounced();
    });
    $('#qpp-reset').on('click', async () => {
        if (!confirm(t`Reset ${BRAND} to default settings?`)) return;
        extension_settings[MODULE] = structuredClone(DEFAULT_SETTINGS);
        saveSettingsDebounced();
        $('#qpp-settings-panel').remove();
        renderSettingsPanel();
        refreshAll();
    });
}

function refreshAll() {
    refreshButton();
    if (isOpen) { closeQuickPersonaSelector(); setTimeout(() => toggleQuickPersonaSelector(), animation_duration + 20); }
}

// ─── events ─────────────────────────────────────────────────────────────────
function wireEvents() {
    const invalidateCache = () => { cachedAvatars = null; };

    eventSource.on(event_types.PERSONA_CHANGED, () => { invalidateCache(); refreshButton(); });
    eventSource.on(event_types.SETTINGS_UPDATED, () => { invalidateCache(); refreshButton(); });
    eventSource.on(event_types.CHAT_CHANGED, refreshButton);

    // window + capture: beats both ST's keyboard router and the browser's default action.
    window.addEventListener('keydown', onGlobalHotkey, { capture: true });

    qppLongPress('#quickPersona', function (ev) {
        if (!settings().enableContextMenu) return;
        const pt = pointerPageXY(ev);
        showContextMenu(pt.x, pt.y, user_avatar);
    });
    qppLongPress('#quickPersonaMenu .qpp-grid li.qpp-item', function (ev) {
        if (!settings().enableContextMenu) return;
        const avatarId = getItemAvatarId(this);
        if (!avatarId) return;
        const pt = pointerPageXY(ev);
        showContextMenu(pt.x, pt.y, avatarId);
    });
}

// ─── init ───────────────────────────────────────────────────────────────────
jQuery(async () => {
    settings();
    await loadLocale();
    addQuickPersonaButton();
    wireEvents();
    registerSlashCommands();
    renderSettingsPanel();
    refreshButton();

    try {
        document.documentElement.dataset.qppSig = __QPP_PROV__.h;
        document.documentElement.dataset.qppBy = __QPP_PROV__.a;
    } catch { /* noop */ }

    console.info(`%c${BRAND}%c v${__QPP_PROV__.v} loaded.`,
        'font-weight:bold;color:#b48cff', 'color:inherit');
});
