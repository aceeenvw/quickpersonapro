/*
 * ⊹ Quick Persona Pro ⊹
 * Supercharged persona switcher for SillyTavern.
 * Based on Extension-QuickPersona by Cohee1207 (AGPL-3.0).
 * Fork author: aceenvw  —  https://github.com/aceeenvw/quickpersonapro
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

/* ───────────────────────────────── runtime identity ─────────────────────────────────
 * Build-time provenance marker. Derived from a mapped char sequence so the plain
 * author handle never appears as a literal in source. Attached to the global
 * registry and to the root DOM node so it survives minification and DOM cloning.
 * Verify in devtools:  window.__qpp_provenance()   →  { a, v, h }
 * ---------------------------------------------------------------------------------- */
const __QPP_PROV__ = (() => {
    const seed = [0x61, 0x63, 0x65, 0x65, 0x6e, 0x76, 0x77];
    const a = String.fromCharCode.apply(null, seed);
    const v = '1.0.0';
    // Lightweight FNV-1a over (a + v) for integrity
    let h = 0x811c9dc5;
    for (const c of (a + '@' + v)) { h ^= c.charCodeAt(0); h = (h * 0x01000193) >>> 0; }
    const sig = { a, v, h: h.toString(16).padStart(8, '0') };
    try { Object.defineProperty(globalThis, '__qpp_provenance', { value: () => ({ ...sig }), enumerable: false }); } catch { /* noop */ }
    return sig;
})();

const MODULE = 'quickPersonaPro';
const GLYPH = '⊹';
const BRAND = `${GLYPH} Quick Persona Pro ${GLYPH}`;

/* ────────────────────────────────── settings schema ─────────────────────────────── */
const DEFAULT_SETTINGS = Object.freeze({
    enableSearch: true,
    enableKeyboardNav: true,
    enableContextMenu: true,
    enableLockIndicators: true,
    enableHotkey: true,
    hotkey: 'p',          // Ctrl/Cmd + hotkey
    gridColumns: 5,
    showPersonaName: true,
    showDescriptionTooltip: true,
    glyphInHeader: true,
    menuPlacement: 'top-start',
});

function settings() {
    if (!extension_settings[MODULE] || typeof extension_settings[MODULE] !== 'object') {
        extension_settings[MODULE] = structuredClone(DEFAULT_SETTINGS);
    } else {
        // merge new keys from schema without overwriting user values
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            if (!(k in extension_settings[MODULE])) extension_settings[MODULE][k] = v;
        }
    }
    return extension_settings[MODULE];
}

/* ───────────────────────────────── i18n bootstrap ───────────────────────────────── */
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

/* ───────────────────────────────── module state ─────────────────────────────────── */
/** @type {ReturnType<typeof Popper.createPopper>|null} */
let popper = null;
let isOpen = false;
let cachedAvatars = null;   // avatar id list, invalidated on persona events
let focusedIndex = -1;      // keyboard focus index within visible menu items
let outsideClickHandler = null;
let keyHandler = null;

const supportsPersonaThumbnails = getThumbnailUrl('persona', 'test.png', true).includes('&t=');

/* ──────────────────────────────── image helpers ─────────────────────────────────── */
function getImageUrl(userAvatar) {
    if (supportsPersonaThumbnails) return getThumbnailUrl('persona', userAvatar, true);
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
    if (isPersonaLocked('chat')) locks.push(t`chat`);
    if (isPersonaLocked('character')) locks.push(t`character`);
    if (avatarId === power_user.default_persona) locks.push(t`default`);
    if (avatarId === user_avatar && locks.length) {
        tip += `\n\n${t`Locked to`}: ${locks.join(', ')}`;
    }
    return tip;
}

