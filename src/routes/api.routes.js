import { Router } from 'express';
import {
    getConfig,
    getSettings,
    updateSettings,
    getCalls,
    updateCallById,
    syncCallToCrm,
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
    updateScript,
    deleteScript,
    applyScript
} from '../controllers/scripts.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
    updateSettingsSchema,
    listCallsSchema,
    getStatsSchema,
    createOutboundCallSchema,
    updateCallSchema,
    createScriptSchema,
    updateScriptSchema
} from '../schemas/validation.js';

const router = Router();

router.get('/config', getConfig);
router.get('/settings', requireAuth, getSettings);
router.post('/settings', requireAuth, validate(updateSettingsSchema), updateSettings);
router.get('/calls', requireAuth, validate(listCallsSchema), getCalls);
router.patch('/calls/:callId', requireAuth, validate(updateCallSchema), updateCallById);
router.post('/calls/:callId/sync-crm', requireAuth, syncCallToCrm);
router.get('/stats', requireAuth, validate(getStatsSchema), getStatsSummary);
router.post('/calls/outbound', requireAuth, validate(createOutboundCallSchema), createOutboundCall);
router.get('/benchmark', requireAuth, getBenchmarkResults);

router.post('/test/inbound', requireAuth, simulateInboundWebhook);
router.post('/test/outbound', requireAuth, simulateOutboundCall);
router.post('/sync-call', syncCall); // Internal sync for local dev (web call)

// Script Management
router.get('/scripts', requireAuth, listScripts);
router.post('/scripts', requireAuth, validate(createScriptSchema), createScript);
router.patch('/scripts/:id', requireAuth, validate(updateScriptSchema), updateScript);
router.delete('/scripts/:id', requireAuth, deleteScript);
router.post('/scripts/:id/apply', requireAuth, applyScript);

export default router;
