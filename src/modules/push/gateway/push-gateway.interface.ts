export const PUSH_GATEWAY = Symbol('PUSH_GATEWAY');

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Shape a real FCM sender offers — one call, many tokens. Swap
 * FirebasePushGateway for a different implementation behind this interface;
 * nothing else needs to change.
 */
export interface PushGateway {
  send(tokens: string[], payload: PushPayload): Promise<void>;
}
