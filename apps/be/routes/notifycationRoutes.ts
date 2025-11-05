import express from 'express';
import { NotificationsController } from '../controllers/NotificationController';
import { requireAuth } from '../middlewares/requireAuth';

const router = express.Router();
const notificationsController = new NotificationsController();

router.post('/toggle', requireAuth, notificationsController.toggleNotifications);
router.get('/status', requireAuth, notificationsController.getStatus);
export default router;
