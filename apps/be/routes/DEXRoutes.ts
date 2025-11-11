import { Router } from 'express';
import DEXController from '../controllers/DEXController';

const router = Router();

router.get('/networks', DEXController.getNetworks);
router.get('/list', DEXController.getDexes);
router.get('/pools', DEXController.getPools); 
export default router;