/* ───────────────────────────────── main button ──────────────────────────────────── */
function addQuickPersonaButton() {
    if ($('#quickPersona').length) return;
    const html = `
        <div id="quickPersona" class="interactable" tabindex="0"
             role="button" aria-haspopup="menu" aria-expanded="false"
             title="${BRAND}" data-qpp-sig="${__QPP_PROV__.h}">
            <img id="quickPersonaImg" alt="" src="/img/ai4.png" />
            <div id="quickPersonaCaret" class="fa-fw fa-solid fa-caret-up"></div>
            <div id="quickPersonaLockBadge" class="qpp-lock-badge" aria-hidden="true"></div>
        </div>`;
    $('#leftSendForm').append(html);
    $('#quickPersona')
        .on('click', onButtonClick)
        .on('keydown', onButtonKeydown)
        .on('contextmenu', onButtonContextMenu);
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

/* ─────────────────────────────── menu open/close ────────────────────────────────── */
async function toggleQuickPersonaSelector() {
    if (isOpen) return closeQuickPersonaSelector();
    await openQuickPersonaSelector();
}

async function openQuickPersonaSelector() {
    if (isOpen) return;
    isOpen = true;

    const cfg = settings();
    const userAvatars = cachedAvatars ?? (cachedAvatars = await getUserAvatars(false));

    const $menu = $(`
        <div id="quickPersonaMenu" role="menu" aria-label="${BRAND}">
            <div class="qpp-menu-header">
                <div class="qpp-menu-title">${cfg.glyphInHeader ? `${GLYPH} ` : ''}${t`Quick Persona`}${cfg.glyphInHeader ? ` ${GLYPH}` : ''}</div>
                <div class="qpp-menu-actions">
                    <div class="qpp-icon-btn fa-solid fa-plus" data-action="new"
                         title="${t`Create new persona`}" tabindex="0" role="button"></div>
                    <div class="qpp-icon-btn fa-solid fa-gear" data-action="manage"
                         title="${t`Open Persona Management`}" tabindex="0" role="button"></div>
                </div>
            </div>
            ${cfg.enableSearch ? `
                <div class="qpp-search-wrap">
                    <i class="fa-solid fa-magnifying-glass qpp-search-icon"></i>
                    <input type="text" class="qpp-search text_pole"
                           placeholder="${t`Search personas…`}"
                           aria-label="${t`Search personas`}" />
                </div>` : ''}
            <ul class="list-group qpp-grid" style="--qpp-cols:${Math.max(3, Math.min(12, Number(cfg.gridColumns) || 5))};"></ul>
            ${cfg.showPersonaName ? `<div class="qpp-menu-footer"><span class="qpp-current-name"></span></div>` : ''}
        </div>`);

    buildMenuItems($menu.find('.qpp-grid'), userAvatars, '');
    updateFooter($menu);

    $menu.hide().appendTo(document.body);

    // Caret + fade
    $('#quickPersonaCaret').removeClass('fa-caret-up').addClass('fa-caret-down');
    $('#quickPersona').attr('aria-expanded', 'true');
    $menu.fadeIn(animation_duration);

    // Popper
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

    // Interactions
    $menu.on('click', '.qpp-grid li', onPersonaItemClick);
    $menu.on('contextmenu', '.qpp-grid li', onPersonaItemContextMenu);
    $menu.on('click', '[data-action]', onMenuAction);

    if (cfg.enableSearch) {
        $menu.find('.qpp-search').on('input', (e) => {
            const term = String(e.target.value || '').trim();
            buildMenuItems($menu.find('.qpp-grid'), userAvatars, term);
            focusedIndex = -1;
        });
        // autofocus search only on keyboard opens (not mouse)
        if (document.activeElement === document.getElementById('quickPersona')) {
            setTimeout(() => $menu.find('.qpp-search').trigger('focus'), 50);
        }
    }

    // Outside click handler (scoped to this open session)
    outsideClickHandler = (ev) => {
        if (!isOpen) return;
        if (ev.target.closest('#quickPersonaMenu')) return;
        if (ev.target.closest('#quickPersona')) return;
        if (ev.target.closest('.qpp-context-menu')) return;
        closeQuickPersonaSelector();
    };
    document.addEventListener('click', outsideClickHandler, true);

    // Keyboard nav handler (scoped)
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
    if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }

    // Null-guard: old extension crashed here if popper was already destroyed
    if (popper) { try { popper.destroy(); } catch { /* noop */ } popper = null; }

    closeContextMenu();
}

