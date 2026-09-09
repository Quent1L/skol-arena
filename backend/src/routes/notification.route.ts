import { z } from 'zod';
import { validate } from '../api/validator';
import { describe } from '../api/describe';
import { notificationService } from '../services/notification.service';
import {
  RegisterDeviceSchema,
  listNotificationsQuerySchema,
  paginatedNotificationsSchema,
  bulkNotificationResultSchema,
  PushDeviceSchema,
  mutationResultSchema,
} from '@skol-arena/shared';
import { requireAuth } from '../middleware/auth';
import { createAppHono } from '../types/hono';
import { logger } from '../utils/logger';

const app = createAppHono();

const TAGS = ['Notifications'];

app.get(
  '/me/notifications',
  requireAuth,
  describe({
    tags: TAGS,
    summary: "List the current user's notifications",
    description:
      'One page, newest first, walked with a keyset `cursor` rather than an offset: the ' +
      'feed moves under the reader as notifications arrive and are dismissed. Titles and ' +
      'messages are pre-rendered using Accept-Language; the raw keys and params are ' +
      'returned alongside so a client can render them itself. The unread count is ' +
      'aggregated over the whole feed, not over the page.',
    auth: true,
    success: { description: 'A page of notifications', schema: paginatedNotificationsSchema },
  }),
  validate('query', listNotificationsQuerySchema),
  async (c) => {
    const appUserId = c.get('appUserId');
    const lng = c.get('lang') || 'fr';
    const { limit, cursor } = c.req.valid('query');

    const page = await notificationService.getForUser(appUserId, lng, { limit, cursor });
    return c.json(page);
  }
);

app.post(
  '/me/notifications/read-all',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Mark every notification as read',
    description: 'A single statement over the whole feed, whatever its size.',
    auth: true,
    success: { description: 'How many were marked read', schema: bulkNotificationResultSchema },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');

    return c.json(await notificationService.markAllAsRead(appUserId));
  }
);

app.delete(
  '/me/notifications',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Delete every deletable notification',
    description:
      'Notifications still asking for something that is genuinely owed are left in ' +
      'place — the same rule the single delete applies — and counted as `kept`.',
    auth: true,
    success: { description: 'How many were deleted and kept', schema: bulkNotificationResultSchema },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');

    return c.json(await notificationService.deleteAllForUser(appUserId));
  }
);

app.post(
  '/me/notifications/:id/read',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Mark a notification as read',
    auth: true,
    notFound: true,
    success: { description: 'The notification was marked read', schema: mutationResultSchema },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');
    const id = c.req.param('id')!;

    await notificationService.markAsRead(id, appUserId);
    return c.json({ success: true });
  }
);

app.post(
  '/me/notifications/:id/action-completed',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Mark a notification’s action as completed',
    description: 'Applies to notifications whose requiresAction is true.',
    auth: true,
    notFound: true,
    success: { description: 'The action was marked completed', schema: mutationResultSchema },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');
    const id = c.req.param('id')!;

    await notificationService.markActionCompleted(id, appUserId);
    return c.json({ success: true });
  }
);

app.post(
  '/me/pushDevices',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Register a push subscription',
    description:
      'Locale and timezone are captured here because push payloads are rendered ' +
      'server-side while the device is offline.',
    auth: true,
    success: { description: 'The device was registered', schema: mutationResultSchema },
  }),
  validate('json', RegisterDeviceSchema),
  async (c) => {
    const appUserId = c.get('appUserId');
    const data = c.req.valid('json');

    logger.debug({ userId: appUserId }, '[PushDevice] Registration request for user:');
    logger.debug({ deviceType: data.deviceType }, '[PushDevice] Device type:');
    logger.debug({ endpoint: data.subscriptionEndpoint }, '[PushDevice] Endpoint:');
    logger.debug({ keys: Object.keys(data.subscriptionData || {}) }, '[PushDevice] Subscription keys:');

    await notificationService.registerPushDevice(appUserId, data);
    logger.debug('[PushDevice] Registration completed successfully');
    return c.json({ success: true });
  }
);

app.get(
  '/me/pushDevices',
  requireAuth,
  describe({
    tags: TAGS,
    summary: "List the current user's push devices",
    auth: true,
    success: { description: 'Active push subscriptions', schema: z.array(PushDeviceSchema) },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');

    const devices = await notificationService.getPushDevices(appUserId);
    return c.json(devices);
  }
);

app.delete(
  '/me/pushDevices/:id',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Remove a push device',
    auth: true,
    notFound: true,
    success: { description: 'Removal outcome', schema: mutationResultSchema },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');
    const id = c.req.param('id')!;

    await notificationService.removePushDevice(appUserId, id);
    return c.json({ success: true });
  }
);

app.delete(
  '/me/notifications/:id',
  requireAuth,
  describe({
    tags: TAGS,
    summary: 'Delete a notification',
    description:
      'Refused with 400 while the notification asks for an action that is still ' +
      'pending — once the situation is settled it is deletable like any other.',
    auth: true,
    notFound: true,
    success: { description: 'Deletion outcome', schema: mutationResultSchema },
  }),
  async (c) => {
    const appUserId = c.get('appUserId');
    const id = c.req.param('id')!;

    await notificationService.delete(id, appUserId);
    return c.json({ success: true });
  }
);

export default app;
