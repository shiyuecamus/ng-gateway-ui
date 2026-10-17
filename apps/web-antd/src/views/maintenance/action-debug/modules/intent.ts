/** An authenticated client intent retains the original request until explicitly replaced. */
export interface ControlIntent<T> {
  idempotencyKey: string;
  request: T;
}

/** A locally retained request can be found even if its current configuration is unavailable. */
export interface StoredControlIntent extends ControlIntent<unknown> {
  target: string;
}

function storageKey(principal: string, target: string) {
  if (!principal || !target)
    throw new Error('Authenticated control identity is required');
  return `ng-control-intent:${JSON.stringify([principal, 'control', target])}`;
}

function decodeIntent<T>(stored: string): ControlIntent<T> {
  const intent = JSON.parse(stored) as ControlIntent<T>;
  if (
    !/^[\da-f]{32}$/.test(intent.idempotencyKey) ||
    !Object.hasOwn(intent, 'request')
  ) {
    throw new Error('Stored control intent is invalid');
  }
  return intent;
}

/** Read-only recovery never creates a key or rewrites the original request. */
export function loadControlIntent<T>(
  principal: string,
  target: string,
): ControlIntent<T> | undefined {
  const stored = sessionStorage.getItem(storageKey(principal, target));
  return stored ? decodeIntent<T>(stored) : undefined;
}

/** Only the current authenticated principal's retained identities are listed. */
export function listControlIntents(principal: string): StoredControlIntent[] {
  if (!principal) return [];
  const intents: StoredControlIntent[] = [];
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith('ng-control-intent:')) continue;
    const identity: unknown = JSON.parse(
      key.slice('ng-control-intent:'.length),
    );
    if (
      !Array.isArray(identity) ||
      identity.length !== 3 ||
      identity[0] !== principal ||
      identity[1] !== 'control' ||
      typeof identity[2] !== 'string'
    )
      continue;
    const intent = loadControlIntent<unknown>(principal, identity[2]);
    if (intent) intents.push({ ...intent, target: identity[2] });
  }
  return intents;
}

/** One 128-bit business identity uses Web Crypto in both HTTP and HTTPS management. */
export function generateControlIdempotencyKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

/** Reloading a form or receiving a new configuration revision never rewrites a pending intent. */
export function prepareControlIntent<T>(
  principal: string,
  target: string,
  request: T,
): ControlIntent<T> {
  const key = storageKey(principal, target);
  const stored = loadControlIntent<T>(principal, target);
  if (stored) return stored;
  const idempotencyKey = generateControlIdempotencyKey();
  const encoded = JSON.stringify({ idempotencyKey, request });
  sessionStorage.setItem(key, encoded);
  return JSON.parse(encoded) as ControlIntent<T>;
}

/** Replacing an intent is an explicit user action, scoped to the current authenticated principal. */
export function resetControlIntent(principal: string, target: string) {
  sessionStorage.removeItem(storageKey(principal, target));
}
