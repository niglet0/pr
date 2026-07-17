import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gitProxyRouter from "./git-proxy";
import fetchProxyRouter from "./fetch-proxy";
import sandboxRunnerRouter from "./sandbox-runner";
import ptyShellRouter from "./pty-shell";
import spqrRouter from "./spqr";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gitProxyRouter);
router.use(fetchProxyRouter);
router.use(sandboxRunnerRouter);
router.use(ptyShellRouter);
router.use(spqrRouter);

export default router;