/* ─────────────────────────────── menu item building ─────────────────────────────── */
function buildMenuItems($list, avatars, search) {
    $list.empty();

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
        $list.append(`<li class="qpp-empty" aria-disabled="true">${t`No personas match.`}</li>`);
        return;
    }

    const cfg = settings();
    for (const avatarId of filtered) {
        const { name } = personaMeta(avatarId);
        const imgUrl = getImageUrl(avatarId);
        const tooltip = formatTooltip(avatarId);
        const isSelected = avatarId === user_avatar;
        const isDefault = avatarId === power_user.default_persona;
        const chatLocked = cfg.enableLockIndicators && isSelected && isPersonaLocked('chat');
        const charLocked = cfg.enableLockIndicators && isSelected && isPersonaLocked('character');

        const $li = $(`
            <li tabindex="0" class="list-group-item interactable" role="menuitem"
                data-avatar-id="${CSS.escape(avatarId)}" title="${escapeAttr(tooltip)}">
                <img class="quickPersonaMenuImg" alt="" />
                <div class="qpp-lock-stack" aria-hidden="true">
                    ${isDefault ? '<i class="qpp-lk qpp-lk-default fa-solid fa-star" title="default"></i>' : ''}
                    ${chatLocked ? '<i class="qpp-lk qpp-lk-chat fa-solid fa-comment"></i>' : ''}
                    ${charLocked ? '<i class="qpp-lk qpp-lk-char fa-solid fa-user-lock"></i>' : ''}
                </div>
                ${cfg.showPersonaName ? `<div class="qpp-item-name">${escapeHtml(name)}</div>` : ''}
            </li>`);

        $li.find('img')
            .attr('src', imgUrl)
            .toggleClass('selected', isSelected)
            .toggleClass('default', isDefault);

        $list.append($li);
    }
}

/* ───────────────────────────── interaction handlers ─────────────────────────────── */
async function onPersonaItemClick(e) {
    const avatarId = $(e.currentTarget).attr('data-avatar-id');
    if (!avatarId) return;
    closeQuickPersonaSelector();
    if (e.shiftKey) {
        // Shift+click: select and lock to chat
        await setUserAvatar(avatarId);
        await togglePersonaLock('chat');
        return;
    }
    if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+click: select and lock to character
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
    const avatarId = $(e.currentTarget).attr('data-avatar-id');
    if (avatarId) showContextMenu(e.pageX, e.pageY, avatarId);
}

function onMenuAction(e) {
    const action = $(e.currentTarget).attr('data-action');
    closeQuickPersonaSelector();
    if (action === 'new') {
        const addBtn = document.getElementById('create_dummy_persona');
        if (addBtn instanceof HTMLElement) { openPersonaManagementPanel(); setTimeout(() => addBtn.click(), 300); }
        else openPersonaManagementPanel();
    }
    if (action === 'manage') openPersonaManagementPanel();
}

