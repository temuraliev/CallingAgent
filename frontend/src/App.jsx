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

function TranscriptPanel({ call, onClose }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(call?.duration || 0);
  const audioRef = useRef(null);

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

  const lines = call?.aiSummary
    ? [{ speaker: 'AI Summary', time: '—', text: call.aiSummary }]
    : [
      { speaker: 'Агент', time: '0:05', text: 'Здравствуйте! Чем могу помочь?' },
      { speaker: call?.callerName || 'Клиент', time: '0:12', text: 'Меня интересует ваш продукт.' },
      { speaker: 'Агент', time: '0:25', text: 'Отлично, расскажу подробнее о наших предложениях.' },
    ];

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

      {/* Lines */}
      <div className="transcript-lines">
        {lines.map((l, i) => (
          <div key={i} className="transcript-line">
            <div className="transcript-line-header">
              <div className="transcript-avatar">{l.speaker[0]}</div>
              <span className="transcript-speaker">{l.speaker}</span>
              <span className="transcript-time">{l.time}</span>
            </div>
            <p className="transcript-text">{l.text}</p>
          </div>
        ))}
      </div>

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
                <button className="audio-skip" onClick={() => skip(-5)}>
                  <span>-5</span>
                </button>
                <button
                  className="audio-play"
                  onClick={togglePlay}
                >
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button className="audio-skip" onClick={() => skip(5)}>
                  <span>+5</span>
                </button>
              </div>
              <span className="audio-time">{fmt(duration)}</span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', padding: '10px 0' }}>
            Аудиозапись недоступна
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

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
            className="btn btn-primary"
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '4px', background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
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

      {/* Metrics */}
      <div className="metrics-grid">
        <MetricCard
          title="Всего звонков"
          value={stats?.total ?? '—'}
          icon={PhoneCall}
          gradient="blue"
          trend="+12% за неделю"
        />
        <MetricCard
          title="Общая длительность"
          value={stats?.totalDuration ? `${Math.floor(stats.totalDuration / 3600)}ч ${Math.floor((stats.totalDuration % 3600) / 60)}м` : '—'}
          icon={Clock}
          gradient="purple"
        />
        <MetricCard
          title="Горячие лиды"
          value={stats?.byTemperature?.hot ?? '—'}
          icon={Zap}
          gradient="orange"
          trend="🔥 актив"
        />
        <MetricCard
          title="Прогноз стоимости"
          value={stats?.total ? `$${Math.round(stats.total * 0.08)}` : '—'}
          icon={TrendingUp}
          gradient="green"
          sub="На основе длительности"
        />
      </div>

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

function CallsPage({ calls, loading, onSelectCall }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = calls.filter(c => {
    const matchSearch = !search ||
      (c.callerPhone || '').includes(search) ||
      (c.callerName || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || c.callType === filter || c.leadTemperature === filter;
    return matchSearch && matchFilter;
  });

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
          <CallsTable calls={filtered} onSelectCall={onSelectCall} />
        )}
      </div>
    </div>
  );
}

// ─── Calls Table ─────────────────────────────────────────────────────────────

function CallsTable({ calls, onSelectCall }) {
  if (!calls.length) {
    return (
      <div className="empty-state">
        <Phone size={24} />
        <span>Нет звонков</span>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Лид / Номер</th>
            <th>Длительность</th>
            <th>Статус</th>
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

// ─── Scripts Page (placeholder) ───────────────────────────────────────────────

function ScriptsPage() {
  const nodes = [
    { id: 1, label: 'Приветствие', type: 'start' },
    { id: 2, label: 'Квалификация', type: 'node' },
    { id: 3, label: 'Обработка возражений', type: 'warn' },
    { id: 4, label: 'Закрытие', type: 'node' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Call Script Builder</h1>
        <button className="btn-primary">+ Новый скрипт</button>
      </div>

      <div className="script-canvas">
        {nodes.map((n, i) => (
          <React.Fragment key={n.id}>
            <div className={`script-node script-node--${n.type}`}>
              <span>{n.label}</span>
            </div>
            {i < nodes.length - 1 && (
              <div className="script-arrow">↓</div>
            )}
          </React.Fragment>
        ))}
      </div>
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
        body: JSON.stringify({ phoneNumber: phone, customerName: name })
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

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [callsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/calls?limit=50`, { headers }),
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

  // auto-refresh
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
            <CallsPage calls={calls} loading={loading} onSelectCall={setSelectedCall} />
          )}
          {page === 'scripts' && <ScriptsPage />}
          {page === 'benchmark' && <BenchmarkPage token={token} />}
          {page === 'settings' && (
            <div className="page">
              <div className="page-header"><h1 className="page-title">Настройки</h1></div>
              <p className="text-slate-500">Настройки будут добавлены позже.</p>
            </div>
          )}
        </div>
      </main>

      {/* Transcript side panel */}
      {selectedCall && (
        <div className="transcript-overlay">
          <TranscriptPanel call={selectedCall} onClose={() => setSelectedCall(null)} />
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
    </div>
  );
}
