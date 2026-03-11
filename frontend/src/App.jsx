import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall, PhoneOutgoing, PhoneIncoming, Clock, Zap,
  AlertCircle, RefreshCw, LayoutDashboard, Phone, FileText,
  Settings, GitBranch, X, Play, Pause, ChevronRight,
  Mic, TrendingUp, Users, Activity, ChevronDown, ChevronUp,
  LogOut, Bell, Search, Menu, Plus, Lock, MessageSquarePlus
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
  { id: 'profile', label: 'О бизнесе', icon: FileText },
];

function Sidebar({ active, onNav, onLogout, isOpen, onClose }) {
  const handleNav = (id) => {
    onNav(id);
    onClose?.();
  };
  const handleLogout = () => {
    onLogout();
    onClose?.();
  };
  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
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
                  onClick={onClose}
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
                onClick={() => handleNav(id)}
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
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
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
  const [showTranscript, setShowTranscript] = useState(false);
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

  // Build transcript lines: support array of { role, message?, content?, text? } or string "[role]: text\n..."
  const raw = call?.transcript;
  let lines = [];
  if (Array.isArray(raw)) {
    lines = raw.map((m, i) => {
      const text = m.message ?? m.content ?? m.text ?? '';
      const role = (m.role || '').toLowerCase();
      const speaker = role === 'user' ? (call?.callerName || 'Клиент') : 'Агент';
      const timeStr = m.time != null ? fmt(Number(m.time)) : (i > 0 ? '' : '0:00');
      return { speaker, time: timeStr, text };
    }).filter(l => l.text.trim());
  } else if (typeof raw === 'string' && raw.trim()) {
    const parsed = raw.split(/\n+/).map(line => {
      const match = line.match(/^\s*\[?(assistant|user|agent|клиент)\]?:\s*(.*)$/i);
      if (match) {
        const role = match[1].toLowerCase();
        const speaker = (role === 'user' || role === 'клиент') ? (call?.callerName || 'Клиент') : 'Агент';
        return { speaker, time: '', text: match[2].trim() };
      }
      return { speaker: 'Агент', time: '', text: line.trim() };
    }).filter(l => l.text);
    lines = parsed;
  }

  const hasSummary = !!(call?.summary || call?.aiSummary);
  const summaryText = call?.summary || call?.aiSummary || '';

  const callDate = call?.timestamp ? fmtDate(call.timestamp) : '';

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <div className="transcript-header-main">
          <h2 className="transcript-title">Прослушивание звонка</h2>
          <div className="transcript-meta">
            <span className="transcript-contact">{call?.callerName || 'Неизвестный'}</span>
            {call?.callerPhone && <span className="transcript-phone">{call.callerPhone}</span>}
            {callDate && <span className="transcript-date">{callDate}</span>}
          </div>
          <div className="transcript-badges">
            <TypeBadge type={call?.callType || 'inbound'} />
            <TempBadge temp={leadTemperature} />
            {call?.duration != null && (
              <span className="transcript-duration-badge">
                <Clock size={12} />
                {fmt(call.duration)}
              </span>
            )}
          </div>
        </div>
        <button className="transcript-close-btn" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>

      {/* Player block */}
      <div className="transcript-player-block">
        <div className="transcript-waveform-box">
          <Waveform active={playing} />
        </div>
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
                  <button className="audio-skip" onClick={() => skip(-5)} title="-5 сек"><span>-5</span></button>
                  <button className="audio-play" onClick={togglePlay}>
                    {playing ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button className="audio-skip" onClick={() => skip(5)} title="+5 сек"><span>+5</span></button>
                </div>
                <span className="audio-time">{fmt(duration)}</span>
                <select
                  className="audio-speed-select"
                  value={playbackRate}
                  onChange={e => setPlaybackRate(Number(e.target.value))}
                  title="Скорость"
                >
                  {[0.5, 1, 1.25, 1.5, 2].map(r => (
                    <option key={r} value={r}>{r}×</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="audio-unavailable">Аудиозапись недоступна</div>
          )}
        </div>
      </div>

      {/* Scrollable body: summary + collapsible transcript + actions */}
      <div className="transcript-panel-scroll">

        {/* AI Summary card — always visible */}
        {hasSummary && (
          <div className="transcript-card transcript-card--summary">
            <div className="transcript-card-title">Резюме</div>
            <p className="transcript-summary-text">{summaryText}</p>
          </div>
        )}

        {/* Collapsible transcript */}
        <div className="transcript-card">
          <button
            className="transcript-toggle-btn"
            onClick={() => setShowTranscript(v => !v)}
          >
            {showTranscript ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{showTranscript ? 'Свернуть описание звонка' : 'Развернуть описание звонка'}</span>
          </button>
          {showTranscript && (
            <div className="transcript-lines">
              {lines.length > 0 ? (
                lines.map((l, i) => (
                  <div key={i} className="transcript-line">
                    <div className="transcript-line-header">
                      <div className={`transcript-avatar transcript-avatar--${(l.speaker === 'Агент' ? 'agent' : 'client')}`}>{l.speaker[0]}</div>
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
          )}
        </div>

        {token && onUpdate && call?.callId && (
          <div className="transcript-actions">
            <div className="transcript-actions-title">Классификация и заметки</div>
            <div className="transcript-form-row">
              <label className="transcript-label">Температура лида</label>
              <select
                className="transcript-input"
                value={leadTemperature}
                onChange={e => setLeadTemperature(e.target.value)}
              >
                <option value="cold">Холодный</option>
                <option value="warm">Тёплый</option>
                <option value="hot">Горячий</option>
              </select>
            </div>
            <div className="transcript-form-row">
              <label className="transcript-label">Причина классификации</label>
              <textarea
                className="transcript-input transcript-textarea"
                placeholder="Причина классификации..."
                value={classificationReason}
                onChange={e => setClassificationReason(e.target.value)}
                rows={2}
              />
            </div>
            <div className="transcript-form-btns">
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
                    if (res.ok) onUpdate(data);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Сохранение...' : 'Сохранить классификацию'}
              </button>
            </div>
            <div className="transcript-form-row">
              <label className="transcript-label">Заметки к звонку</label>
              <textarea
                className="transcript-input transcript-textarea"
                placeholder="Добавить заметку..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="transcript-form-btns">
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
            <div className="transcript-form-btns">
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
          </div>
        )}
      </div>
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

// ─── Business Profile Page (Анкета) ────────────────────────────────────────────

const PROFILE_QUESTIONS = [
  { key: 'companyName', label: 'Название вашей компании' },
  { key: 'industry', label: 'Сфера деятельности / ниша' },
  { key: 'product', label: 'Какой товар / услугу вы продаёте?' },
  { key: 'targetAudience', label: 'Кто ваша целевая аудитория?' },
  { key: 'advantages', label: 'Какие основные преимущества вашего предложения?' },
  { key: 'competitors', label: 'Есть ли конкуренты? Чем вы отличаетесь?' },
  { key: 'objections', label: 'Какие возражения чаще всего возникают у клиентов?' },
  { key: 'successCriteria', label: 'Какой итог звонка считаете успешным? (встреча, заявка, продажа)' },
  { key: 'restrictions', label: 'Есть ли ограничения: что ассистент НЕ должен говорить?' },
  { key: 'additionalInfo', label: 'Дополнительная информация' },
];

function BusinessProfilePage({ token, showToast }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState({});
  const [supplementModal, setSupplementModal] = useState(null); // { key, label }
  const [supplementText, setSupplementText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/business-profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setProfile(data);
      if (data?.answers) setAnswers(data.answers);
    } catch (err) {
      console.error('Fetch profile failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const filled = Object.entries(answers).filter(([, v]) => v.trim());
    if (filled.length === 0) {
      showToast?.('Заполните хотя бы одно поле', true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/business-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ answers })
      });
      if (res.ok) {
        showToast?.('Анкета сохранена');
        fetchProfile();
      } else {
        const data = await res.json();
        showToast?.(data.error || 'Ошибка сохранения', true);
      }
    } catch (err) {
      showToast?.('Не удалось сохранить анкету', true);
    } finally {
      setSaving(false);
    }
  };

  const handleSupplement = async () => {
    if (!supplementText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`${API_BASE}/business-profile`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ questionKey: supplementModal.key, note: supplementText.trim() })
      });
      if (res.ok) {
        showToast?.('Дополнение добавлено');
        setSupplementModal(null);
        setSupplementText('');
        fetchProfile();
      } else {
        const data = await res.json();
        showToast?.(data.error || 'Ошибка', true);
      }
    } catch (err) {
      showToast?.('Не удалось добавить дополнение', true);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">О вашем бизнесе</h1></div>
        <div className="empty-state"><RefreshCw size={24} className="spin" /><span>Загрузка...</span></div>
      </div>
    );
  }

  const isSubmitted = profile?.isSubmitted;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">О вашем бизнесе</h1>
        <p className="profile-subtitle">
          {isSubmitted
            ? 'Ваши ответы используются для формирования скрипта. Вы можете дополнить информацию.'
            : 'Заполните анкету, чтобы мы могли создать идеальный скрипт для ваших звонков.'
          }
        </p>
      </div>

      {!isSubmitted ? (
        /* ── Editable questionnaire form ── */
        <form onSubmit={handleSubmit} className="profile-form section">
          <div className="profile-questions">
            {PROFILE_QUESTIONS.map((q, i) => (
              <div key={q.key} className="profile-question-card">
                <div className="profile-question-number">{i + 1}</div>
                <div className="profile-question-body">
                  <label htmlFor={`pq-${q.key}`} className="profile-question-label">{q.label}</label>
                  <textarea
                    id={`pq-${q.key}`}
                    className="profile-question-input"
                    placeholder="Ваш ответ..."
                    value={answers[q.key] || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="profile-submit-row">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : 'Отправить анкету'}
            </button>
          </div>
        </form>
      ) : (
        /* ── Read-only answers with supplement buttons ── */
        <div className="profile-answers section">
          {PROFILE_QUESTIONS.map((q, i) => {
            const answer = profile?.answers?.[q.key];
            const supplements = profile?.supplements?.[q.key] || [];
            if (!answer && supplements.length === 0) return null;
            return (
              <div key={q.key} className="profile-answer-card">
                <div className="profile-answer-header">
                  <div className="profile-question-number">{i + 1}</div>
                  <span className="profile-answer-label">{q.label}</span>
                  <button
                    className="profile-supplement-btn"
                    onClick={() => { setSupplementModal(q); setSupplementText(''); }}
                    title="Дополнить"
                  >
                    <MessageSquarePlus size={14} />
                    <span>Дополнить</span>
                  </button>
                </div>
                <div className="profile-answer-body">
                  <div className="profile-answer-text">
                    <Lock size={12} className="profile-lock-icon" />
                    <span>{answer || '—'}</span>
                  </div>
                  {supplements.length > 0 && (
                    <div className="profile-supplements">
                      {supplements.map((s, si) => (
                        <div key={si} className="profile-supplement-item">
                          <Plus size={10} />
                          <span>{s.text}</span>
                          <span className="profile-supplement-date">
                            {new Date(s.addedAt).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Supplement Modal */}
      {supplementModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSupplementModal(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Дополнить ответ</h2>
              <button type="button" className="modal-close" onClick={() => setSupplementModal(null)} aria-label="Закрыть"><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p className="form-intro">{supplementModal.label}</p>
              <div className="form-group">
                <label htmlFor="supplement-note">Дополнительная информация</label>
                <textarea
                  id="supplement-note"
                  placeholder="Добавьте новые детали..."
                  value={supplementText}
                  onChange={e => setSupplementText(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setSupplementModal(null)}>Отмена</button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingNote || !supplementText.trim()}
                onClick={handleSupplement}
              >
                {savingNote ? 'Сохранение...' : 'Добавить'}
              </button>
            </div>
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
    <div className="outbound-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="outbound-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="outbound-modal-header">
          <h2 className="outbound-modal-title">Новый звонок</h2>
          <button type="button" className="outbound-modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <div className="outbound-modal-body">
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
            <div className="outbound-modal-hint">
              Или используйте пункт «Demo Call» в меню слева для звонка через браузер.
            </div>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // Refetch when user returns to the tab (e.g. after Demo Call)
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') fetchData(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [isAuthenticated, token]);

  if (!isAuthenticated) {
    return <LoginScreen token={token} setToken={setToken} onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Sidebar active={page} onNav={setPage} onLogout={logout} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-hamburger"
              onClick={() => setSidebarOpen(v => !v)}
              aria-label="Меню"
            >
              <Menu size={20} />
            </button>
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
          {page === 'profile' && <BusinessProfilePage token={token} showToast={showToast} />}
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
