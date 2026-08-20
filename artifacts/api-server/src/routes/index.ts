import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import vmsRouter from "./vms";
import sshKeysRouter from "./ssh_keys";
import imagesRouter from "./images";
import billingRouter from "./billing";
import agentStatusRouter from "./agent_status";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agentStatusRouter);
router.use(vmsRouter);
router.use(sshKeysRouter);
router.use(imagesRouter);
router.use(billingRouter);

export default router;
