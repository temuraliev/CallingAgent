import { Router } from 'express';
import { handleVapiWebhook, handleLeadClassification } from '../controllers/webhook.controller.js';
import { handleYandexTtsWebhook } from '../controllers/tts.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { vapiWebhookSchema, leadClassificationSchema } from '../schemas/validation.js';

const router = Router();

router.post('/vapi', validate(vapiWebhookSchema), handleVapiWebhook);
router.post('/lead-classification', validate(leadClassificationSchema), handleLeadClassification);
router.post('/yandex-tts', handleYandexTtsWebhook);

export default router;
