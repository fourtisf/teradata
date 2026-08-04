/**
 * A one-line pub/sub so the nav's freshness indicator and the status strip
 * restamp themselves when a new entry lands in the feed.
 *
 * Deliberately not a context provider: the nav and the status strip are the
 * only subscribers, and wrapping the tree in a client provider would drag the
 * whole page out of server rendering for the sake of one counter.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Called by the feed when the stream delivers something. */
export function announceUpdate(): void {
  listeners.forEach((listener) => listener());
}

export function onUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
