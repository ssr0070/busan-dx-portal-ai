(function () {
  'use strict';

  // ───── 상수 ─────
  const STORAGE_KEY = 'bipa-portal:inquiries';
  const REFRESH_MS  = 30000;
  const DRAFT_FAIL_MSG = 'AI가 응답을 못 받았어요. 잠시 후 다시 시도해주세요.';

  const CATEGORIES = [
    'AI·DX 솔루션',
    '데이터·클라우드 바우처',
    '교육·인재양성',
    '스타트업 입주·창업',
    '게임·콘텐츠',
    '해외진출',
    '기타',
  ];
  const STATUSES = ['접수', '검토중', '답변완료', '보류'];

  // ───── DOM ─────
  const form        = document.getElementById('inquiry-form');
  const errorBox    = document.getElementById('form-error');
  const listEl      = document.getElementById('inquiry-list');
  const countEl     = document.getElementById('count');
  const catFilterEl = document.getElementById('filter-category');
  const stFilterEl  = document.getElementById('filter-status');
  const modeToggle  = document.getElementById('mode-toggle');

  // ───── 상태 ─────
  let inquiries    = [];
  let nextId       = 1;
  let activeCat    = '전체';
  let activeStatus = '전체';
  let activeMode   = 'user';
  const draftingIds = new Set();   // ✨ 초안 생성 진행 중인 문의 id (이중 클릭 잠금)

  // ───── localStorage ─────
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch (_e) {
      return null;
    }
  }
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: inquiries, nextId }));
    } catch (_e) { /* 시크릿/저장 차단 환경 — 무시 */ }
  }

  // ───── 시드 (답변 빈 문의 ≥1건 포함 — 첫 ✨ 스모크 테스트용) ─────
  function seed() {
    const now = Date.now();
    inquiries = [
      { id: 1, category: 'AI·DX 솔루션',          status: '접수',     title: 'AI 솔루션 실증 비용 지원 가능한가요?', name: '김도윤', content: '제조 현장에 AI 비전 검사 솔루션을 도입하려고 합니다. 실증 비용을 일부 지원받을 수 있는지 문의드립니다.', answer: '', createdAt: now - 1000 * 30 },
      { id: 2, category: '데이터·클라우드 바우처', status: '검토중',   title: '데이터 바우처 신청 기간이 언제인가요?', name: '이서연', content: '올해 데이터 바우처 사업의 신청 기간과 제출 서류 안내 부탁드립니다.', answer: '', createdAt: now - 1000 * 60 * 8 },
      { id: 3, category: '스타트업 입주·창업',     status: '답변완료', title: '센텀 스타트업 입주 자격 문의', name: '박지훈', content: '센텀기술창업타운 입주 자격 및 심사 일정이 궁금합니다. 예비창업자도 가능한가요?', answer: '안녕하세요, 부산정보산업진흥원입니다.\n센텀기술창업타운은 예비창업자도 입주 신청이 가능하며, 심사는 분기별로 진행됩니다.\n자세한 자격 요건은 누리집 공고문을 확인해 주시고, 추가 문의는 입주지원팀으로 연락 주시기 바랍니다.', createdAt: now - 1000 * 60 * 60 * 3 },
      { id: 4, category: '게임·콘텐츠',           status: '보류',     title: 'Bu:Star 게임 제작비 신청 절차', name: '최하늘', content: 'Bu:Star 게임 제작 지원사업의 제작비 신청 절차와 평가 기준을 알고 싶습니다.', answer: '', createdAt: now - 1000 * 60 * 60 * 24 },
      { id: 5, category: '교육·인재양성',         status: '답변완료', title: 'AI 활용 교육과정 일정 안내 부탁드립니다', name: '정유나', content: '시민·재직자 대상 AI 활용 교육과정의 하반기 일정과 신청 방법을 안내해주시면 감사하겠습니다.', answer: '안녕하세요, 부산정보산업진흥원입니다.\n하반기 AI 활용 교육과정은 9월부터 순차 개설되며, 신청은 진흥원 누리집 교육신청 메뉴에서 가능합니다.\n과정별 일정이 확정되는 대로 공지해 드리겠습니다.', createdAt: now - 1000 * 60 * 60 * 24 * 3 },
    ];
    nextId = 6;
    saveToStorage();
  }

  // 최초 진입 시드 + 모두 삭제 상태 보존(재시드 X) + answer 필드 마이그레이션
  (function init() {
    const loaded = loadFromStorage();
    if (loaded === null) {
      seed();
    } else {
      inquiries = loaded.items;
      inquiries.forEach(i => { if (typeof i.answer !== 'string') i.answer = ''; });
      nextId = loaded.nextId || (inquiries.reduce((m, i) => Math.max(m, i.id), 0) + 1);
    }
  })();

  // ───── 유틸 ─────
  function relativeTime(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return '방금';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    const week = Math.floor(day / 7);
    if (week < 5) return `${week}주 전`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}개월 전`;
    const year = Math.floor(day / 365);
    return `${year}년 전`;
  }
  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // ───── 필터 칩 렌더 ─────
  function renderChips() {
    catFilterEl.innerHTML = ['전체', ...CATEGORIES]
      .map(c => `<button type="button" class="chip ${c === activeCat ? 'active' : ''}" data-filter="cat" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
      .join('');
    stFilterEl.innerHTML = ['전체', ...STATUSES]
      .map(s => `<button type="button" class="chip ${s === activeStatus ? 'active' : ''}" data-filter="status" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
      .join('');
  }

  function statusClass(s) {
    return `badge badge-status-${s}`;
  }

  // ───── 목록 렌더 ─────
  function renderList() {
    const filtered = inquiries
      .filter(i => activeCat === '전체' || i.category === activeCat)
      .filter(i => activeStatus === '전체' || i.status === activeStatus)
      .sort((a, b) => b.createdAt - a.createdAt);

    countEl.textContent = `총 ${filtered.length}건 / 전체 ${inquiries.length}건`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <li class="card p-8 text-center text-slate-500">
          조건에 해당하는 문의가 없습니다.
        </li>`;
      return;
    }

    listEl.innerHTML = filtered.map(item => {
      const drafting = draftingIds.has(item.id);
      const statusOptions = STATUSES
        .map(s => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`)
        .join('');
      return `
      <li class="card p-5" data-id="${item.id}" data-status="${escapeHtml(item.status)}" data-has-answer="${item.answer ? '1' : '0'}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge badge-cat">${escapeHtml(item.category)}</span>
              <span class="${statusClass(item.status)}">${escapeHtml(item.status)}</span>
            </div>
            <h3 class="mt-2 text-base font-bold text-slate-900 break-words">
              ${escapeHtml(item.title)}
            </h3>
            <div class="mt-1 text-sm text-slate-500">
              <span class="font-medium text-slate-700">${escapeHtml(item.name)}</span>
              <span class="mx-1.5 text-slate-300">·</span>
              <span>${relativeTime(item.createdAt)}</span>
            </div>
            <p class="mt-3 text-slate-700 whitespace-pre-line break-words">
              ${escapeHtml(item.content)}
            </p>

            <!-- 사용자 답변 표시 (사용자 모드: 답변완료만 / 관리자 모드: 답변 있으면) -->
            <div class="answer-block">
              <div class="text-xs font-bold text-slate-500 mb-1">관리자 답변</div>
              <p class="whitespace-pre-line break-words text-slate-700">${escapeHtml(item.answer)}</p>
            </div>

            <!-- 관리자 컨트롤 (관리자 모드에서만 표시) -->
            <div class="admin-only mt-4 space-y-3">
              <div class="flex items-center gap-2">
                <label class="text-xs font-bold text-slate-500">상태</label>
                <select class="status-select field" data-action="status-change" data-id="${item.id}">
                  ${statusOptions}
                </select>
              </div>
              <div>
                <button type="button" class="btn-draft-reply" data-id="${item.id}" ${drafting ? 'disabled' : ''}>${drafting ? 'AI가 초안을 작성 중입니다…' : '✨ AI 답변 초안 만들기'}</button>
              </div>
              <textarea class="field" data-action="answer-input" data-id="${item.id}" rows="3" placeholder="관리자 답변을 입력하세요">${escapeHtml(item.answer)}</textarea>
              <div class="error-box hidden" data-error-for="${item.id}" role="alert"></div>
              <div class="flex justify-end">
                <button type="button" class="btn-primary" data-action="answer-save" data-id="${item.id}">답변 저장</button>
              </div>
            </div>
          </div>
          <button type="button" class="btn-ghost shrink-0" data-action="delete" data-id="${item.id}">
            삭제
          </button>
        </div>
      </li>`;
    }).join('');

    // 함정 ② — ✨ 버튼은 마크업(위) + 이벤트 등록(아래) 둘 다 있어야 동작.
    // innerHTML 교체 후 매 렌더마다 클릭 핸들러 재등록.
    listEl.querySelectorAll('.btn-draft-reply').forEach(btn => {
      btn.addEventListener('click', onDraftReplyClick);
    });
  }

  function renderAll() {
    renderChips();
    renderList();
  }

  // ───── 모드 토글 ─────
  function updateToggleActive() {
    modeToggle.querySelectorAll('[data-mode-target]').forEach(b =>
      b.classList.toggle('active', b.dataset.modeTarget === activeMode));
  }
  modeToggle.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode-target]');
    if (!t) return;
    activeMode = t.dataset.modeTarget;
    document.body.dataset.mode = activeMode;   // CSS가 가시성 즉시 전환
    updateToggleActive();
  });

  // ───── 필터 이벤트 ─────
  catFilterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter="cat"]');
    if (!btn) return;
    activeCat = btn.dataset.value;
    renderAll();
  });
  stFilterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter="status"]');
    if (!btn) return;
    activeStatus = btn.dataset.value;
    renderAll();
  });

  // ───── 등록 (JS 유효성 검사) ─────
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }
  function clearError() {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const category = document.getElementById('category').value.trim();
    const title    = document.getElementById('title').value.trim();
    const name     = document.getElementById('name').value.trim();
    const content  = document.getElementById('content').value.trim();

    if (!category || !title || !name || !content) {
      showError('모든 항목을 입력해주세요');
      return;
    }
    if (!CATEGORIES.includes(category)) {
      showError('유효하지 않은 카테고리입니다');
      return;
    }
    clearError();

    inquiries.push({
      id: nextId++,
      category,
      status: '접수',
      title, name, content,
      answer: '',
      createdAt: Date.now(),
    });
    saveToStorage();
    form.reset();
    renderList();
  });

  // ───── 목록 클릭: 삭제 / 답변 저장 ─────
  listEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('button[data-action="delete"]');
    if (delBtn) {
      const id = Number(delBtn.dataset.id);
      if (!confirm('이 문의를 정말 삭제하시겠습니까?')) return;
      inquiries = inquiries.filter(i => i.id !== id);
      saveToStorage();
      renderList();
      return;
    }
    const saveBtn = e.target.closest('button[data-action="answer-save"]');
    if (saveBtn) {
      const id = Number(saveBtn.dataset.id);
      const ta = listEl.querySelector(`textarea[data-action="answer-input"][data-id="${id}"]`);
      const item = inquiries.find(i => i.id === id);
      if (!item || !ta) return;
      item.answer = ta.value.trim();
      if (item.answer.length > 0) item.status = '답변완료';   // 답변 작성 시 자동 답변완료
      saveToStorage();
      renderList();
      return;
    }
  });

  // ───── 상태 변경 (select) ─────
  listEl.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-action="status-change"]');
    if (!sel) return;
    const id = Number(sel.dataset.id);
    const item = inquiries.find(i => i.id === id);
    if (!item) return;
    item.status = sel.value;
    saveToStorage();
    renderList();
  });

  // ───── ✨ AI 답변 초안 생성 ─────
  function setDraftingButton(btn, drafting) {
    if (!btn) return;
    btn.disabled = drafting;
    btn.textContent = drafting ? 'AI가 초안을 작성 중입니다…' : '✨ AI 답변 초안 만들기';
  }
  function showCardError(id, msg) {
    const box = listEl.querySelector(`[data-error-for="${id}"]`);
    if (!box) return;
    box.textContent = msg;
    box.classList.remove('hidden');
  }
  function clearCardError(id) {
    const box = listEl.querySelector(`[data-error-for="${id}"]`);
    if (!box) return;
    box.textContent = '';
    box.classList.add('hidden');
  }
  function fillDraft(id, draft) {
    const ta = listEl.querySelector(`textarea[data-action="answer-input"][data-id="${id}"]`);
    if (!ta) return;
    // 비어있으면 바로 채우고, 내용이 있으면 덮어쓰기 확인
    if (ta.value.trim() && !confirm('이미 작성 중인 답변이 있습니다. AI 초안으로 덮어쓸까요?')) return;
    ta.value = draft;        // 자동 입력 후에도 textarea는 그대로 수정 가능
    ta.focus();
  }

  async function onDraftReplyClick(e) {
    const btn = e.currentTarget;
    const id = Number(btn.dataset.id);
    if (draftingIds.has(id)) return;       // 이중 클릭 잠금 (가드 1)
    const item = inquiries.find(i => i.id === id);
    if (!item) return;

    draftingIds.add(id);
    setDraftingButton(btn, true);          // 이중 클릭 잠금 (가드 2: 비활성 + 라벨)
    clearCardError(id);

    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: item.category, title: item.title, content: item.content }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok || !data.draft) throw new Error('draft-failed');
      fillDraft(id, data.draft);
    } catch (_err) {
      showCardError(id, DRAFT_FAIL_MSG);
    } finally {
      draftingIds.delete(id);
      setDraftingButton(btn, false);
    }
  }

  // ───── 30초 갱신 (상대시간). textarea 입력 중·초안 생성 중에는 스킵 ─────
  setInterval(() => {
    if (draftingIds.size > 0) return;
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
    renderList();
  }, REFRESH_MS);

  // ───── 초기 렌더 ─────
  updateToggleActive();
  renderAll();
})();
