import { en, zh } from "./locales.js";
import { createWallStore } from "./store.js";
import { createWallInjected } from "./wall-injected.js";
import { WallView } from "./WallView.js";
import { WallToggle } from "./WallToggle.js";
export { WallView } from "./WallView.js";
export { WallToggle } from "./WallToggle.js";
export { createWallStore } from "./store.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'multiWall';
/** Required services: slots for both registrations, locale for copy. */
export const inject = ['slots', 'locale'];
/**
 * Whether this page is an embedded wall pane. Panes load
 * `?multi-wall=embed`; such pages register no wall UI at all, which stops a
 * wall inside a wall (the pane would otherwise recursively embed the
 * serving instance).
 * @returns true when the query flag is present.
 */
function isEmbeddedPane() {
    return new URLSearchParams(window.location.search).has('multi-wall');
}
/**
 * Client plugin body: register the dictionaries, the view-ring entry (the
 * wall), and the sidebar footer shortcut. Embedded panes register nothing.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    if (isEmbeddedPane())
        return;
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-wall: dictionaries');
    // Registration-time text (the view tab label) reads through the bound
    // translate as a thunk, so it follows the active locale without
    // re-registration.
    const t = ctx.locale.bind(NS);
    // One wall store handle rides both registrations (ports, columns).
    const wallStore = createWallStore();
    // The wall itself: a 'conversation.view' ring entry. The header projects
    // the tab from the registration options; selecting it swaps the right
    // panel from the chat to the wall (official view-ring behavior).
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'multi-wall',
        order: 20,
        label: () => t('view.multiWall'),
        locale: NS,
        store: wallStore,
        inject: () => createWallInjected(),
    }, WallView));
    // The sidebar footer shortcut: jumps to the wall view. It owns no state —
    // the view ring decides what renders — so it is a plain action row.
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'multi-wall',
        order: 10,
        locale: NS,
    }, WallToggle));
}
//# sourceMappingURL=index.js.map