function onMenuKeydown(ev, $menu) {
    if (!isOpen) return;
    const items = $menu.find('.qpp-grid li[data-avatar-id]').get();
    if (ev.key === 'Escape') {
        ev.preventDefault();
        closeQuickPersonaSelector();
        document.getElementById('quickPersona')?.focus();
        return;
    }
    if (!items.length) return;
    const cfg = settings();
    const cols = Math.max(1, Math.min(items.length, Number(cfg.gridColumns) || 5));
    const within = document.activeElement && $menu[0].contains(document.activeElement);
    if (!within && ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;

    if (ev.key === 'ArrowDown') { ev.preventDefault(); focusedIndex = Math.min(items.length - 1, focusedIndex + cols); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); focusedIndex = Math.max(0, focusedIndex - cols); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); focusedIndex = Math.min(items.length - 1, focusedIndex + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); focusedIndex = Math.max(0, focusedIndex - 1); }
    else if (ev.key === 'Home') { ev.preventDefault(); focusedIndex = 0; }
    else if (ev.key === 'End') { ev.preventDefault(); focusedIndex = items.length - 1; }
    else if ((ev.key === 'Enter' || ev.key === ' ') && focusedIndex >= 0) {
        ev.preventDefault();
        items[focusedIndex]?.click();
        return;
    } else return;

    if (focusedIndex < 0) focusedIndex = 0;
    items[focusedIndex]?.focus();
}

/* ───────────────────────────── context menu (rich) ──────────────────────────────── */
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

    // Ensure on-screen
    const rect = $cm[0].getBoundingClientRect();
    if (rect.right > window.innerWidth)  $cm.css({ left: (window.innerWidth - rect.width - 8) + 'px' });
    if (rect.bottom > window.innerHeight) $cm.css({ top: (window.innerHeight - rect.height - 8) + 'px' });

    $cm.on('click', '.qpp-cm-item', async (e) => {
        const act = $(e.currentTarget).attr('data-act');
        closeContextMenu();
        if (act === 'select') { await setUserAvatar(avatarId); return; }
        if (act === 'lock-chat') {
            if (!isCurrent) await setUserAvatar(avatarId);
            await togglePersonaLock('chat'); return;
        }
        if (act === 'lock-char') {
            if (!isCurrent) await setUserAvatar(avatarId);
            await togglePersonaLock('character'); return;
        }
        if (act === 'default') {
            if (!isCurrent) await setUserAvatar(avatarId);
            await togglePersonaLock('default'); return;
        }
        if (act === 'manage') openPersonaManagementPanel();
    });

    setTimeout(() => {
        const off = (ev) => { if (!ev.target.closest('.qpp-context-menu')) { closeContextMenu(); document.removeEventListener('click', off, true); } };
        document.addEventListener('click', off, true);
    }, 0);
}

/* ───────────────────────────── main button refresh ──────────────────────────────── */
function refreshButton() {
    const imgUrl = getImageUrl(user_avatar);
    const tooltip = formatTooltip(user_avatar);
    $('#quickPersonaImg').attr('src', imgUrl).attr('title', tooltip);
    $('#quickPersona').attr('title', tooltip);

    // Lock badge on main button
    const $badge = $('#quickPersonaLockBadge');
    $badge.removeClass('qpp-has-lock qpp-lock-chat qpp-lock-char qpp-lock-default').empty();
    const cfg = settings();
    if (!cfg.enableLockIndicators) return;

    if (isPersonaLocked('chat')) {
        $badge.addClass('qpp-has-lock qpp-lock-chat')
              .html('<i class="fa-solid fa-comment" title="chat lock"></i>');
    } else if (isPersonaLocked('character')) {
        $badge.addClass('qpp-has-lock qpp-lock-char')
              .html('<i class="fa-solid fa-user-lock" title="character lock"></i>');
    } else if (user_avatar === power_user.default_persona) {
        $badge.addClass('qpp-has-lock qpp-lock-default')
              .html('<i class="fa-solid fa-star" title="default"></i>');
    }
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

/* ─────────────────────────────── slash commands ─────────────────────────────────── */
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
                if (!nameArg) { await toggleQuickPersonaSelector(); return personaMeta(user_avatar).name; }
                const match = Object.entries(power_user.personas || {}).find(([, n]) => String(n).toLowerCase() === nameArg.toLowerCase());
                if (!match) { toastr.warning(t`Persona not found: ${nameArg}`, BRAND); return ''; }
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

/* ─────────────────────────────── global hotkey ──────────────────────────────────── */
function onGlobalHotkey(ev) {
    const cfg = settings();
    if (!cfg.enableHotkey || !cfg.hotkey) return;
    const key = String(cfg.hotkey).toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === key) {
        // Avoid stealing browser actions if focus is in editable text? Only when NOT in an input.
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
        if (isEditable && !ev.target?.closest?.('#quickPersonaMenu')) return;
        ev.preventDefault();
        toggleQuickPersonaSelector();
    }
}

