import { Router } from "express";
import { getCexList } from "../controllers/CEXController";
const router = Router();

router.get("/cex", getCexList); 

export default router;
