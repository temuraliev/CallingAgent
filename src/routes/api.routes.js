import { Router } from 'express';
import {
    getConfig,
    getSettings,
    updateSettings,
    getCalls,
    getStatsSummary,
    createOutboundCall,
    getBenchmarkResults,
    simulateInboundWebhook,
    simulateOutboundCall,
    syncCall
} from '../controllers/api.controller.js';
import {
    listScripts,
    createScript,
    deleteScript
} from '../controllers/scripts.controller.js';
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

router.post('/test/inbound', requireAuth, simulateInboundWebhook);
router.post('/test/outbound', requireAuth, simulateOutboundCall);
router.post('/sync-call', syncCall); // Internal sync for local dev (web call)

// Script Management
router.get('/scripts', requireAuth, listScripts);
router.post('/scripts', requireAuth, createScript);
router.delete('/scripts/:id', requireAuth, deleteScript);

export default router;
