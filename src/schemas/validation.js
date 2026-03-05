import { z } from 'zod';

export const updateSettingsSchema = z.object({
    body: z.object({
        systemPrompt: z.string().optional(),
        firstMessage: z.string().optional(),
    }).refine(data => data.systemPrompt !== undefined || data.firstMessage !== undefined, {
        message: "At least one of 'systemPrompt' or 'firstMessage' must be provided"
    })
});

export const createOutboundCallSchema = z.object({
    body: z.object({
        phoneNumber: z.string().min(1, "Phone number is required"),
        customerName: z.string().optional(),
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
        message: z.object({
            type: z.string(),
            call: z.any().optional(),
            summary: z.string().optional(),
            artifact: z.any().optional(),
            transcript: z.string().optional(),
            duration: z.number().optional()
        }).passthrough()
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
