// Quick Persona Pro by aceenvw. Based on Quick Persona by Cohee1207.
import { eventSource, event_types, getThumbnailUrl } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { getUserAvatars, user_avatar, setUserAvatar, isPersonaLocked, setPersonaLockState } from '../../../personas.js';
import { t } from '../../../i18n.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } from '../../../slash-commands/SlashCommandArgument.js';

const scopes = ['chat', 'character', 'default'];
const nameOf = id => power_user.personas?.[id] || id || '';
const el = tag => document.createElement(tag);
let trigger, panel, catalog, busy = false;

function availability() {
    const ctx = SillyTavern.getContext();
    const group = !!ctx.groupId;
    return { group, default: !!user_avatar, character: group || !!ctx.characters?.[ctx.characterId]?.avatar, chat: !!ctx.getCurrentChatId?.() };
}

function sync() {
    const img = trigger.firstElementChild;
    if (img.dataset.avatar !== user_avatar) {
        img.dataset.avatar = user_avatar;
        img.src = user_avatar ? getThumbnailUrl('persona', user_avatar) : '/img/ai4.png';
    }
    trigger.title = `${t`Select persona`}: ${nameOf(user_avatar)}`;
    trigger.setAttribute('aria-label', trigger.title);
    if (!panel) return;
    const { grid, locks } = panel;
    const previous = grid.querySelector('[aria-pressed="true"]');
    if (previous && previous.dataset.avatar !== user_avatar) previous.setAttribute('aria-pressed', 'false');
    panel.tiles.get(user_avatar)?.setAttribute('aria-pressed', 'true');
    const available = availability();
    for (const button of locks.children) {
        const scope = button.dataset.scope;
        button.disabled = busy || !available[scope] || !user_avatar;
        button.setAttribute('aria-pressed', String(!!user_avatar && isPersonaLocked(scope)));
        if (scope === 'character') button.lastElementChild.textContent = available.group ? t`Group` : t`Character`;
    }
}

async function change(action) {
    if (busy) return;
    busy = true; sync();
    try { await action(); }
    finally { busy = false; sync(); }
}

function fail(error) {
    console.warn('[QPP] persona action', error);
    toastr.error(t`Could not update personas.`);
}

function close(restoreFocus = false) {
    if (!panel) return;
    const { root, events } = panel;
    panel = null;
    events.abort(); root.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
}

function position(p) {
    const view = window.visualViewport, anchor = trigger.getBoundingClientRect();
    const top = view?.offsetTop ?? 0, left = view?.offsetLeft ?? 0;
    const width = view?.width ?? window.innerWidth, height = view?.height ?? window.innerHeight;
    const bottom = Math.min(top + height - 6, Math.max(top + Math.min(height - 6, 145), anchor.top - 6));
    p.root.style.maxWidth = `${width - 12}px`;
    p.root.style.maxHeight = `${bottom - top - 6}px`;
    p.root.style.left = `${Math.max(left + 6, Math.min(anchor.left, left + width - p.root.offsetWidth - 6))}px`;
    p.root.style.top = `${bottom}px`;
}

function appendBatch(p) {
    const frag = document.createDocumentFragment();
    for (const id of p.matches.slice(p.tiles.size, p.tiles.size + 32)) {
        const button = el('button'), img = el('img'), label = el('span');
        button.type = 'button'; button.dataset.avatar = id; button.title = label.textContent = nameOf(id);
        button.setAttribute('aria-pressed', String(id === user_avatar));
        img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = getThumbnailUrl('persona', id);
        button.append(img, label); frag.append(button); p.tiles.set(id, button);
    }
    p.grid.append(frag);
}

function filter(p) {
    const q = p.search.value.trim().toLowerCase();
    p.matches = p.avatars.filter(id => !q || nameOf(id).toLowerCase().includes(q));
    p.tiles.clear(); p.grid.replaceChildren(); p.grid.scrollTop = 0;
    appendBatch(p);
    if (!p.matches.length) p.grid.textContent = t`No personas match.`;
}

async function load(p) {
    const request = catalog ??= getUserAvatars(false);
    let ids;
    try {
        ids = await request;
        if (!Array.isArray(ids)) throw new Error('Avatar list unavailable');
    } catch (error) {
        if (catalog !== request) return;
        catalog = null;
        if (panel === p) { close(true); fail(error); }
        return;
    }
    if (panel !== p || catalog !== request) return;
    p.avatars = ids.includes(user_avatar) ? [user_avatar, ...ids.filter(id => id !== user_avatar)] : ids;
    p.search.hidden = ids.length <= 8;
    if (p.search.hidden) p.search.value = '';
    filter(p); sync();
}

