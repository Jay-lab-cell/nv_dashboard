'use client';

import React, { useState, useEffect, useCallback } from 'react';

// v3: Python FastAPI 백엔드 URL
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ===== Status Constants =====
const STATUS = {
  WAITING: '대기',
  CONFIRMED: '최초 노출',
  SUCCESS: '건바이 성공',
  FAIL: '미노출 AS',
  UNKNOWN: '판단불가',
  SETTLEMENT: '정산 대기',
  PAID: '입금 완료',
  NOT_FOUND: '미노출',
};

const MANAGERS = ['김동규', '심민정', '이하은', '지건영', '기타 담당자'];
const COMPANIES = ['엘케이', '위너', '블루미디어', '기타B', '기타C'];

// ===== Helper: 기존 '최초노출 확인됨' → '최초 노출' 호환 =====
function normalizeStatus(status) {
  if (status === '최초노출 확인됨') return '최초 노출';
  return status;
}

// ===== Helper Functions =====
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getCountdown(verifiedAt) {
  if (!verifiedAt) return null;
  const target = new Date(verifiedAt);
  const now = new Date();
  const diff = target - now;

  if (diff <= 0) return { text: '검증 가능', className: 'ready', ms: 0 };

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  const text = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const className = hours < 1 ? 'urgent' : '';
  return { text, className, ms: diff };
}

function getStatusBadgeClass(status) {
  return status.replace(/\s+/g, '-');
}

