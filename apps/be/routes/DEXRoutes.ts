import { Router } from 'express';
import DEXController from '../controllers/DEXController';

const router = Router();

router.get('/networks', DEXController.getNetworks);
router.get('/list', DEXController.getDexes);

export default router;
