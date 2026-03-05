import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyLead } from '../src/services/classifier.js';
import { GoogleGenAI } from '@google/genai';

vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn(),
    Type: { OBJECT: 'object', STRING: 'string' }
}));

describe('classifyLead', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
        vi.clearAllMocks();
    });

    it('should return hot lead when model decides hot', async () => {
        const mockGenerateContent = vi.fn().mockResolvedValue({
            text: () => JSON.stringify({ temperature: 'hot', reason: 'Срочно просит встречу' })
        });

        GoogleGenAI.mockImplementation(function () {
            this.models = { generateContent: mockGenerateContent };
        });

        const result = await classifyLead('Хочу купить прямо сейчас', 'Срочный запрос');
        expect(result.temperature).toBe('hot');
        expect(result.reason).toBe('Срочно просит встречу');
    });

    it('should fallback to cold if model response is missing temperature', async () => {
        const mockGenerateContent = vi.fn().mockResolvedValue({
            text: () => JSON.stringify({ reason: 'Непонятно' })
        });
        GoogleGenAI.mockImplementation(function () {
            this.models = { generateContent: mockGenerateContent };
        });

        const result = await classifyLead('Ну, подумаю', 'Сомневается');
        expect(result.temperature).toBe('cold');
    });

    it('should throw if API key is missing', async () => {
        delete process.env.GEMINI_API_KEY;
        await expect(classifyLead('', '')).rejects.toThrow('GEMINI_API_KEY is required');
    });
});
