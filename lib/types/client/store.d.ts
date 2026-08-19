/**
 * Wall store: which instances are shown and the grid columns. The ports list
 * is the wall's whole business state — discovery writes it, removal filters
 * it, and the grid renders from it. Open/closed is NOT stored here: the wall
 * is a `conversation.view` ring entry, so the active view (chat store's
 * `view` field) decides whether it renders.
 */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client';
/** Wall viewing state: displayed ports and grid columns. */
export type WallState = {
    ports: number[];
    columns: string;
};
/** The wall store's complete write set. */
export type WallActions = {
    setPorts: (draft: WallState, ports: number[]) => void;
    addPort: (draft: WallState, port: number) => void;
    removePort: (draft: WallState, port: number) => void;
    setColumns: (draft: WallState, columns: string) => void;
};
/**
 * Create the wall store handle. Persisted under `dsh.multi-wall` so the port
 * set and column choice survive view switches and reloads.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export declare function createWallStore(): EngineStoreHandle<WallState, WallActions>;
//# sourceMappingURL=store.d.ts.map