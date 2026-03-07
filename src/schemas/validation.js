import { z } from 'zod';

const MAX_PROMPT_LENGTH = 50000;
const MAX_FIRST_MESSAGE_LENGTH = 5000;

export const updateSettingsSchema = z.object({
    body: z.object({
        systemPrompt: z.string().max(MAX_PROMPT_LENGTH, 'systemPrompt too long').optional(),
        firstMessage: z.string().max(MAX_FIRST_MESSAGE_LENGTH, 'firstMessage too long').optional(),
    }).refine(data => data.systemPrompt !== undefined || data.firstMessage !== undefined, {
        message: "At least one of 'systemPrompt' or 'firstMessage' must be provided"
    })
});

export const createOutboundCallSchema = z.object({
    body: z.object({
        phoneNumber: z.string().min(1, "Phone number is required").max(30, "Phone number too long"),
        customerName: z.string().max(255).optional(),
        assistantId: z.string().optional(),
        scriptId: z.union([z.string(), z.number()]).optional(),
    })
});

export const listCallsSchema = z.object({
    query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.enum(['cold', 'warm', 'hot']).optional(),
        type: z.enum(['inbound', 'outbound']).optional(),
        durationMin: z.string().regex(/^\d+$/).transform(Number).optional(),
        durationMax: z.string().regex(/^\d+$/).transform(Number).optional(),
        phone: z.string().optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).optional(),
        offset: z.string().regex(/^\d+$/).transform(Number).optional(),
    })
});

export const getStatsSchema = z.object({
    query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
    })
});

export const vapiWebhookSchema = z.object({
    body: z.object({
        type: z.string().optional(),
        call: z.any().optional(),
        summary: z.any().optional(),
        artifact: z.any().optional(),
        transcript: z.any().optional(),
        duration: z.any().optional(),
        message: z.object({
            type: z.string(),
            call: z.any().optional(),
            summary: z.string().optional(),
            artifact: z.any().optional(),
            transcript: z.string().optional(),
            duration: z.number().optional()
        }).passthrough().optional()
    }).passthrough().transform((b) => {
        const message = (b.message && b.message.type) ? b.message : (b.type === 'end-of-call-report' ? b : b);
        return {
            ...b,
            message: {
                ...message,
                artifact: message.artifact ?? b.artifact,
                summary: message.summary ?? b.summary,
                call: message.call ?? b.call,
            }
        };
    })
});

export const createScriptSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').max(255),
        description: z.string().max(2000).optional(),
        firstMessage: z.string().max(MAX_FIRST_MESSAGE_LENGTH).optional(),
        systemPrompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
        isActive: z.boolean().optional(),
    })
});

export const updateScriptSchema = z.object({
    params: z.object({ id: z.string() }),
    body: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        firstMessage: z.string().max(MAX_FIRST_MESSAGE_LENGTH).optional(),
        systemPrompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
        isActive: z.boolean().optional(),
    })
});

export const updateCallSchema = z.object({
    params: z.object({ callId: z.string().min(1) }),
    body: z.object({
        leadTemperature: z.enum(['cold', 'warm', 'hot']).optional(),
        classificationReason: z.string().optional(),
        notes: z.string().max(10000).optional(),
    }).refine(data => data.leadTemperature !== undefined || data.classificationReason !== undefined || data.notes !== undefined, {
        message: "Provide at least one of 'leadTemperature', 'classificationReason', or 'notes'"
    })
});

export const leadClassificationSchema = z.object({
    body: z.object({
        phone: z.string().min(1, "Phone number is required"),
        name: z.string().optional(),
        interestLevel: z.string().optional(),
        notes: z.string().optional(),
        interestedActivities: z.array(z.string()).optional(),
        wantsCallback: z.boolean().optional()
    })
});
