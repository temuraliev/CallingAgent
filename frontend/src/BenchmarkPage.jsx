import React, { useState, useEffect } from 'react';
import {
    Target, RefreshCw, AlertCircle, CheckCircle2, XCircle,
    TrendingUp, Clock, BarChart3, Zap, ChevronDown, ChevronUp,
    Play
} from 'lucide-react';

const API_BASE = '/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v) { return typeof v === 'number' ? v.toFixed(1) + '%' : '—'; }

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

function ExamplesTable({ examples }) {
    const [show, setShow] = useState(false);
    const [filter, setFilter] = useState('all');

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
                                <tr key={ex.id} className="table-row">
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
                setError(j.error);
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

    useEffect(() => { fetchBenchmark(); }, []);

    const s = data?.summary;
    const examples = data?.examples || [];
    const runAt = data?.meta?.runAt ? new Date(data.meta.runAt).toLocaleString('ru-RU') : null;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Benchmark</h1>
                    {runAt && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>Последний запуск: {runAt} · Модель: {data?.meta?.model}</div>}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-primary" onClick={fetchBenchmark} disabled={loading}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Обновить
                    </button>
                </div>
            </div>

            {error && (
                <div className="bench-notice">
                    <AlertCircle size={18} />
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Результаты не найдены</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Запустите оценку из корня проекта:</div>
                        <code className="bench-code">npm run benchmark</code>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>или быстрый тест (10 примеров):</div>
                        <code className="bench-code">npm run benchmark:quick</code>
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
