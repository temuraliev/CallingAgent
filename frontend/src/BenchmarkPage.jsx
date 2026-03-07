import React, { useState, useEffect } from 'react';
import {
    Target, RefreshCw, AlertCircle, CheckCircle2, XCircle,
    TrendingUp, Clock, BarChart3, Zap, ChevronDown, ChevronUp,
    Play, ChevronRight
} from 'lucide-react';

const API_BASE = '/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v) { return typeof v === 'number' ? v.toFixed(1) + '%' : '—'; }

function formatDuration(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    if (min > 0) return `${min} мин ${s} с`;
    return `${s} с`;
}

function GaugeRing({ value, size = 80, label }) {
    const r = (size - 12) / 2;
    const circ = 2 * Math.PI * r;
    const filled = Math.max(0, Math.min(1, value / 100)) * circ;
    const color = value >= 80 ? '#22c55e' : value >= 60 ? '#f59e0b' : '#f43f5e';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
                <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke={color} strokeWidth={10}
                    strokeDasharray={`${filled} ${circ - filled}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
                <text
                    x={size / 2} y={size / 2 + 5}
                    textAnchor="middle"
                    style={{ fontSize: 15, fontWeight: 700, fill: color, transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
                >
                    {value != null ? value.toFixed(0) + '%' : '—'}
                </text>
            </svg>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
        </div>
    );
}

function ConfusionMatrix({ matrix }) {
    const labels = ['cold', 'warm', 'hot'];
    const totals = labels.map(exp => labels.reduce((s, p) => s + (matrix?.[exp]?.[p] ?? 0), 0));
    const maxVal = Math.max(...labels.flatMap(e => labels.map(p => matrix?.[e]?.[p] ?? 0)));

    return (
        <div className="bench-confusion">
            <div className="bench-cm-grid">
                {/* header row */}
                <div className="bench-cm-corner">actual ↓ / pred →</div>
                {labels.map(l => (
                    <div key={l} className={`bench-cm-header bench-cm-header--${l}`}>{l}</div>
                ))}
                {/* data rows */}
                {labels.map((exp, ei) => (
                    <React.Fragment key={exp}>
                        <div className={`bench-cm-label bench-cm-label--${exp}`}>{exp}</div>
                        {labels.map(pred => {
                            const val = matrix?.[exp]?.[pred] ?? 0;
                            const isDiag = exp === pred;
                            const intensity = maxVal > 0 ? val / maxVal : 0;
                            return (
                                <div
                                    key={pred}
                                    className={`bench-cm-cell ${isDiag ? 'bench-cm-cell--diag' : ''}`}
                                    style={{ '--intensity': intensity }}
                                >
                                    <span className="bench-cm-val">{val}</span>
                                    {totals[ei] > 0 && (
                                        <span className="bench-cm-pct">{Math.round(val / totals[ei] * 100)}%</span>
                                    )}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

function PerLabelTable({ perLabel }) {
    if (!perLabel) return null;
    const labels = ['hot', 'warm', 'cold'];

    return (
        <div className="table-wrap">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Класс</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1</th>
                        <th>TP</th>
                        <th>FP</th>
                        <th>FN</th>
                    </tr>
                </thead>
                <tbody>
                    {labels.map(label => {
                        const m = perLabel[label] || {};
                        const f1pct = ((m.f1 || 0) * 100);
                        return (
                            <tr key={label} className="table-row">
                                <td>
                                    <span className={`badge badge--${label}`}>{label}</span>
                                </td>
                                <td className="td-muted">{pct((m.precision || 0) * 100)}</td>
                                <td className="td-muted">{pct((m.recall || 0) * 100)}</td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, height: 4, background: 'var(--bg-4)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ width: `${f1pct}%`, height: '100%', background: f1pct >= 80 ? 'var(--green)' : f1pct >= 60 ? 'var(--amber)' : 'var(--rose)', borderRadius: 4, transition: 'width 0.6s ease' }} />
                                        </div>
                                        <span style={{ fontSize: 12, color: 'var(--text-2)', width: 38 }}>{pct(f1pct)}</span>
                                    </div>
                                </td>
                                <td className="td-muted">{m.tp ?? '—'}</td>
                                <td className="td-muted">{m.fp ?? '—'}</td>
                                <td className="td-muted">{m.fn ?? '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function WorstCategoriesBlock({ worstCategories }) {
    if (!worstCategories?.length) return null;
    return (
        <div className="section">
            <div className="section-header">
                <h2 className="section-title">Слабые места</h2>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Категории с наименьшей точностью</span>
            </div>
            <div className="bench-summary" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                {worstCategories.slice(0, 8).map(({ category, accuracy, correct, total }) => (
                    <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-2)' }}>{category}</span>
                            <span style={{ color: 'var(--text)' }}>{correct}/{total} · {pct(accuracy)}</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--bg-4)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                                style={{
                                    width: `${accuracy}%`,
                                    height: '100%',
                                    background: accuracy >= 80 ? 'var(--green)' : accuracy >= 60 ? 'var(--amber)' : 'var(--rose)',
                                    borderRadius: 3,
                                    transition: 'width 0.4s ease',
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CategoryStatsTable({ categoryStats }) {
    if (!categoryStats || typeof categoryStats !== 'object') return null;
    const entries = Object.entries(categoryStats)
        .filter(([, s]) => s.total > 0)
        .map(([cat, s]) => ({ category: cat, accuracy: (s.correct / s.total) * 100, correct: s.correct, total: s.total }))
        .sort((a, b) => a.accuracy - b.accuracy);
    if (entries.length === 0) return null;
    return (
        <div className="section">
            <div className="section-header">
                <h2 className="section-title">Точность по категориям</h2>
            </div>
            <div className="table-wrap">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Категория</th>
                            <th>Точность</th>
                            <th>Правильно</th>
                            <th>Всего</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map(({ category, accuracy, correct, total }) => (
                            <tr key={category} className="table-row">
                                <td style={{ fontSize: 12 }}>{category}</td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, maxWidth: 120, height: 6, background: 'var(--bg-4)', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ width: `${accuracy}%`, height: '100%', background: accuracy >= 80 ? 'var(--green)' : accuracy >= 60 ? 'var(--amber)' : 'var(--rose)', borderRadius: 3 }} />
                                        </div>
                                        <span className="td-muted">{pct(accuracy)}</span>
                                    </div>
                                </td>
                                <td className="td-muted">{correct}</td>
                                <td className="td-muted">{total}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ExamplesTable({ examples }) {
    const [show, setShow] = useState(false);
    const [filter, setFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);

    const filtered = examples.filter(e => {
        if (filter === 'wrong') return !e.correct && !e.error;
        if (filter === 'error') return !!e.error;
        return true;
    });

    return (
        <div className="bench-examples">
            <div className="bench-examples-header">
                <button className="bench-toggle" onClick={() => setShow(s => !s)}>
                    {show ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>Детали по примерам ({examples.length})</span>
                </button>
                {show && (
                    <div className="filter-tabs" style={{ marginLeft: 'auto' }}>
                        {['all', 'wrong', 'error'].map(f => (
                            <button key={f} className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
                                {f === 'all' ? 'Все' : f === 'wrong' ? 'Ошибки' : 'Сбои'}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {show && (
                <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 32 }}></th>
                                <th>#</th>
                                <th>Категория</th>
                                <th>Ожидалось</th>
                                <th>Предсказано</th>
                                <th>Latency</th>
                                <th>Причина</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(ex => (
                                <React.Fragment key={ex.id}>
                                    <tr
                                        className="table-row"
                                        onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td style={{ padding: '8px 4px' }}>
                                            <ChevronRight
                                                size={14}
                                                style={{
                                                    color: 'var(--text-3)',
                                                    transform: expandedId === ex.id ? 'rotate(90deg)' : 'none',
                                                    transition: 'transform 0.15s',
                                                }}
                                            />
                                        </td>
                                        <td className="td-muted">{ex.id}</td>
                                        <td className="td-muted" style={{ fontSize: 11 }}>{ex.category}</td>
                                        <td><span className={`badge badge--${ex.expected}`}>{ex.expected}</span></td>
                                        <td>
                                            {ex.error ? (
                                                <span style={{ fontSize: 11, color: 'var(--rose)' }}>ERROR</span>
                                            ) : (
                                                <span className={`badge badge--${ex.predicted}`} style={!ex.correct ? { boxShadow: '0 0 0 1px var(--rose)' } : {}}>
                                                    {ex.predicted}
                                                    {!ex.correct && <XCircle size={10} style={{ marginLeft: 3 }} />}
                                                    {ex.correct && <CheckCircle2 size={10} style={{ marginLeft: 3 }} />}
                                                </span>
                                            )}
                                        </td>
                                        <td className="td-muted" style={{ fontSize: 11 }}>{ex.latencyMs}ms</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ex.error || ex.reason || '—'}
                                        </td>
                                    </tr>
                                    {expandedId === ex.id && (
                                        <tr key={`${ex.id}-detail`}>
                                            <td colSpan={7} style={{ padding: 0, verticalAlign: 'top', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ padding: '12px 14px', background: 'var(--bg-3)', fontSize: 12 }}>
                                                    <div style={{ marginBottom: 8 }}>
                                                        <strong style={{ color: 'var(--text-2)' }}>Резюме:</strong>
                                                        <div style={{ color: 'var(--text)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{ex.summary || '—'}</div>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: 'var(--text-2)' }}>Транскрипт:</strong>
                                                        <div style={{ color: 'var(--text)', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{ex.transcript || '—'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BenchmarkPage({ token }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');

    const fetchBenchmark = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/benchmark`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 404) {
                const j = await res.json();
                setError(j.error || 'Benchmark results not found');
                setData(null);
                return;
            }
            if (!res.ok) throw new Error('Ошибка загрузки');
            setData(await res.json());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const runBenchmark = async (quick) => {
        setRunning(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/benchmark/run`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ quick: !!quick }),
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(out.error || 'Ошибка запуска');
                return;
            }
            await fetchBenchmark();
        } catch (e) {
            setError(e.message);
        } finally {
            setRunning(false);
        }
    };

    useEffect(() => { fetchBenchmark(); }, []);

    const s = data?.summary;
    const examples = data?.examples || [];
    const runAt = data?.meta?.runAt ? new Date(data.meta.runAt).toLocaleString('ru-RU') : null;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Benchmark</h1>
                    {runAt && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                            Последний запуск: {runAt} · Модель: {data?.meta?.model}
                            {(data?.summary?.totalMs != null || data?.meta?.totalMs != null) && (
                                <> · Время выполнения: {formatDuration(data?.summary?.totalMs ?? data?.meta?.totalMs)}</>
                            )}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-primary" onClick={fetchBenchmark} disabled={loading}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Обновить
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={() => runBenchmark(true)}
                        disabled={running}
                        title="10 примеров, около 2 минут"
                    >
                        <Play size={14} />
                        {running ? 'Запуск…' : 'Быстрая оценка (10)'}
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => runBenchmark(false)}
                        disabled={running}
                        title="60 примеров, может занять 10+ минут"
                    >
                        {running ? 'Запуск…' : 'Полная оценка (60)'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="bench-notice">
                    <AlertCircle size={18} />
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Результаты не найдены</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Сначала запустите оценку (полный или быстрый прогон) из корня проекта или нажмите кнопку ниже:</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                            <button
                                className="btn-primary"
                                onClick={() => runBenchmark(true)}
                                disabled={running}
                            >
                                {running ? 'Запуск…' : 'Запустить быструю оценку (10 примеров)'}
                            </button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Или из терминала (корень проекта):</div>
                        <code className="bench-code">npm run benchmark</code>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>или быстрый тест (10 примеров):</div>
                        <code className="bench-code">npm run benchmark:quick</code>
                    </div>
                </div>
            )}

            {running && (
                <div className="bench-notice" style={{ background: 'rgba(79, 110, 247, 0.08)', borderColor: 'rgba(79, 110, 247, 0.2)' }}>
                    <RefreshCw size={18} className="spin" />
                    <div>
                        <div style={{ fontWeight: 600 }}>Идёт оценка…</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Подождите несколько минут. По завершении результаты обновятся автоматически.</div>
                    </div>
                </div>
            )}

            {data && (
                <>
                    {/* Summary gauges */}
                    <div className="bench-summary">
                        <div className="bench-gauge-row">
                            <GaugeRing value={s?.accuracy} label="Accuracy" size={100} />
                            <GaugeRing value={s?.macroF1} label="Macro F1" size={100} />
                        </div>
                        <div className="bench-stat-list">
                            <div className="bench-stat">
                                <Target size={14} />
                                <span>Правильных</span>
                                <strong>{examples.filter(e => e.correct).length} / {examples.filter(e => !e.error).length}</strong>
                            </div>
                            <div className="bench-stat">
                                <Clock size={14} />
                                <span>Avg latency</span>
                                <strong>{s?.avgLatencyMs}ms</strong>
                            </div>
                            <div className="bench-stat">
                                <Zap size={14} />
                                <span>Ошибок API</span>
                                <strong style={{ color: data.meta.errors > 0 ? 'var(--rose)' : 'var(--green)' }}>{data.meta.errors}</strong>
                            </div>
                            <div className="bench-stat">
                                <BarChart3 size={14} />
                                <span>Примеров</span>
                                <strong>{data.meta.evaluated}</strong>
                            </div>
                        </div>
                    </div>

                    {/* Per-label */}
                    <div className="section">
                        <div className="section-header">
                            <h2 className="section-title">Метрики по классам</h2>
                        </div>
                        <PerLabelTable perLabel={data.perLabel} />
                    </div>

                    {/* Confusion matrix */}
                    <div className="section">
                        <div className="section-header">
                            <h2 className="section-title">Матрица ошибок</h2>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>По диагонали — правильные предсказания</span>
                        </div>
                        <ConfusionMatrix matrix={data.confusionMatrix} />
                    </div>

                    <WorstCategoriesBlock worstCategories={data.worstCategories} />
                    <CategoryStatsTable categoryStats={data.categoryStats} />

                    {/* Example details */}
                    <ExamplesTable examples={examples} />
                </>
            )}

            {loading && !data && (
                <div className="empty-state">
                    <RefreshCw size={24} className="spin" />
                    <span>Загрузка результатов...</span>
                </div>
            )}
        </div>
    );
}
