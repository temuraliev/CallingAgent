import { Router } from 'express';
import {
    getConfig,
    getSettings,
    updateSettings,
    getCalls,
    getStatsSummary,
    createOutboundCall,
    getBenchmarkResults
} from '../controllers/api.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
    updateSettingsSchema,
    listCallsSchema,
    getStatsSchema,
    createOutboundCallSchema
} from '../schemas/validation.js';

const router = Router();

router.get('/config', getConfig);
router.get('/settings', requireAuth, getSettings);
router.post('/settings', requireAuth, validate(updateSettingsSchema), updateSettings);
router.get('/calls', requireAuth, validate(listCallsSchema), getCalls);
router.get('/stats', requireAuth, validate(getStatsSchema), getStatsSummary);
router.post('/calls/outbound', requireAuth, validate(createOutboundCallSchema), createOutboundCall);
router.get('/benchmark', requireAuth, getBenchmarkResults);

export default router;
