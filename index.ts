import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import ttsRouter from "./tts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(ttsRouter);

export default router;
