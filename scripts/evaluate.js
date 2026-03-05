#!/usr/bin/env node
/**
 * evaluate.js — Benchmark evaluation script for the lead classifier.
 *
 * Usage:
 *   node scripts/evaluate.js [options]
 *
 * Options:
 *   --limit=N      Only run first N examples (default: all)
 *   --concurrency=N  Parallel requests (default: 3)
 *   --output=FILE  Save JSON results to file (default: benchmark/results.json)
 *   --quick        Run only 10 examples for a quick smoke test
 *   --verbose      Print each prediction as it happens
 *
 * Example:
 *   node scripts/evaluate.js --limit=20 --verbose
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
    try {
        const env = readFileSync(join(ROOT, '.env'), 'utf8');
        for (const line of env.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) process.env[key] = val;
        }
    } catch (_) {
        console.warn('⚠️  No .env file found, using existing environment variables.');
    }
}
loadEnv();

// ── Parse Args ───────────────────────────────────────────────────────────────
const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const [k, v] = a.replace('--', '').split('=');
        return [k, v ?? true];
    })
);

const LIMIT = args.quick ? 10 : (args.limit ? parseInt(args.limit) : Infinity);
const CONCURRENCY = parseInt(args.concurrency ?? '1'); // default 1 to respect free-tier 5 RPM
const OUTPUT_FILE = args.output ?? join(ROOT, 'benchmark', 'results.json');
const VERBOSE = !!args.verbose;

// ── Import Classifier ────────────────────────────────────────────────────────
let classifyLead;
try {
    ({ classifyLead } = await import('../src/services/classifier.js'));
} catch (e) {
    console.error('❌ Failed to import classifier:', e.message);
    process.exit(1);
}

// ── Load Dataset ──────────────────────────────────────────────────────────────
const dataset = JSON.parse(readFileSync(join(ROOT, 'benchmark', 'dataset.json'), 'utf8'));
const examples = dataset.examples.slice(0, LIMIT);

const LABELS = ['cold', 'warm', 'hot'];
const LABEL_COLORS = { hot: '\x1b[31m', warm: '\x1b[33m', cold: '\x1b[34m' };
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function colorLabel(label) {
    return `${LABEL_COLORS[label] ?? ''}${label}${RESET}`;
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function classifyWithRetry(transcript, summary, maxRetries = 4) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await classifyLead(transcript, summary);
        } catch (err) {
            const is429 = err?.status === 429 ||
                (err?.message && err.message.includes('429')) ||
                (err?.message && err.message.includes('RESOURCE_EXHAUSTED'));

            if (is429 && attempt < maxRetries) {
                // Parse retryDelay from error message if available, otherwise backoff
                const match = err.message?.match(/retryDelay[":\s]+"?(\d+)/);
                const waitMs = match ? (parseInt(match[1]) + 2) * 1000 : (15 + attempt * 10) * 1000;
                if (VERBOSE) {
                    process.stdout.write(`\n  ⏳ Rate limit — waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${maxRetries}...\n`);
                }
                await sleep(waitMs);
                continue;
            }
            throw err;
        }
    }
}

// ── Run Evaluation ────────────────────────────────────────────────────────────
console.log(`\n${BOLD}🏆 CallFlow Benchmark Evaluation${RESET}`);
console.log(`${DIM}Dataset: ${dataset.meta.description}${RESET}`);
console.log(`${DIM}Running ${examples.length} examples (concurrency=${CONCURRENCY})...${RESET}\n`);

const results = [];
let correct = 0;
let errors = 0;

// Confusion matrix: confMatrix[expected][predicted]
const confMatrix = {};
for (const e of LABELS) {
    confMatrix[e] = {};
    for (const p of LABELS) confMatrix[e][p] = 0;
}

// Per-category accuracy
const categoryStats = {};

// Runner with controlled concurrency
async function runBatch(items) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        while (queue.length > 0) {
            const example = queue.shift();
            if (!example) break;
            await runExample(example);
        }
    });
    await Promise.all(workers);
}

async function runExample(example) {
    const startMs = Date.now();
    let predicted = null;
    let reason = null;
    let error = null;

    try {
        const res = await classifyWithRetry(example.transcript, example.summary);
        predicted = res.temperature;
        reason = res.reason;
    } catch (e) {
        error = e.message?.slice(0, 120);
        errors++;
    }

    const latencyMs = Date.now() - startMs;
    const isCorrect = predicted === example.expected;

    if (predicted && !error) {
        if (isCorrect) correct++;
        confMatrix[example.expected][predicted]++;

        const cat = example.category || 'unknown';
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, correct: 0 };
        categoryStats[cat].total++;
        if (isCorrect) categoryStats[cat].correct++;
    }

    const result = {
        id: example.id,
        expected: example.expected,
        predicted,
        correct: isCorrect && !error,
        latencyMs,
        reason,
        error,
        category: example.category,
    };
    results.push(result);

    if (VERBOSE) {
        const icon = error ? '\uD83D\uDCA2' : isCorrect ? '\u2705' : '\u274C';
        const predStr = predicted ? colorLabel(predicted) : RED + 'ERROR' + RESET;
        const expStr = colorLabel(example.expected);
        console.log(
            `  ${icon} #${String(example.id).padStart(2)} [${example.category.padEnd(24)}] ` +
            `expected=${expStr.padEnd(14)} predicted=${predStr.padEnd(14)} ` +
            `${DIM}${latencyMs}ms${RESET}` +
            (error ? `  ${RED}${error}${RESET}` : '')
        );
    } else {
        const dots = results.length % 10 === 0 ? `${results.length}/${examples.length}\n` : '.';
        process.stdout.write(dots);
    }

    // Polite delay between requests when running sequentially (free tier: 5 RPM)
    if (CONCURRENCY === 1 && results.length < examples.length) {
        await sleep(12_000); // ~5 req/min safe margin
    }
}

// ── Execute ───────────────────────────────────────────────────────────────────
const startTotal = Date.now();
await runBatch(examples);
const totalMs = Date.now() - startTotal;

// ── Metrics ───────────────────────────────────────────────────────────────────
const evaluated = results.filter(r => !r.error);
const accuracy = evaluated.length > 0 ? (correct / evaluated.length) * 100 : 0;
const avgLatency = evaluated.length > 0
    ? Math.round(evaluated.reduce((s, r) => s + r.latencyMs, 0) / evaluated.length)
    : 0;

// Per-label precision, recall, F1
const perLabel = {};
for (const label of LABELS) {
    const tp = confMatrix[label][label];
    const fp = LABELS.reduce((s, e) => s + (e !== label ? confMatrix[e][label] : 0), 0);
    const fn = LABELS.reduce((s, p) => s + (p !== label ? confMatrix[label][p] : 0), 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    perLabel[label] = { tp, fp, fn, precision, recall, f1 };
}

// Macro F1
const macroF1 = LABELS.reduce((s, l) => s + perLabel[l].f1, 0) / LABELS.length;

// ── Print Report ──────────────────────────────────────────────────────────────
if (!VERBOSE) console.log('\n');

console.log(`${BOLD}━━━━━━━━━━ RESULTS ━━━━━━━━━━${RESET}`);
console.log(`Evaluated : ${evaluated.length} / ${examples.length}  (${errors} errors)`);
console.log(`Correct   : ${correct}`);
console.log(`${BOLD}Accuracy  : ${accuracy >= 80 ? GREEN : RED}${accuracy.toFixed(1)}%${RESET}`);
console.log(`Macro F1  : ${(macroF1 * 100).toFixed(1)}%`);
console.log(`Avg latency: ${avgLatency}ms   Total: ${(totalMs / 1000).toFixed(1)}s`);

console.log(`\n${BOLD}── Per-Label Metrics ──${RESET}`);
console.log('Label      Precision  Recall   F1      Count');
for (const label of LABELS) {
    const m = perLabel[label];
    const total = m.tp + m.fn;
    console.log(
        `${colorLabel(label).padEnd(14)}  ` +
        `${(m.precision * 100).toFixed(1).padStart(6)}%   ` +
        `${(m.recall * 100).toFixed(1).padStart(6)}%  ` +
        `${(m.f1 * 100).toFixed(1).padStart(6)}%   ${total}`
    );
}

console.log(`\n${BOLD}── Confusion Matrix ──${RESET}`);
console.log(`           ${LABELS.map(l => l.padEnd(8)).join(' ')}`);
for (const exp of LABELS) {
    const row = LABELS.map(pred => {
        const val = confMatrix[exp][pred];
        const isD = exp === pred;
        return (isD ? GREEN : '') + String(val).padEnd(8) + (isD ? RESET : '');
    }).join(' ');
    console.log(`${colorLabel(exp).padEnd(14)} ${row}`);
}

// Per-category breakdown
const worstCats = Object.entries(categoryStats)
    .filter(([, s]) => s.total > 0)
    .map(([cat, s]) => ({ cat, acc: s.correct / s.total, ...s }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 5);

if (worstCats.length > 0) {
    console.log(`\n${BOLD}── Worst Categories ──${RESET}`);
    for (const { cat, acc, correct: c, total } of worstCats) {
        const pct = (acc * 100).toFixed(0);
        const bar = '█'.repeat(Math.round(acc * 10)) + '░'.repeat(10 - Math.round(acc * 10));
        console.log(`  ${cat.padEnd(26)} ${bar} ${pct}% (${c}/${total})`);
    }
}

// ── Save Results ──────────────────────────────────────────────────────────────
const output = {
    meta: {
        runAt: new Date().toISOString(),
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        total: examples.length,
        evaluated: evaluated.length,
        errors,
    },
    summary: {
        accuracy: parseFloat(accuracy.toFixed(2)),
        macroF1: parseFloat((macroF1 * 100).toFixed(2)),
        avgLatencyMs: avgLatency,
        totalMs,
    },
    perLabel,
    confusionMatrix: confMatrix,
    categoryStats,
    examples: results,
};

try {
    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n${DIM}Results saved → ${OUTPUT_FILE}${RESET}`);
} catch (e) {
    console.warn(`⚠️  Could not save results: ${e.message}`);
}

console.log(`\n${accuracy >= 80 ? GREEN + '✅ PASS' : RED + '⚠️  NEEDS IMPROVEMENT'}${RESET}\n`);

process.exit(accuracy < 50 ? 1 : 0);
