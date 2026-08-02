import { Injectable, Logger } from '@nestjs/common';
import {
  initializeApp,
  cert,
  getApps,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushGateway, PushPayload } from './push-gateway.interface';

/**
 * No Firebase project is configured until FIREBASE_SERVICE_ACCOUNT_JSON is
 * set — until then this gateway logs once and no-ops on every send, so the
 * rest of the app (device-token registration, the DB Notification row)
 * keeps working normally while push delivery itself is simply disabled.
 */
@Injectable()
export class FirebasePushGateway implements PushGateway {
  private readonly logger = new Logger(FirebasePushGateway.name);
  private app?: App;

  constructor() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not set — push notifications are disabled (device tokens still register normally).',
      );
      return;
    }
    // In `nest start --watch`, this constructor reruns on every hot reload,
    // but the Admin SDK's app registry is a module-level singleton that
    // outlives Nest's application-context recreation within the same
    // process — reuse the existing app instead of re-initializing into it.
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.app = existingApps[0];
      return;
    }
    try {
      const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      this.app = initializeApp({ credential: cert(serviceAccount) });
    } catch (e) {
      this.logger.error(
        `Failed to initialize Firebase Admin SDK — push notifications are disabled: ${(e as Error).message}`,
      );
    }
  }

  async send(tokens: string[], payload: PushPayload): Promise<void> {
    if (!this.app || tokens.length === 0) return;

    const response = await getMessaging(this.app).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });

    if (response.failureCount > 0) {
      const failures = response.responses
        .map((r, i) => (r.success ? null : `${tokens[i]}: ${r.error?.code ?? 'unknown'} — ${r.error?.message ?? 'no message'}`))
        .filter((t): t is string => t !== null);
      this.logger.warn(`${response.failureCount}/${tokens.length} push sends failed:\n${failures.join('\n')}`);
    }
  }
}