// ===== Toast Component =====
function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === 'success' && '✓'}
          {toast.type === 'error' && '✕'}
          {toast.type === 'info' && 'ℹ'}
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// ===== Main Page Component =====
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('main');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [, setVerifying] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [expandedTask, setExpandedTask] = useState(null);
  const [logs, setLogs] = useState({});
  const [checkingExposure, setCheckingExposure] = useState(null); // taskId being checked
  const [crawlLog, setCrawlLog] = useState(null); // 크롤링 디버그 로그
  const [filter, setFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(true);
  const [, forceUpdate] = useState(0);

  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [autoVerify, setAutoVerify] = useState(true);

  // Form state
  const [keywords, setKeywords] = useState('');
  const [brand, setBrand] = useState('');
  const [manager, setManager] = useState('');
  const [company, setCompany] = useState('');

  const [settlementMonth, setSettlementMonth] = useState('');

  // ---- Toast ----
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ---- Fetch Tasks ----
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/tasks`);
      const data = await res.json();
      if (data.success) {
        // 기존 데이터 호환: '최초노출 확인됨' → '최초 노출'
        const normalized = data.data.map(t => ({ ...t, status: normalizeStatus(t.status) }));
        setTasks(normalized);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Fetch Logs ----
  const fetchLogs = useCallback(async (taskId) => {
    try {
      const res = await fetch(`${API}/api/logs?taskId=${taskId}`);
      const data = await res.json();
      if (data.success) {
        const normalizedLogs = data.data.map(log => ({
          ...log,
          prev_status: log.prev_status ? normalizeStatus(log.prev_status) : log.prev_status,
          new_status: log.new_status ? normalizeStatus(log.new_status) : log.new_status,
        }));
        // 동일 message+new_status 중복 제거 (최신 1건만 유지)
        const seen = new Set();
        const dedupedLogs = normalizedLogs
          .slice()
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .filter(log => {
            const key = `${log.new_status}|${log.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setLogs((prev) => ({ ...prev, [taskId]: dedupedLogs }));
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, []);

  // ---- Submit Form ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!keywords.trim() || !brand.trim() || !manager || !company) {
      addToast('모든 필수 항목을 입력해주세요.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, brand, manager, company }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message, 'success');
        setKeywords('');
        setBrand('');
        setManager('');
        setCompany('');
        await fetchTasks();
      } else {
        addToast(data.error || data.detail || '등록에 실패했습니다.', 'error');
      }
    } catch (error) {
      addToast('등록 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Status Actions ----
  const updateStatus = async (taskId, updates, changedBy = 'USER') => {
    try {
      const res = await fetch(`${API}/api/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, updates, changedBy }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('상태가 변경되었습니다.', 'success');
        await fetchTasks();
      } else {
        addToast(data.error || data.detail || '상태 변경 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      addToast('상태 변경 중 오류가 발생했습니다.', 'error');
    }
  };

  // ---- 최초 노출확인 (크롤러 자동 실행) — SSE 방식 ----
  const handleCheckExposure = async (taskId) => {
    setCheckingExposure(taskId);
    setCrawlLog(null);
    addToast('🔍 최초 노출확인 크롤링을 시작합니다...', 'info');

    try {
      // Step 1: POST — 즉시 jobId 반환 (크롤링은 백그라운드 시작)
      const res = await fetch(`${API}/api/check-exposure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();

      if (!data.success) {
        addToast(data.error || '크롤링 시작 실패', 'error');
        setCheckingExposure(null);
        return;
      }

      const { jobId } = data;

      // Step 2: SSE로 완료 이벤트 수신 (폴링 대체)
      const es = new EventSource(`${API}/api/events/${jobId}`);
      es.onmessage = async (event) => {
        const job = JSON.parse(event.data);
        if (job.status === 'done') {
          es.close();
          setCheckingExposure(null);
          const result = job.result;
          if (result?.found) {
            addToast(`✅ 카페글 ${result.total_posts}개 중 ${result.rank}번째에서 브랜드 노출 확인!`, 'success');
          } else {
            addToast(`⚠️ ${result?.message || '미노출'}`, 'error');
          }
          await fetchTasks();
        } else if (job.status === 'error') {
          es.close();
          setCheckingExposure(null);
          addToast(job.error || '크롤링 실패', 'error');
        }
      };
      es.onerror = () => {
        es.close();
        setCheckingExposure(null);
        addToast('SSE 연결 오류 — 결과를 직접 확인해주세요.', 'error');
      };

    } catch (error) {
      addToast('크롤링 중 오류가 발생했습니다.', 'error');
      setCheckingExposure(null);
    }
  };

  // ---- 현재 순위 조회 — SSE 방식 ----
  const handleCheckCurrentRank = async (taskId) => {
    setCheckingExposure(taskId);
    setCrawlLog(null);
    addToast('현재 순위 조회를 시작합니다...', 'info');

    try {
      // Step 1: POST — 즉시 jobId 반환
      const res = await fetch(`${API}/api/check-current-rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();

      if (!data.success) {
        addToast(data.error || '조회 시작 실패', 'error');
        setCheckingExposure(null);
        return;
      }

      const { jobId } = data;

      // Step 2: SSE로 완료 이벤트 수신 (폴링 대체)
      const es = new EventSource(`${API}/api/events/${jobId}`);
      es.onmessage = async (event) => {
        const job = JSON.parse(event.data);
        if (job.status === 'done') {
          es.close();
          setCheckingExposure(null);
          const result = job.result;
          if (result?.found) {
            addToast(`카페글 ${result.total_posts}개 중 ${result.rank}번째에서 브랜드 노출 확인!`, 'success');
          } else {
            addToast('순위 미발견', 'error');
          }
          await fetchTasks();
          await fetchLogs(taskId);
        } else if (job.status === 'error') {
          es.close();
          setCheckingExposure(null);
          addToast(job.error || '조회 실패', 'error');
        }
      };
      es.onerror = () => {
        es.close();
        setCheckingExposure(null);
        addToast('SSE 연결 오류 — 결과를 직접 확인해주세요.', 'error');
      };

    } catch (error) {
      addToast('순위 조회 중 오류가 발생했습니다.', 'error');
      setCheckingExposure(null);
    }
  };

  // ---- 일괄 노출확인 ----
  const [batchChecking, setBatchChecking] = useState(false);
  const handleBatchCheckExposure = async () => {
    const waitingTasks = tasks.filter(t => t.status === STATUS.WAITING);
    if (waitingTasks.length === 0) {
      addToast('대기 상태인 키워드가 없습니다.', 'info');
      return;
    }
    setBatchChecking(true);
    setCrawlLog(null);
    addToast(`🔍 ${waitingTasks.length}개 키워드 일괄 노출확인을 시작합니다...`, 'info');

    // Step 1: 모든 태스크에 POST 동시 발송 → jobId 수집
    const jobIds = [];
    for (const task of waitingTasks) {
      try {
        const res = await fetch(`${API}/api/check-exposure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id }),
        });
        const data = await res.json();
        if (data.success && data.jobId) jobIds.push(data.jobId);
        else jobIds.push(null);
      } catch {
        jobIds.push(null);
      }
    }

    // Step 2: SSE로 각 job 완료 이벤트 수신 (폴링 대체)
    const validJobIds = jobIds.filter(Boolean);
    let successCount = 0;
    let failCount = waitingTasks.length - validJobIds.length;
    let doneCount = 0;

    const onAllDone = async () => {
      await fetchTasks();
      addToast(`✅ 일괄 확인 완료: 노출 ${successCount}건, 미발견 ${failCount}건`, successCount > 0 ? 'success' : 'error');
      setBatchChecking(false);
    };

    for (const jobId of validJobIds) {
      const es = new EventSource(`${API}/api/events/${jobId}`);
      es.onmessage = async (event) => {
        const job = JSON.parse(event.data);
        if (job.status === 'done' || job.status === 'error') {
          es.close();
          if (job.status === 'done') {
            job.result?.found ? successCount++ : failCount++;
          } else {
            failCount++;
          }
          doneCount++;
          if (doneCount === validJobIds.length) await onAllDone();
        }
      };
      es.onerror = () => {
        es.close();
        failCount++;
        doneCount++;
        if (doneCount === validJobIds.length) onAllDone();
      };
    }

    if (validJobIds.length === 0) {
      setBatchChecking(false);
      addToast('모든 크롤링 시작에 실패했습니다.', 'error');
    }
  };

  const handleSettlement = (taskId) => {
    updateStatus(taskId, { status: STATUS.SETTLEMENT });
  };

  const handlePaid = (taskId) => {
    updateStatus(taskId, { status: STATUS.PAID });
  };

  // ---- 태스크 삭제 ----
  const handleDeleteTask = async (taskId) => {
    if (!confirm('이 키워드를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${API}/api/tasks?taskId=${taskId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        addToast('키워드가 삭제되었습니다.', 'success');
        await fetchTasks();
      } else {
        addToast(data.error || '삭제 실패', 'error');
      }
    } catch (error) {
      addToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  // ---- 태스크 리셋 (재작업) ----
  const handleResetTask = async (taskId) => {
    if (!confirm('이 키워드를 대기 상태로 되돌리고 재작업 하시겠습니까?')) return;
    try {
      const updates = {
        status: STATUS.WAITING,
        initial_rank: '',
        current_rank: '',
        url: '',
        initial_url: '',
        verified_at: ''
      };
      const res = await fetch(`${API}/api/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, updates, changedBy: 'USER' }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('키워드가 대기 상태로 변경되었습니다.', 'success');
        await fetchTasks();
      } else {
        addToast(data.error || '재작업 실패', 'error');
      }
    } catch (error) {
      addToast('재작업 중 오류가 발생했습니다.', 'error');
    }
  };

  // ---- Verification ----
  const runVerification = async () => {
    setVerifying(true);
    addToast('24시간 검증을 시작합니다...', 'info');

    try {
      // Step 1: POST — 즉시 jobId 반환
      const res = await fetch(`${API}/api/verify`, { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        addToast(data.error || '검증 실패', 'error');
        setVerifying(false);
        return;
      }

      // 검증 대상 없으면 즉시 종료
      if (!data.jobId) {
        addToast('검증 대상이 없습니다.', 'info');
        setVerifying(false);
        return;
      }

      const { jobId } = data;

      // Step 2: SSE로 완료 이벤트 수신 (폴링 대체)
      const es = new EventSource(`${API}/api/events/${jobId}`);
      es.onmessage = async (event) => {
        const job = JSON.parse(event.data);
        if (job.status === 'done') {
          es.close();
          setVerifying(false);
          addToast(job.result?.message || '검증 완료', 'success');
          await fetchTasks();
        } else if (job.status === 'error') {
          es.close();
          setVerifying(false);
          addToast(job.error || '검증 실패', 'error');
        }
      };
      es.onerror = () => {
        es.close();
        setVerifying(false);
        addToast('SSE 연결 오류 — 결과를 직접 확인해주세요.', 'error');
      };

    } catch (error) {
      addToast('검증 중 오류가 발생했습니다.', 'error');
      setVerifying(false);
    }
  };

  // ---- Toggle Accordion ----
  const toggleExpand = (taskId) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
      if (!logs[taskId]) {
        fetchLogs(taskId);
      }
    }
  };

  // ---- Timer Tick ----
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate((n) => n + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ---- Initial Load & Polling ----
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000); // 30초마다 갱신
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // ---- Auto Verification Check (매 5분) ----
  useEffect(() => {
    const check = async () => {
      if (!autoVerify) return;
      try {
        const res = await fetch(`${API}/api/scheduler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' }),
        });
        const data = await res.json();
        if (data.success && data.pendingCount > 0) {
          addToast(`${data.pendingCount}개 태스크 검증 대기 중`, 'info');
          // 자동 검증 실행
          runVerification();
        }
      } catch (error) {
        console.error('Scheduler check failed:', error);
      }
    };

    const interval = setInterval(check, 5 * 60 * 1000); // 5분마다
    return () => clearInterval(interval);
  }, [addToast, autoVerify]);

  // ---- Filter Tasks ----
  const mainStatuses = [STATUS.WAITING, STATUS.CONFIRMED, STATUS.SUCCESS, STATUS.FAIL, STATUS.UNKNOWN, STATUS.NOT_FOUND];
  const settlementStatuses = [STATUS.SETTLEMENT, STATUS.PAID];

  const filteredTasks = tasks.filter((task) => {
    if (activeTab === 'main') {
      if (!mainStatuses.includes(task.status)) return false;
      if (filter === 'all') return true;
      if (filter === STATUS.WAITING) return task.status === STATUS.WAITING;
      if (filter === STATUS.CONFIRMED) return task.status === STATUS.CONFIRMED;
      if (filter === STATUS.SUCCESS) return task.status === STATUS.SUCCESS;
      if (filter === STATUS.FAIL) return task.status === STATUS.FAIL;
      if (filter === STATUS.UNKNOWN) return task.status === STATUS.UNKNOWN;
      if (filter === STATUS.NOT_FOUND) return task.status === STATUS.NOT_FOUND;
      return true;
    } else {
      if (!settlementStatuses.includes(task.status)) return false;
      if (settlementMonth && !task.updated_at?.startsWith(settlementMonth)) return false;
      return true;
    }
  });

  // ---- Stats ----
  // 정산 아카이브: 업체별 건수 합산
  const companyCounts = filteredTasks.reduce((acc, current) => {
    if (activeTab === 'settlement') {
      acc[current.company] = (acc[current.company] || 0) + 1;
    }
    return acc;
  }, {});

  // 정산일 월 옵션 (동적 생성)
  const settlementMonths = [...new Set(
    tasks
      .filter(t => settlementStatuses.includes(t.status))
      .map(t => t.updated_at?.substring(0, 7))
      .filter(Boolean)
  )].sort().reverse();

  const stats = {
    total: tasks.filter((t) => mainStatuses.includes(t.status)).length,
    waiting: tasks.filter((t) => t.status === STATUS.WAITING).length,
    confirmed: tasks.filter((t) => t.status === STATUS.CONFIRMED).length,
    success: tasks.filter((t) => t.status === STATUS.SUCCESS).length,
    fail: tasks.filter((t) => t.status === STATUS.FAIL).length,
    unknown: tasks.filter((t) => t.status === STATUS.UNKNOWN).length,
    settlement: tasks.filter((t) => t.status === STATUS.SETTLEMENT).length,
    paid: tasks.filter((t) => t.status === STATUS.PAID).length,
  };

  // ---- Render Action Buttons ----
  const renderActions = (task) => {
    const buttons = [];
    const isChecking = checkingExposure === task.id;

    // 최초 노출확인 버튼 (대기 상태에서만)
    if (task.status === STATUS.WAITING) {
      buttons.push(
        <button
          key="confirm"
          className="action-btn confirm"
          onClick={(e) => {
            e.stopPropagation();
            handleCheckExposure(task.id);
          }}
          disabled={isChecking || checkingExposure !== null}
        >
          {isChecking ? (<><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }}></span> 검색 중...</>) : '최초 노출확인'}
        </button>
      );
    }

    if (task.status === STATUS.CONFIRMED) {
      const cd = getCountdown(task.verified_at);
      if (cd && cd.ms <= 0) {
        buttons.push(
          <button
            key="verify"
            className="action-btn verify"
            onClick={(e) => { e.stopPropagation(); runVerification(); }}
          >
            검증 실행
          </button>
        );
      }
    }

    if (task.status === STATUS.SUCCESS) {
      buttons.push(
        <button
          key="settle"
          className="action-btn settle"
          onClick={(e) => { e.stopPropagation(); handleSettlement(task.id); }}
        >
          정산 이관
        </button>
      );
    }

    if (task.status === STATUS.SETTLEMENT) {
      buttons.push(
        <button
          key="paid"
          className="action-btn paid"
          onClick={(e) => { e.stopPropagation(); handlePaid(task.id); }}
        >
          입금 완료
        </button>
      );
    }

    // 순위조회 버튼 (대기 상태 제외)
    if (activeTab === 'main' && task.status !== STATUS.WAITING) {
      buttons.push(
        <button
          key="check-rank"
          className="action-btn"
          style={{ background: 'rgba(10,132,255,0.1)', color: 'var(--accent-blue)', border: '1px solid rgba(10,132,255,0.2)' }}
          onClick={(e) => { e.stopPropagation(); handleCheckCurrentRank(task.id); }}
          disabled={isChecking || checkingExposure !== null}
        >
          {isChecking ? '조회 중...' : '순위조회'}
        </button>
      );
    }

    // 재작업 버튼 (대기 상태 제외 모든 키워드에 항상 표시)
    if (task.status !== STATUS.WAITING) {
      buttons.push(
        <button
          key="rework"
          className="action-btn"
          style={{
            background: 'rgba(255,159,10,0.1)',
            color: 'var(--accent-amber)',
            border: '1px solid rgba(255,159,10,0.25)',
          }}
          onClick={(e) => { e.stopPropagation(); handleResetTask(task.id); }}
        >
          재작업
        </button>
      );
    }

    // 삭제 버튼 (모든 상태에서 가능)
    buttons.push(
      <button
        key="delete"
        className="action-btn"
        style={{
          color: 'var(--accent-rose)',
          background: 'rgba(244,63,94,0.08)',
          border: '1px solid rgba(244,63,94,0.2)',
        }}
        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
        title="삭제"
      >
        ✕
      </button>
    );

    return <div className="action-btn-group">{buttons}</div>;
  };

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* ===== GNB ===== */}
      <nav className="gnb" id="gnb">
        <div className="gnb-inner">
          <div className="gnb-logo">
            <div className="gnb-logo-icon">N</div>
            N-Monitor
          </div>

          <div className="gnb-tabs">
            <button
              className={`gnb-tab ${activeTab === 'main' ? 'active' : ''}`}
              onClick={() => { setActiveTab('main'); setFilter('all'); }}
              id="tab-main"
            >
              메인 대시보드
            </button>
            <button
              className={`gnb-tab ${activeTab === 'settlement' ? 'active' : ''}`}
              onClick={() => {
                if (!isAdminAuth) {
                  const pw = window.prompt("관리자 비밀번호를 입력해주세요:");
                  if (pw === "1029") {
                    setIsAdminAuth(true);
                    setActiveTab('settlement');
                  } else if (pw !== null) {
                    addToast("비밀번호가 일치하지 않습니다.", "error");
                  }
                } else {
                  setActiveTab('settlement');
                }
              }}
              id="tab-settlement"
            >
              정산 아카이브
              {stats.settlement > 0 && (
                <span style={{
                  marginLeft: '6px',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-indigo-glow)',
                  color: 'var(--accent-indigo)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}>
                  {stats.settlement}
                </span>
              )}
            </button>
          </div>

          <div className="gnb-status" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setAutoVerify(!autoVerify)}
              style={{
                background: autoVerify ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                color: autoVerify ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                border: `1px solid ${autoVerify ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                padding: '4px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {autoVerify ? '24H 자동 모니터링 ON' : '24H 자동 모니터링 OFF'}
            </button>
            <div
              className="gnb-status-dot"
              title="시스템 활성화"
              style={!autoVerify ? { backgroundColor: 'var(--accent-rose)', boxShadow: '0 0 8px var(--accent-rose)' } : {}}
            ></div>
          </div>
        </div>
      </nav>

      {/* ===== Main Content ===== */}
      <main className="main-container">
        {/* Stats Bar */}
        {activeTab === 'main' && (
          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-label">전체 활성</div>
              <div className="stat-value">{stats.total}<span className="unit">건</span></div>
            </div>
            <div className="stat-card info">
              <div className="stat-label">대기</div>
              <div className="stat-value">{stats.waiting}<span className="unit">건</span></div>
            </div>
            <div className="stat-card" style={{ '--stat-color': 'var(--accent-indigo)' }}>
              <div className="stat-label">최초 노출</div>
              <div className="stat-value" style={{ color: 'var(--accent-indigo)' }}>{stats.confirmed}<span className="unit">건</span></div>
            </div>
            <div className="stat-card success">
              <div className="stat-label">건바이 성공</div>
              <div className="stat-value">{stats.success}<span className="unit">건</span></div>
            </div>
            <div className="stat-card danger">
              <div className="stat-label">미노출 AS</div>
              <div className="stat-value">{stats.fail}<span className="unit">건</span></div>
            </div>
            <div className="stat-card warning">
              <div className="stat-label">판단불가</div>
              <div className="stat-value">{stats.unknown}<span className="unit">건</span></div>
            </div>
          </div>
        )}

        {activeTab === 'settlement' && (
          <div className="stats-bar">
            <div className="stat-card" style={{ '--stat-color': 'var(--accent-violet)' }}>
              <div className="stat-label">정산 대기</div>
              <div className="stat-value" style={{ color: 'var(--accent-violet)' }}>{stats.settlement}<span className="unit">건</span></div>
            </div>
            <div className="stat-card success">
              <div className="stat-label">입금 완료</div>
              <div className="stat-value">{stats.paid}<span className="unit">건</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-label">총 정산</div>
              <div className="stat-value">{stats.settlement + stats.paid}<span className="unit">건</span></div>
            </div>
          </div>
        )}

        {/* ===== Settlement Company Counts & Filters ===== */}
        {activeTab === 'settlement' && (
          <div className="grid-wrapper" style={{ marginBottom: '20px' }}>
            <div className="grid-header" style={{ flexWrap: 'wrap' }}>
              <div className="grid-title">🏢 업체별 정산내역</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>정산일 필터:</span>
                <select
                  className="form-input"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
                  value={settlementMonth}
                  onChange={(e) => setSettlementMonth(e.target.value)}
                >
                  <option value="">전체</option>
                  {settlementMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px' }}>
              {Object.keys(companyCounts).length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>검색 결과가 없습니다.</div>
              ) : (
                Object.entries(companyCounts).map(([c, count]) => (
                  <div key={c} style={{
                    background: 'var(--bg-glass)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    minWidth: '150px'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{c}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {count}<span style={{ fontSize: '0.85rem', fontWeight: 600 }}> 건</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ===== Input Form (Main only) ===== */}
        {activeTab === 'main' && (
          <div className="input-form-wrapper" id="input-form">
            <div className="input-form-header">
              <h2 className="input-form-title">키워드 등록</h2>
              <button
                className="input-form-toggle"
                onClick={() => setFormOpen(!formOpen)}
              >
                {formOpen ? '접기 ▲' : '펼치기 ▼'}
              </button>
            </div>

            {formOpen && (
              <form onSubmit={handleSubmit}>
                <div className="input-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-keywords">키워드 (줄바꿈으로 다중 입력)</label>
                    <textarea
                      id="input-keywords"
                      className="form-textarea"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      rows={3}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="input-brand">브랜드명</label>
                    <input
                      type="text"
                      id="input-brand"
                      className="form-input"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="select-manager">담당자</label>
                    <select
                      id="select-manager"
                      className="form-select"
                      value={manager}
                      onChange={(e) => setManager(e.target.value)}
                      required
                    >
                      <option value="">선택</option>
                      {MANAGERS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="select-company">업체</label>
                    <select
                      id="select-company"
                      className="form-select"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      required
                    >
                      <option value="">선택</option>
                      {COMPANIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="form-submit-btn"
                    disabled={submitting}
                    id="btn-submit"
                  >
                    {submitting ? <><span className="spinner"></span></> : '등록'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ===== Data Grid ===== */}
        <div className="grid-wrapper" id="data-grid">
          <div className="grid-header">
            <div className="grid-title">
              {activeTab === 'main' ? '📋 모니터링 태스크' : '💰 정산 아카이브'}
              <span className="grid-count">{filteredTasks.length}</span>
            </div>

            {activeTab === 'main' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="grid-filters">
                  {[
                    { key: 'all', label: '전체' },
                    { key: STATUS.WAITING, label: '대기' },
                    { key: STATUS.CONFIRMED, label: '노출확인' },
                    { key: STATUS.SUCCESS, label: '성공' },
                    { key: STATUS.FAIL, label: '미노출AS' },
                    { key: STATUS.NOT_FOUND, label: '미노출(검색결과없음)' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      className={`grid-filter-btn ${filter === f.key ? 'active' : ''}`}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {stats.waiting > 0 && (
                  <button
                    className="gnb-verify-btn"
                    onClick={handleBatchCheckExposure}
                    disabled={batchChecking || checkingExposure !== null}
                    style={{ fontSize: '0.78rem', padding: '5px 14px' }}
                  >
                    {batchChecking ? (
                      <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }}></span> 일괄 확인 중...</>
                    ) : (
                      `🔍 일괄 노출확인 (${stats.waiting}건)`
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="loading-overlay">
              <span className="spinner"></span>
              데이터를 불러오는 중...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                {activeTab === 'main' ? '📭' : '💼'}
              </div>
              <div className="empty-state-text">
                {activeTab === 'main' ? '등록된 키워드가 없습니다' : '정산 대기 중인 항목이 없습니다'}
              </div>
              <div className="empty-state-sub">
                {activeTab === 'main' ? '상단 폼에서 키워드를 등록해주세요' : '건바이 성공 후 정산 이관해주세요'}
              </div>
            </div>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th>등록일</th>
                  <th>키워드</th>
                  <th>브랜드명</th>
                  <th>담당자</th>
                  <th>업체</th>
                  <th>상태</th>
                  {activeTab === 'main' && <th>최초/현재순위</th>}
                  {activeTab === 'main' && <th>24H 예정</th>}
                  {activeTab === 'main' && <th>링크</th>}
                  {activeTab === 'settlement' && <th>정산이관일</th>}
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <React.Fragment key={task.id}>
                    <tr
                      onClick={() => toggleExpand(task.id)}
                      style={{
                        background: expandedTask === task.id ? 'var(--bg-glass-hover)' : undefined,
                      }}
                    >
                      <td>{formatDate(task.created_at)}</td>
                      <td className="keyword">{task.keyword}</td>
                      <td className="brand">{task.brand}</td>
                      <td>{task.manager}</td>
                      <td>{task.company}</td>
                      <td>
                        <span className={`status-badge ${getStatusBadgeClass(task.status)}`}>
                          {task.status}
                        </span>
                      </td>
                      {activeTab === 'main' && (
                        <td>
                          {task.initial_rank || '-'}<span style={{ color: 'var(--accent-blue)', fontWeight: 700, margin: '0 5px' }}>/</span>{task.current_rank || '-'}
                        </td>
                      )}
                      {activeTab === 'main' && (
                        <td>
                          {task.status === STATUS.CONFIRMED && task.verified_at ? (
                            (() => {
                              const cd = getCountdown(task.verified_at);
                              return cd ? (
                                <span className={`countdown ${cd.className}`}>
                                  ⏱ {cd.text}
                                </span>
                              ) : '-';
                            })()
                          ) : task.verified_at ? (
                            formatDate(task.verified_at)
                          ) : '-'}
                        </td>
                      )}
                      {activeTab === 'main' && (
                        <td>
                          {task.url ? (
                            <a
                              href={task.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link-cell"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {task.url.length > 30 ? task.url.substring(0, 30) + '...' : task.url}
                            </a>
                          ) : '-'}
                        </td>
                      )}
                      {activeTab === 'settlement' && <td>{formatDate(task.updated_at)}</td>}
                      <td onClick={(e) => e.stopPropagation()}>
                        {renderActions(task)}
                      </td>
                    </tr>

                    {/* Accordion Log Panel */}
                    {expandedTask === task.id && (
                      <tr key={`${task.id}-log`}>
                        <td colSpan={activeTab === 'main' ? 10 : 8} style={{ padding: 0 }}>
                          <div className="log-panel">
                            <div className="log-panel-inner">
                              <div className="log-panel-title">📝 상태 변경 로그</div>
                              {logs[task.id] ? (
                                logs[task.id].length > 0 ? (
                                  logs[task.id].map((log) => (
                                    <div key={log.id} className="log-entry" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                                        <span className="log-time">{formatDate(log.created_at)}</span>
                                        <span className={`status-badge ${getStatusBadgeClass(log.prev_status || '신규')}`}>
                                          {log.prev_status || '신규'}
                                        </span>
                                        <span className="log-arrow">→</span>
                                        <span className={`status-badge ${getStatusBadgeClass(log.new_status)}`}>
                                          {log.new_status}
                                        </span>
                                        <span className="log-actor">{log.changed_by}</span>
                                      </div>
                                      {log.message && (
                                        <div style={{
                                          fontSize: '0.75rem',
                                          color: 'var(--text-muted)',
                                          paddingLeft: '4px',
                                          lineHeight: '1.4',
                                          wordBreak: 'break-all',
                                        }}>
                                          💬 {log.message}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    로그가 없습니다.
                                  </div>
                                )
                              ) : (
                                <div className="loading-overlay" style={{ padding: '12px' }}>
                                  <span className="spinner"></span>
                                  로그 불러오는 중...
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ===== 크롤링 디버그 로그 (테스트용) ===== */}
        {crawlLog && crawlLog.length > 0 && (
          <div className="grid-wrapper" id="crawl-log" style={{ marginTop: '16px' }}>
            <div className="grid-header">
              <div className="grid-title">
                🔍 크롤링 디버그 로그
                <span className="grid-count">{crawlLog.length}</span>
              </div>
              <button
                className="grid-filter-btn"
                onClick={() => setCrawlLog(null)}
                style={{ fontSize: '0.78rem' }}
              >
                닫기 ✕
              </button>
            </div>

            <div style={{ padding: '12px 16px', fontSize: '0.82rem', lineHeight: '1.8' }}>
              {crawlLog.map((log, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px',
                  marginBottom: '6px',
                  borderRadius: 'var(--radius-sm)',
                  background: log.step === 'ERROR'
                    ? 'rgba(255,69,58,0.08)'
                    : log.brandFound === true
                      ? 'rgba(48,209,88,0.08)'
                      : 'var(--bg-glass)',
                  border: log.brandFound === true
                    ? '1px solid rgba(48,209,88,0.3)'
                    : log.step === 'ERROR'
                      ? '1px solid rgba(255,69,58,0.3)'
                      : '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: log.step === 'SEARCH' ? 'var(--accent-indigo-glow)'
                        : log.step === 'COLLECT' ? 'rgba(255,214,10,0.15)'
                          : log.step === 'CHECK' ? 'rgba(10,132,255,0.15)'
                            : 'rgba(255,69,58,0.15)',
                      color: log.step === 'SEARCH' ? 'var(--accent-indigo)'
                        : log.step === 'COLLECT' ? '#ffd60a'
                          : log.step === 'CHECK' ? 'var(--accent-blue)'
                            : 'var(--accent-red)',
                    }}>
                      {log.step}
                    </span>

                    {log.rank && (
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        [{log.rank}위]
                      </span>
                    )}

                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {log.title}
                    </span>

                    {log.brandFound === true && (
                      <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>✅ 브랜드 발견</span>
                    )}
                    {log.brandFound === false && log.step === 'CHECK' && (
                      <span style={{ color: 'var(--text-muted)' }}>미발견</span>
                    )}
                    {log.error && (
                      <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem' }}>⚠ {log.error}</span>
                    )}
                  </div>

                  {log.url && (
                    <div style={{ marginTop: '4px' }}>
                      <a
                        href={log.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-cell"
                        style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}
                      >
                        {log.url}
                      </a>
                    </div>
                  )}

                  {/* COLLECT 단계: 수집된 전체 URL 목록 */}
                  {log.step === 'COLLECT' && log.urls && log.urls.length > 0 && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'var(--bg-page)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                    }}>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                        📋 수집된 카페 게시글 목록:
                      </div>
                      {log.urls.map((u, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', padding: '2px 0', alignItems: 'baseline' }}>
                          <span style={{ color: 'var(--accent-indigo)', fontWeight: 700, minWidth: '25px' }}>
                            #{u.rank}
                          </span>
                          <a
                            href={u.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-cell"
                            style={{ wordBreak: 'break-all' }}
                          >
                            {u.title || u.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
