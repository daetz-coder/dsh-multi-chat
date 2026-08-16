import { en, zh } from "./locales.js";
import { createWallStore } from "./store.js";
import { createWallInjected } from "./wall-injected.js";
import { WallOverlay } from "./WallOverlay.js";
import { WallToggle } from "./WallToggle.js";
export { WallOverlay } from "./WallOverlay.js";
export { WallToggle } from "./WallToggle.js";
export { createWallStore } from "./store.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'multiWall';
/** Required services: slots for both registrations, locale for copy. */
export const inject = ['slots', 'locale'];
/**
 * Client plugin body: register the dictionaries and the two additive entries.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-wall: dictionaries');
    // One wall store handle rides both registrations (open flag, ports, columns).
    const wallStore = createWallStore();
    // The wall overlay entry: full-screen, additive, click-through layer opt-in.
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'multi-wall',
        order: 10,
        locale: NS,
        store: wallStore,
        inject: () => createWallInjected(),
    }, WallOverlay));
    // The sidebar footer toggle row, above Settings in both widths.
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'multi-wall',
        order: 10,
        locale: NS,
        store: wallStore,
    }, WallToggle));
}
//# sourceMappingURL=index.js.map