import React, { useState, useEffect, useRef } from 'react';
import BenchmarkPage from './BenchmarkPage.jsx';
import {
  PhoneCall, PhoneOutgoing, PhoneIncoming, Clock, Zap,
  AlertCircle, RefreshCw, LayoutDashboard, Phone, FileText,
  Settings, GitBranch, X, Play, Pause, ChevronRight,
  Mic, TrendingUp, Users, Activity, Volume2, ChevronDown,
  LogOut, Bell, Search, Target
} from 'lucide-react';

const API_BASE = '/api';

// ─── Utility ────────────────────────────────────────────────────────────────

function fmt(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, isError, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      className={`toast ${isError ? 'toast--error' : 'toast--success'}`}
      role="alert"
    >
      {message}
    </div>
  );
}

// ─── Waveform ────────────────────────────────────────────────────────────────

function Waveform({ active }) {
  const bars = Array.from({ length: 60 }, (_, i) => {
    const h = 20 + Math.sin(i * 0.4) * 12 + Math.random() * 20;
    return Math.max(6, Math.min(48, h));
  });

  return (
    <div className="waveform">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`waveform-bar ${active ? 'waveform-bar--active' : ''}`}
          style={{
            height: `${h}px`,
            animationDelay: `${i * 0.03}s`,
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calls', label: 'Звонки', icon: Phone },
  { id: 'democall', label: 'Demo Call', icon: Mic, href: '/call.html' },
  { id: 'scripts', label: 'Скрипты', icon: FileText },
  { id: 'benchmark', label: 'Benchmark', icon: Target },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

function Sidebar({ active, onNav, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Activity size={18} />
        </div>
        <span className="sidebar-logo-text">CallFlow</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon: Icon, href }) => {
          if (href) {
            return (
              <a
                key={id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`sidebar-nav-item ${active === id ? 'sidebar-nav-item--active' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </a>
            );
          }
          return (
            <button
              key={id}
              className={`sidebar-nav-item ${active === id ? 'sidebar-nav-item--active' : ''}`}
              onClick={() => onNav(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {active === id && <div className="sidebar-nav-indicator" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="ai-status">
          <div className="ai-dot" />
          <span>AI Active</span>
        </div>
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ title, value, sub, icon: Icon, gradient, trend }) {
  return (
    <div className={`metric-card metric-card--${gradient}`}>
      <div className="metric-card-header">
        <span className="metric-card-title">{title}</span>
        <div className="metric-card-icon">
          <Icon size={18} />
        </div>
      </div>
      <div className="metric-card-value">{value}</div>
      {trend != null && (
        <div className="metric-card-trend">
          <TrendingUp size={12} />
          <span>{trend}</span>
        </div>
      )}
      {sub && <div className="metric-card-sub">{sub}</div>}
    </div>
  );
}

// ─── Temperature Badge ───────────────────────────────────────────────────────

function TempBadge({ temp }) {
  const cls = temp === 'hot' ? 'badge--hot' : temp === 'warm' ? 'badge--warm' : 'badge--cold';
  return <span className={`badge ${cls}`}>{temp || 'cold'}</span>;
}

// ─── Call Type Badge ─────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  return (
    <span className={`badge ${type === 'inbound' ? 'badge--inbound' : 'badge--outbound'}`}>
      {type === 'inbound' ? <PhoneIncoming size={11} /> : <PhoneOutgoing size={11} />}
      {type}
    </span>
  );
}

// ─── Transcript Panel ─────────────────────────────────────────────────────────

function TranscriptPanel({ call, onClose, token, onUpdate, showToast }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(call?.duration || 0);
  const [leadTemperature, setLeadTemperature] = useState(call?.leadTemperature || 'cold');
  const [classificationReason, setClassificationReason] = useState(call?.classificationReason || '');
  const [saving, setSaving] = useState(false);
  const [syncingCrm, setSyncingCrm] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [notes, setNotes] = useState(call?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (call) {
      setLeadTemperature(call.leadTemperature || 'cold');
      setClassificationReason(call.classificationReason || '');
      setNotes(call.notes || '');
    }
  }, [call?.callId]);

  // Auto-pause when call changes and reset state
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [call?.callId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = () => {
    if (!audioRef.current || !call?.recordingUrl) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Audio play failed:", e));
    }
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const dur = audioRef.current.duration || call?.duration || 1;
    setCurrentTime(current);
    setProgress((current / dur) * 100);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration !== Infinity) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !call?.recordingUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const dur = audioRef.current.duration || call?.duration || 1;
    const newTime = pos * dur;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(pos * 100);
  };

  const skip = (seconds) => {
    if (!audioRef.current || !call?.recordingUrl) return;
    let newTime = audioRef.current.currentTime + seconds;
    const dur = audioRef.current.duration || call?.duration || 1;
    if (newTime < 0) newTime = 0;
    if (newTime > dur) newTime = dur;
    audioRef.current.currentTime = newTime;
  };

  // Build transcript lines from call.transcript (array of { role, message?, content?, text?, time? })
  const transcriptArr = Array.isArray(call?.transcript) ? call.transcript : [];
  const lines = transcriptArr.map((m, i) => {
    const text = m.message ?? m.content ?? m.text ?? '';
    const role = (m.role || '').toLowerCase();
    const speaker = role === 'user' ? (call?.callerName || 'Клиент') : 'Агент';
    const timeStr = m.time != null ? fmt(Number(m.time)) : (i > 0 ? '' : '0:00');
    return { speaker, time: timeStr, text };
  });

  const hasSummary = !!(call?.summary || call?.aiSummary);
  const summaryText = call?.summary || call?.aiSummary || '';

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <div>
          <div className="transcript-title">Транскрипт звонка</div>
          <div className="transcript-sub">
            {call?.callerPhone} · {call?.callerName || 'Неизвестный'}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>

      {/* Waveform */}
      <div className="transcript-waveform-box">
        <Waveform active={playing} />
      </div>

      {/* Transcript card */}
      <div className="transcript-card">
        <div className="transcript-card-title">Транскрипт</div>
        <div className="transcript-lines">
          {lines.length > 0 ? (
            lines.map((l, i) => (
              <div key={i} className="transcript-line">
                <div className="transcript-line-header">
                  <div className="transcript-avatar">{l.speaker[0]}</div>
                  <span className="transcript-speaker">{l.speaker}</span>
                  <span className="transcript-time">{l.time}</span>
                </div>
                <p className="transcript-text">{l.text}</p>
              </div>
            ))
          ) : (
            <div className="transcript-empty">Транскрипт пока недоступен</div>
          )}
        </div>
      </div>

      {/* AI Summary card */}
      {hasSummary && (
        <div className="transcript-card transcript-card--summary">
          <div className="transcript-card-title">Резюме</div>
          <p className="transcript-summary-text">{summaryText}</p>
        </div>
      )}

      {/* Player */}
      <div className="audio-player">
        {call?.recordingUrl ? (
          <>
            <audio
              ref={audioRef}
              src={call.recordingUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setPlaying(false)}
            />
            <div className="audio-progress-bar" onClick={handleSeek} style={{ cursor: 'pointer' }}>
              <div className="audio-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="audio-controls">
              <span className="audio-time">{fmt(currentTime)}</span>
              <div className="audio-btns">
                <button className="audio-skip" onClick={() => skip(-5)} title="-5 сек">
                  <span>-5</span>
                </button>
                <button
                  className="audio-play"
                  onClick={togglePlay}
                >
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button className="audio-skip" onClick={() => skip(5)} title="+5 сек">
                  <span>+5</span>
                </button>
              </div>
              <span className="audio-time">{fmt(duration)}</span>
              <div className="audio-speed">
                <select
                  className="audio-speed-select"
                  value={playbackRate}
                  onChange={e => setPlaybackRate(Number(e.target.value))}
                  title="Скорость"
                >
                  {[0.5, 1, 1.25, 1.5, 2].map(r => (
                    <option key={r} value={r}>{r}x</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', padding: '10px 0' }}>
            Аудиозапись недоступна
          </div>
        )}
      </div>

      {token && onUpdate && call?.callId && (
        <div className="form-group" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block' }}>Классификация лида</label>
          <select
            value={leadTemperature}
            onChange={e => setLeadTemperature(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', marginBottom: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-2)' }}
          >
            <option value="cold">Холодный</option>
            <option value="warm">Тёплый</option>
            <option value="hot">Горячий</option>
          </select>
          <textarea
            placeholder="Причина классификации..."
            value={classificationReason}
            onChange={e => setClassificationReason(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '8px 10px', marginBottom: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-2)', resize: 'vertical' }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await fetch(`${API_BASE}/calls/${encodeURIComponent(call.callId)}`, {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ leadTemperature, classificationReason })
                });
                const data = await res.json();
                if (res.ok) {
                  onUpdate(data);
                }
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}

      {token && onUpdate && call?.callId && (
        <div className="form-group" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block' }}>Заметки</label>
          <textarea
            placeholder="Добавить заметку к звонку..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '8px 10px', marginBottom: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-2)', resize: 'vertical' }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={savingNotes}
            onClick={async () => {
              setSavingNotes(true);
              try {
                const res = await fetch(`${API_BASE}/calls/${encodeURIComponent(call.callId)}`, {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ notes })
                });
                const data = await res.json();
                if (res.ok) onUpdate(data);
              } finally {
                setSavingNotes(false);
              }
            }}
          >
            {savingNotes ? 'Сохранение...' : 'Сохранить заметки'}
          </button>
        </div>
      )}

      {token && onUpdate && call?.callId && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={syncingCrm}
            onClick={async () => {
              setSyncingCrm(true);
              try {
                const res = await fetch(`${API_BASE}/calls/${encodeURIComponent(call.callId)}/sync-crm`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                  onUpdate(data);
                  showToast?.('Отправлено в CRM');
                } else if (res.status === 400) (showToast || (m => alert(m)))(data.error || 'CRM не настроен', true);
                else (showToast || (m => alert(m)))(data.error || 'Ошибка синхронизации с CRM', true);
              } finally {
                setSyncingCrm(false);
              }
            }}
          >
            {syncingCrm ? 'Отправка...' : 'Отправить в CRM'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function aggregateCallsByDay(calls, days = 14) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  const byDay = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dayStr = d.toISOString().slice(0, 10);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const count = calls.filter(c => {
      const t = new Date(c.timestamp);
      return t >= d && t < next;
    }).length;
    byDay.push({ date: dayStr, label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), count });
  }
  return byDay;
}

function CallsChart({ calls }) {
  const data = aggregateCallsByDay(calls || [], 14);
  const maxCount = Math.max(1, ...data.map(d => d.count));
  return (
    <div className="chart-section">
      <h2 className="section-title">Звонков по дням</h2>
      <div className="chart-bars">
        {data.map((d, i) => (
          <div key={d.date} className="chart-bar-wrap" title={`${d.label}: ${d.count}`}>
            <div
              className="chart-bar"
              style={{ height: `${(d.count / maxCount) * 100}%` }}
            />
            <span className="chart-bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardPage({ stats, calls, loading, onSelectCall, token, fetchData }) {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div className="page-meta">
          <div className="dot dot--green" />
          <span>AI Active</span>
          <span className="separator">·</span>
          <span>RU/UZ</span>
          <span className="separator">·</span>
          <Volume2 size={14} />
          <span>Female / Male</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                const res = await fetch(`${API_BASE}/test/inbound`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                  alert('Тестовый входящий вебхук отправлен! Звонок появится в списке через пару секунд.');
                  fetchData();
                } else {
                  const errData = await res.json();
                  alert('Ошибка: ' + errData.error);
                }
              } catch (e) {
                console.error(e);
              }
            }}
          >
            <PhoneIncoming size={14} />
            <span>Тестовый входящий</span>
          </button>
        </div>
      </div>

      <div className="metrics-grid metrics-grid--three">
        <MetricCard
          title="Всего звонков"
          value={stats?.totalCalls ?? '—'}
          icon={PhoneCall}
          gradient="blue"
        />
        <MetricCard
          title="Общая длительность"
          value={stats?.totalDurationSeconds != null ? `${Math.floor(stats.totalDurationSeconds / 3600)}ч ${Math.floor((stats.totalDurationSeconds % 3600) / 60)}м` : '—'}
          icon={Clock}
          gradient="purple"
        />
        <MetricCard
          title="Горячие лиды"
          value={stats?.hotCount ?? '—'}
          icon={Zap}
          gradient="orange"
          trend="🔥 актив"
        />
      </div>

      <CallsChart calls={calls} />

      {/* Recent Calls */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Последние звонки</h2>
          {loading && <RefreshCw size={14} className="spin text-slate-400" />}
        </div>
        <CallsTable calls={calls.slice(0, 8)} onSelectCall={onSelectCall} />
      </div>
    </div>
  );
}

// ─── Calls Page ───────────────────────────────────────────────────────────────

function CallsPage({ calls, loading, onSelectCall, callFilters, setCallFilters, fetchData }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = calls.filter(c => {
    const matchSearch = !search ||
      (c.callerPhone || '').includes(search) ||
      (c.callerName || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || c.callType === filter || c.leadTemperature === filter;
    return matchSearch && matchFilter;
  });

  const sorted = React.useMemo(() => {
    const a = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    a.sort((x, y) => {
      if (sortBy === 'date') return dir * (new Date(x.timestamp) - new Date(y.timestamp));
      if (sortBy === 'duration') return dir * ((x.duration || 0) - (y.duration || 0));
      if (sortBy === 'status') return dir * (String(x.leadTemperature || 'cold').localeCompare(y.leadTemperature || 'cold'));
      return 0;
    });
    return a;
  }, [filtered, sortBy, sortDir]);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const applyFilters = (next) => {
    const nextFilters = { ...callFilters, ...next };
    setCallFilters(nextFilters);
    fetchData(nextFilters);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Звонки</h1>
        <div className="page-actions">
          <div className="search-box">
            <Search size={14} />
            <input
              className="search-input"
              placeholder="Поиск по номеру или имени..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="calls-filters">
        <div className="calls-filter-group">
          <span className="calls-filter-label">Период</span>
          <div className="calls-filter-btns">
            {[
              { id: 'today', label: 'Сегодня' },
              { id: 'week', label: 'Неделя' },
              { id: 'month', label: 'Месяц' },
            ].map(({ id, label }) => (
              <button
                key={id}
                className={`filter-tab ${callFilters.period === id ? 'filter-tab--active' : ''}`}
                onClick={() => applyFilters({ period: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="calls-filter-group">
          <span className="calls-filter-label">Температура лида</span>
          <div className="calls-filter-btns calls-filter-btns--temp">
            {['all', 'hot', 'warm', 'cold'].map(f => (
              <button
                key={f}
                className={`filter-tab filter-tab--temp ${callFilters.temperature === f ? 'filter-tab--active' : ''} ${f !== 'all' ? `filter-tab--${f}` : ''}`}
                onClick={() => applyFilters({ temperature: f })}
              >
                {f === 'all' ? 'Все' : f === 'hot' ? 'Hot' : f === 'warm' ? 'Warm' : 'Cold'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="filter-tabs">
        {['all', 'inbound', 'outbound', 'hot', 'warm', 'cold'].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Все' : f}
          </button>
        ))}
      </div>

      <div className="section">
        {loading && !filtered.length ? (
          <div className="empty-state">
            <RefreshCw size={24} className="spin" />
            <span>Загрузка...</span>
          </div>
        ) : (
          <CallsTable calls={sorted} onSelectCall={onSelectCall} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
        )}
      </div>
    </div>
  );
}

// ─── Calls Table ─────────────────────────────────────────────────────────────

function CallsTable({ calls, onSelectCall, sortBy, sortDir, onSort }) {
  if (!calls.length) {
    return (
      <div className="empty-state">
        <Phone size={24} />
        <span>Нет звонков</span>
      </div>
    );
  }

  const Th = ({ field, label }) => (
    <th
      className={onSort ? 'th-sortable' : ''}
      onClick={onSort ? () => onSort(field) : undefined}
    >
      {label}
      {onSort && sortBy === field && (
        <span className="sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
      )}
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <Th field="date" label="Дата" />
            <th>Тип</th>
            <th>Лид / Номер</th>
            <Th field="duration" label="Длительность" />
            <Th field="status" label="Статус" />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {calls.map(call => (
            <tr key={call.id} className="table-row" onClick={() => onSelectCall(call)}>
              <td className="td-muted">{fmtDate(call.timestamp)}</td>
              <td><TypeBadge type={call.callType} /></td>
              <td>
                <div className="lead-name">{call.callerName || 'Неизвестный'}</div>
                <div className="lead-phone">{call.callerPhone}</div>
              </td>
              <td className="td-muted">{fmt(call.duration || 0)}</td>
              <td><TempBadge temp={call.leadTemperature} /></td>
              <td>
                <button className="row-action" onClick={e => { e.stopPropagation(); onSelectCall(call); }}>
                  <Play size={12} />
                  <span>Слушать</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Settings Page ─────────────────────────────────────────────────────────────

function SettingsPage({ token, showToast }) {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        if (!cancelled) {
          setSystemPrompt(data.systemPrompt || '');
          setFirstMessage(data.firstMessage || '');
        }
      } catch (err) {
        if (!cancelled && showToast) showToast('Не удалось загрузить настройки', true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ systemPrompt, firstMessage })
      });
      const data = await res.json();
      if (res.ok) {
        if (data._vapiError) {
          showToast?.('Настройки сохранены, но синхронизация с VAPI не удалась: ' + data._vapiError, true);
        } else {
          showToast?.('Настройки сохранены и синхронизированы с VAPI');
        }
      } else {
        showToast?.(data.error || 'Ошибка сохранения', true);
      }
    } catch (err) {
      showToast?.('Не удалось сохранить настройки', true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Настройки</h1></div>
        <div className="empty-state"><RefreshCw size={24} className="spin" /><span>Загрузка...</span></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Настройки</h1>
        <p className="text-slate-500 text-sm">Системный промпт и первое сообщение применяются ко всем звонкам и синхронизируются с VAPI.</p>
      </div>
      <form onSubmit={handleSubmit} className="outbound-form section">
        <div className="form-group">
          <label>Системный промпт (инструкция для AI)</label>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Ты — опытный менеджер по продажам..."
            rows={12}
            style={{ fontFamily: 'inherit' }}
          />
        </div>
        <div className="form-group">
          <label>Первое сообщение (приветствие)</label>
          <textarea
            value={firstMessage}
            onChange={e => setFirstMessage(e.target.value)}
            placeholder="Здравствуйте! Меня зовут..."
            rows={3}
            style={{ fontFamily: 'inherit' }}
          />
        </div>
        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить и синхронизировать с VAPI'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Scripts Page ──────────────────────────────────────────────────────────────

function ScriptsPage({ token, showToast }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newScript, setNewScript] = useState({ name: '', description: '', firstMessage: '', systemPrompt: '' });
  const [editScript, setEditScript] = useState(null);
  const [applyingId, setApplyingId] = useState(null);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/scripts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setScripts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch scripts failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/scripts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newScript)
      });
      if (res.ok) {
        setShowModal(false);
        setNewScript({ name: '', description: '', firstMessage: '', systemPrompt: '' });
        fetchScripts();
        showToast('Скрипт создан');
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка создания', true);
      }
    } catch (err) {
      console.error('Create script failed:', err);
      showToast('Не удалось создать скрипт', true);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editScript || !editScript.id) return;
    try {
      const res = await fetch(`${API_BASE}/scripts/${editScript.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editScript.name,
          description: editScript.description,
          firstMessage: editScript.firstMessage,
          systemPrompt: editScript.systemPrompt,
          isActive: editScript.isActive
        })
      });
      if (res.ok) {
        setEditScript(null);
        fetchScripts();
        showToast('Скрипт обновлён');
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка обновления', true);
      }
    } catch (err) {
      console.error('Update script failed:', err);
      showToast('Не удалось обновить скрипт', true);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить этот скрипт?')) return;
    try {
      await fetch(`${API_BASE}/scripts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchScripts();
      showToast('Скрипт удалён');
    } catch (err) {
      console.error('Delete script failed:', err);
      showToast('Не удалось удалить скрипт', true);
    }
  };

  const handleApply = async (id) => {
    setApplyingId(id);
    try {
      const res = await fetch(`${API_BASE}/scripts/${id}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.vapiError ? 'Настройки сохранены; VAPI: ' + data.vapiError : (data.message || 'Скрипт применён'));
        if (data.vapiError) showToast(data.vapiError, true);
      } else {
        showToast(data.error || 'Ошибка применения скрипта', true);
      }
    } catch (err) {
      console.error('Apply script failed:', err);
      showToast('Не удалось применить скрипт', true);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Сценарии звонков</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Новый скрипт</button>
      </div>

      <div className="section">
        {loading ? (
          <div className="empty-state">
            <RefreshCw size={24} className="spin" />
            <span>Загрузка...</span>
          </div>
        ) : scripts.length === 0 ? (
          <div className="empty-state">
            <FileText size={24} />
            <span>Скриптов пока нет. Создайте первый!</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Описание</th>
                  <th>Первое сообщение</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scripts.map(s => (
                  <tr key={s.id} className="table-row">
                    <td>
                      <div className="lead-name">{s.name}</div>
                    </td>
                    <td className="td-muted">{s.description || '—'}</td>
                    <td className="td-muted">{s.firstMessage || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="row-action btn-primary"
                          disabled={applyingId === s.id}
                          onClick={() => handleApply(s.id)}
                        >
                          {applyingId === s.id ? '...' : 'Применить'}
                        </button>
                        <button className="row-action" onClick={() => setEditScript({ id: s.id, name: s.name, description: s.description || '', firstMessage: s.firstMessage || '', systemPrompt: s.systemPrompt || '', isActive: s.isActive !== false })}>
                          Редактировать
                        </button>
                        <button className="row-action" style={{ background: 'none', color: '#ef4444' }} onClick={() => handleDelete(s.id)}>
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editScript && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditScript(null)}>
          <div className="modal script-form-modal" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2>Редактировать сценарий</h2>
              <button type="button" className="modal-close" onClick={() => setEditScript(null)} aria-label="Закрыть"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdate} className="script-form">
              <div className="modal-body">
                <div className="form-section">
                  <div className="form-section-title">Основное</div>
                  <div className="form-group">
                    <label htmlFor="edit-script-name">Название сценария</label>
                    <input
                      id="edit-script-name"
                      type="text"
                      required
                      placeholder="Например: Холодный обзвон — турбазы"
                      value={editScript.name}
                      onChange={e => setEditScript({ ...editScript, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-script-desc">Описание</label>
                    <input
                      id="edit-script-desc"
                      type="text"
                      placeholder="Кратко, о чём этот сценарий"
                      value={editScript.description}
                      onChange={e => setEditScript({ ...editScript, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-section">
                  <div className="form-section-title">Поведение ассистента</div>
                  <div className="form-group">
                    <label htmlFor="edit-script-first">Первое сообщение</label>
                    <textarea
                      id="edit-script-first"
                      placeholder="Фраза, с которой ассистент начинает разговор"
                      value={editScript.firstMessage}
                      onChange={e => setEditScript({ ...editScript, firstMessage: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-script-prompt">Системный промпт</label>
                    <textarea
                      id="edit-script-prompt"
                      required
                      placeholder="Инструкция для AI: тон, цели, ограничения"
                      value={editScript.systemPrompt}
                      onChange={e => setEditScript({ ...editScript, systemPrompt: e.target.value })}
                      rows={6}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditScript(null)}>Отмена</button>
                <button type="submit" className="btn-primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal script-form-modal" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2>Новый сценарий</h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label="Закрыть"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="script-form">
              <div className="modal-body">
                <p className="form-intro">Заполните параметры сценария. Название и системный промпт обязательны — они задают поведение ассистента в звонках.</p>
                <div className="form-section">
                  <div className="form-section-title">Основное</div>
                  <div className="form-group">
                    <label htmlFor="new-script-name">Название сценария</label>
                    <input
                      id="new-script-name"
                      type="text"
                      required
                      placeholder="Например: Холодный обзвон — турбазы"
                      value={newScript.name}
                      onChange={e => setNewScript({ ...newScript, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="new-script-desc">Описание</label>
                    <input
                      id="new-script-desc"
                      type="text"
                      placeholder="Кратко, о чём этот сценарий (для себя)"
                      value={newScript.description}
                      onChange={e => setNewScript({ ...newScript, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-section">
                  <div className="form-section-title">Поведение ассистента</div>
                  <div className="form-group">
                    <label htmlFor="new-script-first">Первое сообщение</label>
                    <textarea
                      id="new-script-first"
                      placeholder="Фраза, с которой ассистент начинает разговор. Например: Добрый день! Меня зовут Алекс, я звоню вам из компании..."
                      value={newScript.firstMessage}
                      onChange={e => setNewScript({ ...newScript, firstMessage: e.target.value })}
                      rows={3}
                    />
                    <p className="form-hint">Озвучивается в начале звонка.</p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="new-script-prompt">Системный промпт</label>
                    <textarea
                      id="new-script-prompt"
                      required
                      placeholder="Ты — опытный менеджер по продажам. Твоя цель — вежливо представиться, уточнить потребность клиента и при возможности назначить встречу или перезвон."
                      value={newScript.systemPrompt}
                      onChange={e => setNewScript({ ...newScript, systemPrompt: e.target.value })}
                      rows={6}
                    />
                    <p className="form-hint">Инструкция для AI: тон, цели, что можно и нельзя говорить.</p>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn-primary">Создать сценарий</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── System Flow Page ─────────────────────────────────────────────────────────

function FlowPage() {
  const nodes = [
    { label: 'Website', icon: '🌐', status: 'working' },
    { label: 'API', icon: '⚡', status: 'working' },
    { label: 'Call Engine', icon: '📞', status: 'working' },
    { label: 'AI Processing', icon: '🤖', status: 'delay' },
    { label: 'CRM', icon: '📋', status: 'working' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">System Flow</h1>
      </div>
      <div className="flow-canvas">
        {nodes.map((n, i) => (
          <React.Fragment key={n.label}>
            <div className="flow-node">
              <div className="flow-node-icon">{n.icon}</div>
              <div className="flow-node-label">{n.label}</div>
              <div className={`flow-node-status flow-node-status--${n.status}`}>
                <div className="dot" />
                <span>{n.status === 'working' ? 'Working' : 'Delay'}</span>
              </div>
            </div>
            {i < nodes.length - 1 && <div className="flow-arrow">→</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ token, setToken, onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-glow login-glow--1" />
      <div className="login-glow login-glow--2" />
      <div className="login-card">
        <div className="login-logo">
          <Activity size={28} />
        </div>
        <h1 className="login-title">CallFlow</h1>
        <p className="login-sub">AI-powered call center dashboard</p>
        <form onSubmit={onLogin} className="login-form">
          <label className="login-label">API Bearer Token</label>
          <input
            type="password"
            className="login-input"
            placeholder="Enter your access token"
            value={token}
            onChange={e => setToken(e.target.value)}
            required
          />
          <button type="submit" className="login-btn">
            Войти <ChevronRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Outbound Call Modal ───────────────────────────────────────────────────────

function OutboundCallModal({ token, onClose, onSuccess }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scripts, setScripts] = useState([]);
  const [scriptId, setScriptId] = useState('');

  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const res = await fetch(`${API_BASE}/scripts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (Array.isArray(data)) setScripts(data);
      } catch (err) {
        console.error('Fetch scripts in modal failed:', err);
      }
    };
    fetchScripts();
  }, [token]);

  const handleCall = async (isDemo = false) => {
    if (!phone) return setError('Введите номер телефона');
    setLoading(true);
    setError('');
    try {
      const endpoint = isDemo ? `${API_BASE}/test/outbound` : `${API_BASE}/calls/outbound`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: phone,
          customerName: name,
          scriptId: scriptId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка запуска звонка');
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="transcript-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="login-card" style={{ width: 360, position: 'relative' }}>
        <button className="icon-btn" style={{ position: 'absolute', right: 16, top: 16 }} onClick={onClose}>
          <X size={18} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Новый звонок</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Запустите исходящий звонок. Требуется VAPI_PHONE_NUMBER_ID в .env для реального вызова.</p>

        <div className="login-form">
          <label className="login-label">Номер телефона</label>
          <input
            className="login-input"
            placeholder="+7..."
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <label className="login-label">Имя клиента (опц.)</label>
          <input
            className="login-input"
            placeholder="Иван Иванович"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <label className="login-label">Сценарий (опц.)</label>
          <select
            className="login-input"
            value={scriptId}
            onChange={e => setScriptId(e.target.value)}
            style={{ appearance: 'auto', paddingRight: '10px' }}
          >
            <option value="">Текущие настройки</option>
            {scripts.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {error && <div style={{ color: 'var(--rose)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="login-btn" style={{ flex: 2 }} onClick={() => handleCall(false)} disabled={loading}>
              {loading ? <RefreshCw size={14} className="spin" /> : <PhoneOutgoing size={14} />}
              <span>Позвонить</span>
            </button>
            <button
              className="login-btn"
              style={{ flex: 1, background: 'var(--bg-4)', color: 'var(--text-1)' }}
              onClick={() => handleCall(true)}
              disabled={loading}
              title="Симуляция без реального звонка"
            >
              Demo
            </button>
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
            Или используйте кнопку "Поговорить" в меню слева для звонка через браузер.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('api_token') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(!!token);
  const [calls, setCalls] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState('dashboard');
  const [selectedCall, setSelectedCall] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callFilters, setCallFilters] = useState({ period: 'week', temperature: 'all' });
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  const showToast = (message, isError = false) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ message, isError });
    toastRef.current = setTimeout(() => setToast(null), 4000);
  };

  const handleLogin = e => {
    e.preventDefault();
    localStorage.setItem('api_token', token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('api_token');
    setToken('');
    setIsAuthenticated(false);
    setCalls([]);
    setStats(null);
  };

  function buildCallsQuery(filters) {
    const f = filters ?? callFilters;
    const params = new URLSearchParams();
    params.set('limit', '50');
    const now = new Date();
    if (f.period === 'today') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      params.set('from', d.toISOString().slice(0, 10));
      params.set('to', d.toISOString().slice(0, 10));
    } else if (f.period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      params.set('from', d.toISOString().slice(0, 10));
      params.set('to', now.toISOString().slice(0, 10));
    } else if (f.period === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      params.set('from', d.toISOString().slice(0, 10));
      params.set('to', now.toISOString().slice(0, 10));
    }
    if (f.temperature && f.temperature !== 'all') {
      params.set('status', f.temperature);
    }
    return params.toString();
  }

  const fetchData = async (filterOverride) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const query = buildCallsQuery(filterOverride ?? undefined);
      const [callsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/calls?${query}`, { headers }),
        fetch(`${API_BASE}/stats`, { headers })
      ]);
      if (callsRes.status === 401 || statsRes.status === 401) { logout(); return; }
      if (!callsRes.ok || !statsRes.ok) throw new Error('Failed to fetch');
      setCalls(await callsRes.json());
      setStats(await statsRes.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAuthenticated) fetchData(); }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [isAuthenticated, token]);

  if (!isAuthenticated) {
    return <LoginScreen token={token} setToken={setToken} onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Sidebar active={page} onNav={setPage} onLogout={logout} />

      <main className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-refresh"
              onClick={fetchData}
              title="Обновить данные"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <button
              className="topbar-btn"
              onClick={() => setShowCallModal(true)}
              style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PhoneOutgoing size={14} />
              <span>Новый звонок</span>
            </button>
          </div>
          <div className="topbar-right">
            {error && (
              <div className="topbar-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
            <Bell size={18} className="topbar-icon" />
          </div>
        </div>

        {/* Pages */}
        <div className="page-area">
          {page === 'dashboard' && (
            <DashboardPage
              stats={stats}
              calls={calls}
              loading={loading}
              onSelectCall={setSelectedCall}
              token={token}
              fetchData={fetchData}
            />
          )}
          {page === 'calls' && (
            <CallsPage
              calls={calls}
              loading={loading}
              onSelectCall={setSelectedCall}
              callFilters={callFilters}
              setCallFilters={setCallFilters}
              fetchData={fetchData}
            />
          )}
          {page === 'scripts' && <ScriptsPage token={token} showToast={showToast} />}
          {page === 'benchmark' && <BenchmarkPage token={token} />}
          {page === 'settings' && (
            <SettingsPage token={token} showToast={showToast} />
          )}
        </div>
      </main>

      {/* Transcript side panel */}
      {selectedCall && (
        <div className="transcript-overlay">
          <TranscriptPanel
            call={selectedCall}
            onClose={() => setSelectedCall(null)}
            token={token}
            onUpdate={(updated) => { setSelectedCall(updated); fetchData(); }}
            showToast={showToast}
          />
        </div>
      )}
      {/* Outbound Call Modal */}
      {showCallModal && (
        <OutboundCallModal
          token={token}
          onClose={() => setShowCallModal(false)}
          onSuccess={() => {
            setShowCallModal(false);
            fetchData();
          }}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          isError={toast.isError}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