async function toggle() {
    if (panel) { close(true); return; }
    const root = el('section'), search = el('input'), grid = el('div'), locks = el('div');
    const p = panel = { root, search, grid, locks, avatars: [], matches: [], tiles: new Map(), events: new AbortController() };
    const options = { signal: p.events.signal };
    root.id = 'quickPersonaMenu'; root.tabIndex = -1; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', t`Select persona`);
    search.type = 'search'; search.hidden = true; search.placeholder = t`Search personas`; search.setAttribute('aria-label', search.placeholder);
    grid.className = 'qpp-grid'; locks.className = 'qpp-locks'; locks.setAttribute('role', 'group'); locks.setAttribute('aria-label', t`Persona locks`);
    for (const [i, scope] of scopes.entries()) {
        const button = el('button'), icon = el('i'), label = el('span');
        button.type = 'button'; button.dataset.scope = scope;
        icon.className = `fa-solid fa-${['comment', 'user', 'star'][i]}`; icon.setAttribute('aria-hidden', 'true');
        label.textContent = [t`Chat`, t`Character`, t`Default`][i]; button.append(icon, label); locks.append(button);
    }
    root.append(search, grid, locks); document.body.append(root); trigger.setAttribute('aria-expanded', 'true');
    position(p); sync(); root.focus({ preventScroll: true });
    search.oninput = () => filter(p);
    grid.onscroll = () => { if (p.tiles.size < p.matches.length && grid.scrollHeight - grid.scrollTop - grid.clientHeight < 80) appendBatch(p); };
    root.onclick = event => {
        const button = event.target.closest('button');
        if (!button) return;
        const { avatar, scope } = button.dataset;
        void change(() => avatar ? setUserAvatar(avatar) : setPersonaLockState(!isPersonaLocked(scope), scope)).catch(fail);
    };
    root.onkeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.target !== root && !grid.contains(event.target)) return;
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols}[event.key];
        if (!step && !['Home','End'].includes(event.key)) return;
        event.preventDefault();
        const current = p.matches.indexOf(event.target.dataset.avatar);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? p.matches.length - 1 : Math.max(0, Math.min(p.matches.length - 1, current + step));
        while (p.tiles.size <= next && p.tiles.size < p.matches.length) appendBatch(p);
        p.tiles.get(p.matches[next])?.focus();
    };
    document.addEventListener('pointerdown', e => { if (!root.contains(e.target) && !trigger.contains(e.target)) close(); }, options);
    document.addEventListener('focusin', e => { if (!root.contains(e.target) && !trigger.contains(e.target)) close(); }, options);
    for (const target of [window, window.visualViewport].filter(Boolean)) target.addEventListener('resize', () => position(p), options);
    window.visualViewport?.addEventListener('scroll', () => position(p), options);
    await load(p);
}

function registerCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qpp', returns: 'current persona name', helpString: 'Open the picker or switch by persona name.',
        unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'persona name', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })],
        namedArgumentList: [SlashCommandNamedArgument.fromProps({ name: 'lock', description: 'lock target after switching', typeList: [ARGUMENT_TYPE.STRING], enumList: scopes, isRequired: false })],
        callback: async (args, value) => {
            const name = String(value ?? '').trim().toLowerCase();
            if (!name) { await toggle(); return nameOf(user_avatar); }
            const id = Object.keys(power_user.personas ?? {}).find(id => nameOf(id).toLowerCase() === name);
            if (!id) { toastr.warning(t`Persona not found.`); return ''; }
            if (busy) return '';
            await change(async () => {
                await setUserAvatar(id);
                const scope = args?.lock;
                if (scopes.includes(scope) && availability()[scope] && !isPersonaLocked(scope)) await setPersonaLockState(true, scope);
            });
            return nameOf(id);
        },
    }));
}

jQuery(() => {
    const host = document.querySelector('#leftSendForm');
    if (!host || document.getElementById('quickPersona')) return;
    trigger = el('button'); trigger.type = 'button'; trigger.id = 'quickPersona';
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
    const img = el('img'); img.alt = ''; trigger.append(img); host.append(trigger);
    trigger.onclick = () => void toggle().catch(fail);
    const invalidate = () => { catalog = null; if (panel) void load(panel); sync(); };
    const handlers = new Map([
        ...['PERSONA_CREATED','PERSONA_UPDATED','PERSONA_RENAMED','PERSONA_DELETED'].map(key => [event_types[key], invalidate]),
        ...['PERSONA_CHANGED','CHAT_CHANGED','SETTINGS_UPDATED'].map(key => [event_types[key], sync]),
    ]);
    for (const [event, fn] of handlers) if (event) eventSource.on(event, fn);
    window.addEventListener('pagehide', event => {
        close();
        if (event.persisted) return;
        for (const [key, fn] of handlers) if (key) eventSource.removeListener(key, fn);
        trigger.remove();
    });
    sync(); registerCommand();
});