/* ─────────────────────────────── settings panel ─────────────────────────────────── */
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
                    <input type="checkbox" id="qpp-enableHotkey" ${cfg.enableHotkey ? 'checked' : ''}>
                    <span>${t`Global hotkey`} (Ctrl/Cmd + <input type="text" id="qpp-hotkey" class="qpp-inline-input" maxlength="1" value="${escapeAttr(String(cfg.hotkey || ''))}">)</span>
                </label>

                <div class="qpp-row qpp-mt">
                    <label for="qpp-gridColumns">${t`Grid columns`}</label>
                    <input type="number" id="qpp-gridColumns" min="3" max="12" step="1"
                           class="text_pole qpp-num" value="${Number(cfg.gridColumns) || 5}">
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
                    <span class="qpp-muted qpp-ml">v${__QPP_PROV__.v} · ${__QPP_PROV__.a}</span>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(html);

    const bindCheckbox = (id, key) => $(`#${id}`).on('change', function () { cfg[key] = this.checked; saveSettingsDebounced(); refreshAll(); });
    bindCheckbox('qpp-enableSearch', 'enableSearch');
    bindCheckbox('qpp-enableKeyboardNav', 'enableKeyboardNav');
    bindCheckbox('qpp-enableContextMenu', 'enableContextMenu');
    bindCheckbox('qpp-enableLockIndicators', 'enableLockIndicators');
    bindCheckbox('qpp-showPersonaName', 'showPersonaName');
    bindCheckbox('qpp-showDescriptionTooltip', 'showDescriptionTooltip');
    bindCheckbox('qpp-glyphInHeader', 'glyphInHeader');
    bindCheckbox('qpp-enableHotkey', 'enableHotkey');

    $('#qpp-hotkey').on('input', function () {
        const v = String(this.value || '').trim().slice(0, 1).toLowerCase();
        cfg.hotkey = v;
        this.value = v;
        saveSettingsDebounced();
    });
    $('#qpp-gridColumns').on('change', function () {
        const n = Math.max(3, Math.min(12, Number(this.value) || 5));
        cfg.gridColumns = n;
        this.value = String(n);
        saveSettingsDebounced();
    });
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

/* ───────────────────────────── small html escapers ──────────────────────────────── */
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/\n/g, '&#10;');
}

/* ──────────────────────────────── event wiring ──────────────────────────────────── */
function wireEvents() {
    const invalidateCache = () => { cachedAvatars = null; };

    // PERSONA_CHANGED is the dedicated event — replaces the old setTimeout hack.
    eventSource.on(event_types.PERSONA_CHANGED, () => {
        invalidateCache();
        refreshButton();
    });
    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        invalidateCache();
        refreshButton();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        refreshButton(); // lock indicators can change between chats
    });

    // Hotkey
    document.addEventListener('keydown', onGlobalHotkey, false);
}

/* ──────────────────────────────── initialization ────────────────────────────────── */
jQuery(async () => {
    settings(); // seed defaults
    await loadLocale();
    addQuickPersonaButton();
    wireEvents();
    registerSlashCommands();
    renderSettingsPanel();
    refreshButton();

    // Seal the signature into the host so theme reloads don't lose it
    try {
        document.documentElement.dataset.qppSig = __QPP_PROV__.h;
        document.documentElement.dataset.qppBy = __QPP_PROV__.a;
    } catch { /* noop */ }

    console.info(`%c${BRAND}%c v${__QPP_PROV__.v} loaded.`,
        'font-weight:bold;color:#b48cff', 'color:inherit');
});
