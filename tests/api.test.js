import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import apiRoutes from '../src/routes/api.routes.js';

// Setup basic express app for testing router
const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

// Error handling middleware for tests
app.use((err, req, res, next) => {
    console.log('Error caught by Express:', err.message, err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

describe('API Integration Tests', () => {
    const originalEnv = process.env;

    beforeAll(() => {
        process.env = { ...originalEnv, API_BEARER_TOKEN: 'test-secret' };
        vi.mock('../src/services/storage.js', () => ({
            listCalls: vi.fn().mockResolvedValue([]),
            getStats: vi.fn().mockResolvedValue({ total: 0 })
        }));
        vi.mock('../src/services/settings.js', () => ({
            loadSettings: vi.fn().mockResolvedValue({ systemPrompt: 'test' }),
            saveSettings: vi.fn()
        }));
    });

    describe('Authentication Middleware', () => {
        it('should block access to /api/calls without token', async () => {
            const res = await request(app).get('/api/calls');
            expect(res.status).toBe(401);
            expect(res.body.error).toContain('Unauthorized');
        });

        it('should block access to /api/calls with invalid token', async () => {
            const res = await request(app)
                .get('/api/calls')
                .set('Authorization', 'Bearer wrong-token');
            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Invalid API token');
        });

        it('should allow access to /api/calls with valid token', async () => {
            const res = await request(app)
                .get('/api/calls')
                .set('Authorization', 'Bearer test-secret');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('Zod Validation Middleware', () => {
        it('should block /api/calls with invalid limit (string instead of number)', async () => {
            const res = await request(app)
                .get('/api/calls?limit=abc')
                .set('Authorization', 'Bearer test-secret');

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
            expect(res.body.details[0].path).toBe('query.limit');
        });

        it('should block /api/settings with missing required update fields', async () => {
            const res = await request(app)
                .post('/api/settings')
                .set('Authorization', 'Bearer test-secret')
                .send({}); // Missing systemPrompt and firstMessage

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
            expect(res.body.details[0].message).toContain('At least one of');
        });
    });
});
