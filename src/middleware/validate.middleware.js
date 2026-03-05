import { z } from 'zod';

/**
 * Express middleware to validate request data against a Zod schema.
 * @param {z.ZodSchema} schema - The Zod schema to validate against (can contain body, query, params)
 */
export const validate = (schema) => (req, res, next) => {
    try {
        const result = schema.safeParse({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        if (!result.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: result.error.issues.map(err => ({
                    path: err.path.join('.'),
                    message: err.message
                }))
            });
        }

        next();
    } catch (error) {
        next(error);
    }
};
