import express from 'express';
import { NotificationsController } from '../controllers/NotificationController';
import { requireAuth } from '../middlewares/requireAuth';
import { requireCronKey } from '../middlewares/requireCronkey';

const router = express.Router();
const notificationsController = new NotificationsController();

router.post('/toggle', requireAuth, notificationsController.toggleNotifications);

router.get('/status', requireAuth, notificationsController.getStatus);

router.post('/send-notifications',requireCronKey, notificationsController.sendNotifications);

export default router;
