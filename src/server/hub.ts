// Fan-out de eventos em memória para SSE. Um processo só (dev/MVP).
// Com várias instâncias: trocar por LISTEN/NOTIFY do Postgres ou Redis pub/sub.
export type HubEvent = { kind: string; payload: Record<string, unknown> }
type Listener = (ev: HubEvent) => void

const g = globalThis as unknown as { __fzHub?: Map<string, Set<Listener>> }
const listeners: Map<string, Set<Listener>> = (g.__fzHub ??= new Map())

export function subscribe(userId: string, fn: Listener): () => void {
  let set = listeners.get(userId)
  if (!set) listeners.set(userId, (set = new Set()))
  set.add(fn)
  return () => {
    set!.delete(fn)
    if (set!.size === 0) listeners.delete(userId)
  }
}

export function publish(userId: string, ev: HubEvent) {
  listeners.get(userId)?.forEach((fn) => fn(ev))
}
