/** The shape every form action returns, so forms can show success and failure the same way. */
export type ActionState = { status: "idle" | "ok" | "error"; message: string | null };
export const idleState: ActionState = { status: "idle", message: null };
export const failure = (message: string): ActionState => ({ status: "error", message });
export const success = (message: string): ActionState => ({ status: "ok", message });
