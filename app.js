'use strict';

/* ============================================================
   CalcEngine — 内联自 calc-engine.js（纯函数，不依赖 DOM）
   ============================================================ */

/**
 * 验证输入是否为正整数
 * @param {string} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return /^[1-9]\d*$/.test(value);
}

/**
 * 生成补齐条目（如需要）
 * @param {number} winTotal
 * @param {number} loseTotal
 * @returns {{ side: 'win'|'lose', amount: number } | null}
 */
function computeSupplement(winTotal, loseTotal) {
  if (winTotal > loseTotal) {
    return { side: 'lose', amount: winTotal - loseTotal };
  } else if (loseTotal > winTotal) {
    return { side: 'win', amount: loseTotal - winTotal };
  } else {
    return null;
  }
}

/**
 * 按比例分摊平摊费用（赢额优先进1规则：按赢额从高到低进1，赢额相同时按小数部分从大到小，总和精确等于 totalShared）
 * @param {number[]} winAmounts
 * @param {number} totalShared
 * @returns {number[]}
 */
function allocateSharedCosts(winAmounts, totalShared) {
  const n = winAmounts.length;
  if (totalShared === 0) {
    return Array(n).fill(0);
  }
  const balancedTotal = winAmounts.reduce((sum, a) => sum + a, 0);

  if (balancedTotal === 0) {
    return Array(n).fill(0);
  }

  const exact = winAmounts.map(a => (a / balancedTotal) * totalShared);
  const floors = exact.map(v => Math.floor(v));
  const remainders = exact.map((v, i) => v - floors[i]);

  const floorSum = floors.reduce((s, v) => s + v, 0);
  let roundUpCount = totalShared - floorSum;

  // 按赢额从高到低排序决定进1顺序；赢额相同时按小数部分从大到小
  const indices = winAmounts.map((_, i) => i).sort((a, b) => {
    if (winAmounts[b] !== winAmounts[a]) return winAmounts[b] - winAmounts[a];
    return remainders[b] - remainders[a];
  });

  const shares = floors.slice();
  for (let k = 0; k < roundUpCount; k++) {
    shares[indices[k]] += 1;
  }

  return shares;
}

/**
 * 计算分账结果（顶层入口）
 * @param {Array<{id:string,name:string,amount:number}>} winners
 * @param {Array<{id:string,name:string,amount:number}>} losers
 * @param {Array<{id:string,name:string,amount:number}>} sharedCosts
 * @returns {object} CalcResult
 */
function calculate(winners, losers, sharedCosts) {
  const winTotal = winners.reduce((sum, w) => sum + w.amount, 0);
  const loseTotal = losers.reduce((sum, l) => sum + l.amount, 0);
  const sharedTotal = sharedCosts.reduce((sum, c) => sum + c.amount, 0);

  const supplement = computeSupplement(winTotal, loseTotal);

  const winAmountsForAlloc = winners.map(w => w.amount);
  if (supplement && supplement.side === 'win') {
    winAmountsForAlloc.push(supplement.amount);
  }

  const balancedTotal = winAmountsForAlloc.reduce((sum, a) => sum + a, 0);
  const shares = allocateSharedCosts(winAmountsForAlloc, sharedTotal);

  // 计算每人精确分摊额（未进1/去尾的原始比例值）
  const exactShares = balancedTotal > 0 && sharedTotal > 0
    ? winAmountsForAlloc.map(a => (a / balancedTotal) * sharedTotal)
    : winAmountsForAlloc.map(() => 0);

  const winnerResults = winners.map((w, i) => {
    const shareAmount = shares[i];
    const exactShare = exactShares[i];
    const netWin = w.amount - shareAmount;
    return {
      id: w.id,
      name: w.name,
      winAmount: w.amount,
      shareAmount,
      exactShare,          // 精确分摊额（保留2位小数用）
      netWin,
      isNegative: netWin < 0,
    };
  });

  const effectiveWinTotal = winTotal + (supplement && supplement.side === 'win' ? supplement.amount : 0);
  const effectiveLoseTotal = loseTotal + (supplement && supplement.side === 'lose' ? supplement.amount : 0);

  return {
    winTotal: effectiveWinTotal,
    loseTotal: effectiveLoseTotal,
    sharedTotal,
    supplement,
    winnerResults,
  };
}

/* ============================================================
   StorageManager — 内联自 storage-manager.js
   ============================================================ */

const SESSIONS_KEY = 'pwa_sessions';
const THEME_KEY = 'pwa_theme';

const StorageManager = {
  getSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw === null) return [];
      try {
        const sessions = JSON.parse(raw);
        if (!Array.isArray(sessions)) {
          localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
          return [];
        }
        return sessions.slice().sort((a, b) => b.savedAt - a.savedAt);
      } catch {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
        return [];
      }
    } catch {
      return [];
    }
  },

  saveSession(session) {
    try {
      const sessions = this.getSessions();
      sessions.push(session);
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
          throw new Error('存储空间已满，请删除旧记录后再保存');
        }
        throw e;
      }
    } catch (e) {
      if (e.message && e.message.includes('存储空间已满')) {
        throw e;
      }
    }
  },

  deleteSession(id) {
    try {
      const sessions = this.getSessions();
      const filtered = sessions.filter(s => s.id !== id);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
    } catch {
      // localStorage 不可用，静默处理
    }
  },

  getTheme() {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      if (theme === 'light') return 'light';
      return 'dark';
    } catch {
      return 'dark';
    }
  },

  saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 静默处理
    }
  },
};

/* ============================================================
   AppState — 应用运行时状态
   ============================================================ */

const AppState = {
  winners: [],       // { id, name, amount }
  losers: [],
  sharedCosts: [],
  calcResult: null,
  currentView: 'main',
  detailSession: null,
  winnerCounter: 0,  // 用于生成默认名称
  loserCounter: 0,
  costCounter: 0,
};

/* ============================================================
   辅助函数
   ============================================================ */

/**
 * 格式化日期时间为 "2025-01-05 14:30" 格式
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

/**
 * 生成唯一 ID
 * @returns {string}
 */
function generateId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

/* ============================================================
   视图切换与主题
   ============================================================ */

/**
 * 切换当前可见视图
 * @param {'main'|'history'|'detail'} viewId
 */
function switchView(viewId) {
  const views = ['main', 'history', 'detail'];
  views.forEach(v => {
    const el = document.getElementById(v + '-view');
    if (el) el.style.display = v === viewId ? '' : 'none';
  });
  AppState.currentView = viewId;
}

/**
 * 应用主题
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
  // 更新主题按钮文字
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'light' ? '深色' : '浅色';
}

/* ============================================================
   渲染函数
   ============================================================ */

/**
 * 更新合计显示，并更新 Supplement 行（不重建整个列表，避免破坏焦点）
 */
function updateTotals() {
  const winSum = AppState.winners.reduce((s, w) => s + (w.amount || 0), 0);
  const loseSum = AppState.losers.reduce((s, l) => s + (l.amount || 0), 0);
  const sharedSum = AppState.sharedCosts.reduce((s, c) => s + (c.amount || 0), 0);

  // 更新 Supplement 行（只移除旧的 supplement-row，再按需追加新的）
  updateSupplementRow('winners-list', loseSum > winSum ? loseSum - winSum : 0);
  updateSupplementRow('losers-list', winSum > loseSum ? winSum - loseSum : 0);

  // 更新合计显示（含 Supplement）
  document.getElementById('win-total').textContent = winSum + (loseSum > winSum ? loseSum - winSum : 0);
  document.getElementById('lose-total').textContent = loseSum + (winSum > loseSum ? winSum - loseSum : 0);
  document.getElementById('shared-total').textContent = sharedSum;
}

/**
 * 更新指定列表的 Supplement 行（不重建整个列表）
 * @param {string} listId
 * @param {number} supplementAmount - 0 表示不需要 Supplement
 */
function updateSupplementRow(listId, supplementAmount) {
  const list = document.getElementById(listId);
  if (!list) return;

  // 移除旧的 supplement-row
  const existing = list.querySelector('.supplement-row');
  if (existing) existing.remove();

  // 如需要，追加新的
  if (supplementAmount > 0) {
    // winners-list 的补齐在赢方侧（输方多），losers-list 的补齐在输方侧（赢方多）
    const side = listId === 'winners-list' ? 'win' : 'lose';
    list.appendChild(createSupplementRow(supplementAmount, side));
  }
}

/**
 * 创建录入行 DOM 元素
 * @param {object} entry - { id, name, amount }
 * @param {'winner'|'loser'|'cost'} type
 * @returns {HTMLElement}
 */
function createEntryRow(entry, type) {
  const row = document.createElement('div');
  row.className = 'entry-row';
  row.dataset.id = entry.id;

  const nameInput = document.createElement('input');
  nameInput.className = 'entry-name';
  nameInput.type = 'text';
  nameInput.value = entry.name;
  nameInput.maxLength = 20;

  // 姓名 blur：为空时恢复默认名称
  nameInput.addEventListener('blur', () => {
    if (nameInput.value.trim() === '') {
      nameInput.value = entry.name;
    } else {
      entry.name = nameInput.value.trim();
    }
  });

  const amountInput = document.createElement('input');
  amountInput.className = 'entry-amount';
  amountInput.type = 'number';
  amountInput.inputMode = 'numeric';
  amountInput.placeholder = '金额';
  if (entry.amount) amountInput.value = entry.amount;

  // 记录上一个合法值
  let lastValidAmount = entry.amount || null;

  amountInput.addEventListener('focus', () => {
    lastValidAmount = entry.amount || null;
  });

  // 金额 blur：非正整数时恢复为上一个合法值（或清空）
  amountInput.addEventListener('blur', () => {
    const val = amountInput.value.trim();
    if (val === '') {
      entry.amount = 0;
      amountInput.value = '';
      lastValidAmount = null;
    } else if (isPositiveInteger(val)) {
      entry.amount = parseInt(val, 10);
      lastValidAmount = entry.amount;
    } else {
      // 恢复上一个合法值
      if (lastValidAmount !== null) {
        amountInput.value = lastValidAmount;
        entry.amount = lastValidAmount;
      } else {
        amountInput.value = '';
        entry.amount = 0;
      }
    }
    updateTotals();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'entry-delete';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', () => {
    if (type === 'winner') {
      AppState.winners = AppState.winners.filter(w => w.id !== entry.id);
      renderWinners();
    } else if (type === 'loser') {
      AppState.losers = AppState.losers.filter(l => l.id !== entry.id);
      renderLosers();
    } else {
      AppState.sharedCosts = AppState.sharedCosts.filter(c => c.id !== entry.id);
      renderSharedCosts();
    }
    updateTotals();
  });

  row.appendChild(nameInput);
  row.appendChild(amountInput);
  row.appendChild(deleteBtn);
  return row;
}

/**
 * 创建 Supplement 行 DOM 元素
 * @param {number} amount
 * @returns {HTMLElement}
 */
function createSupplementRow(amount, side) {
  const row = document.createElement('div');
  row.className = 'supplement-row';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'supplement-name';
  nameSpan.textContent = '补齐';

  const amountSpan = document.createElement('span');
  amountSpan.className = 'supplement-amount';
  amountSpan.textContent = amount;

  // 补齐按钮：点击后在对应侧自动添加一条真实玩家记录
  const fillBtn = document.createElement('button');
  fillBtn.className = 'supplement-fill-btn';
  fillBtn.textContent = '补齐';
  fillBtn.addEventListener('click', () => {
    if (side === 'lose') {
      // 补齐在输方侧，自动添加输家
      AppState.loserCounter += 1;
      const entry = { id: generateId(), name: '玩家' + AppState.loserCounter, amount };
      AppState.losers.push(entry);
      renderLosers();
    } else {
      // 补齐在赢方侧，自动添加赢家
      AppState.winnerCounter += 1;
      const entry = { id: generateId(), name: '玩家' + AppState.winnerCounter, amount };
      AppState.winners.push(entry);
      renderWinners();
    }
    updateTotals();
  });

  row.appendChild(nameSpan);
  row.appendChild(amountSpan);
  row.appendChild(fillBtn);
  return row;
}

/**
 * 渲染赢方列表（含 Supplement 行）
 */
function renderWinners() {
  const list = document.getElementById('winners-list');
  if (!list) return;
  list.innerHTML = '';

  AppState.winners.forEach(w => {
    list.appendChild(createEntryRow(w, 'winner'));
  });

  // 计算是否需要 Supplement
  const winSum = AppState.winners.reduce((s, w) => s + (w.amount || 0), 0);
  const loseSum = AppState.losers.reduce((s, l) => s + (l.amount || 0), 0);
  if (loseSum > winSum) {
    list.appendChild(createSupplementRow(loseSum - winSum, 'win'));
  }

  // 更新合计（含 Supplement）
  document.getElementById('win-total').textContent =
    winSum + (loseSum > winSum ? loseSum - winSum : 0);
}

/**
 * 渲染输方列表（含 Supplement 行）
 */
function renderLosers() {
  const list = document.getElementById('losers-list');
  if (!list) return;
  list.innerHTML = '';

  AppState.losers.forEach(l => {
    list.appendChild(createEntryRow(l, 'loser'));
  });

  // 计算是否需要 Supplement
  const winSum = AppState.winners.reduce((s, w) => s + (w.amount || 0), 0);
  const loseSum = AppState.losers.reduce((s, l) => s + (l.amount || 0), 0);
  if (winSum > loseSum) {
    list.appendChild(createSupplementRow(winSum - loseSum, 'lose'));
  }

  // 更新合计
  document.getElementById('lose-total').textContent =
    loseSum + (winSum > loseSum ? winSum - loseSum : 0);
}

/**
 * 渲染平摊费用列表
 */
function renderSharedCosts() {
  const list = document.getElementById('shared-costs-list');
  if (!list) return;
  list.innerHTML = '';

  AppState.sharedCosts.forEach(c => {
    list.appendChild(createEntryRow(c, 'cost'));
  });

  const sharedSum = AppState.sharedCosts.reduce((s, c) => s + (c.amount || 0), 0);
  document.getElementById('shared-total').textContent = sharedSum;
}

/* ============================================================
   计算与结果渲染
   ============================================================ */

/**
 * 处理计算按钮点击
 */
function handleCalc() {
  // 验证：赢家和输家列表不能为空
  if (AppState.winners.length === 0) {
    alert('请至少添加一位赢家');
    return;
  }
  if (AppState.losers.length === 0) {
    alert('请至少添加一位输家');
    return;
  }

  // 验证所有金额是否已填写
  const hasInvalidWinner = AppState.winners.some(w => !w.amount || w.amount <= 0);
  const hasInvalidLoser = AppState.losers.some(l => !l.amount || l.amount <= 0);
  if (hasInvalidWinner || hasInvalidLoser) {
    alert('请确保所有赢家和输家的金额均为正整数');
    return;
  }

  const result = calculate(AppState.winners, AppState.losers, AppState.sharedCosts);
  AppState.calcResult = result;

  renderCalcResult(result);

  // 显示保存区域
  const saveArea = document.getElementById('save-area');
  if (saveArea) saveArea.style.display = '';
}

/**
 * 渲染计算结果到 #result-area
 * @param {object} result - CalcResult
 */
function renderCalcResult(result) {
  const area = document.getElementById('result-area');
  if (!area) return;
  area.style.display = '';
  area.innerHTML = '';

  // 标题
  const title = document.createElement('div');
  title.className = 'result-area-title';
  title.textContent = '计算结果';
  area.appendChild(title);

  // 表头
  const header = document.createElement('div');
  header.className = 'result-header';
  header.innerHTML =
    '<span class="result-header-name">姓名</span>' +
    '<span class="result-header-cell">赢额</span>' +
    '<span class="result-header-cell">分摊</span>' +
    '<span class="result-header-cell result-cell-exact">分摊</span>' +
    '<span class="result-header-cell">净赢</span>';
  area.appendChild(header);

  // 每位赢家一行（按赢额从高到低排序）
  const sortedResults = result.winnerResults.slice().sort((a, b) => b.winAmount - a.winAmount);
  sortedResults.forEach(wr => {
    const row = document.createElement('div');
    row.className = 'result-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'result-name';
    nameSpan.textContent = wr.name;

    const winSpan = document.createElement('span');
    winSpan.className = 'result-cell';
    winSpan.textContent = wr.winAmount;

    const exactSpan = document.createElement('span');
    exactSpan.className = 'result-cell result-cell-exact';
    exactSpan.textContent = (wr.exactShare !== undefined ? wr.exactShare : wr.shareAmount).toFixed(2);

    const shareSpan = document.createElement('span');
    shareSpan.className = 'result-cell';
    shareSpan.textContent = wr.shareAmount;

    const netSpan = document.createElement('span');
    netSpan.className = 'result-cell' + (wr.isNegative ? ' negative' : '');
    netSpan.textContent = wr.netWin;

    row.appendChild(nameSpan);
    row.appendChild(winSpan);
    row.appendChild(shareSpan);
    row.appendChild(exactSpan);
    row.appendChild(netSpan);
    area.appendChild(row);
  });
}

/* ============================================================
   保存 Session
   ============================================================ */

/**
 * 处理保存按钮点击
 */
function handleSave() {
  if (!AppState.calcResult) {
    alert('请先计算结果');
    return;
  }

  const defaultTitle = formatDateTime(new Date());
  const title = prompt('请输入本局备注（如：2025-01-05 麻将）', defaultTitle) || defaultTitle;

  const session = {
    id: String(Date.now()),
    title,
    savedAt: Date.now(),
    winners: AppState.winners.map(w => ({ ...w })),
    losers: AppState.losers.map(l => ({ ...l })),
    sharedCosts: AppState.sharedCosts.map(c => ({ ...c })),
    calcResult: AppState.calcResult,
  };

  try {
    StorageManager.saveSession(session);
    alert('已保存');
  } catch (e) {
    alert(e.message || '保存失败');
  }
}

/* ============================================================
   历史列表视图
   ============================================================ */

/**
 * 渲染历史列表视图
 */
function renderHistoryView() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  if (!list) return;

  const sessions = StorageManager.getSessions();
  list.innerHTML = '';

  if (sessions.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  sessions.forEach(session => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const info = document.createElement('div');
    info.className = 'history-card-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'history-card-title';
    titleEl.textContent = session.title;

    const timeEl = document.createElement('div');
    timeEl.className = 'history-card-date';
    timeEl.textContent = formatDateTime(new Date(session.savedAt));

    info.appendChild(titleEl);
    info.appendChild(timeEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-card-delete';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确认删除这条记录？')) {
        StorageManager.deleteSession(session.id);
        renderHistoryView();
      }
    });

    card.appendChild(info);
    card.appendChild(deleteBtn);

    // 点击卡片进入详情
    card.addEventListener('click', () => {
      AppState.detailSession = session;
      renderDetailView(session);
      switchView('detail');
    });

    list.appendChild(card);
  });
}

/* ============================================================
   详情视图
   ============================================================ */

/**
 * 渲染详情视图
 * @param {object} session - Session
 */
function renderDetailView(session) {
  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.textContent = session.title;

  const content = document.getElementById('detail-content');
  if (!content) return;
  content.innerHTML = '';

  // 赢方
  content.appendChild(createDetailSection('赢方', session.winners, session.calcResult && session.calcResult.supplement && session.calcResult.supplement.side === 'win' ? session.calcResult.supplement : null));

  // 输方
  content.appendChild(createDetailSection('输方', session.losers, session.calcResult && session.calcResult.supplement && session.calcResult.supplement.side === 'lose' ? session.calcResult.supplement : null));

  // 平摊费用
  if (session.sharedCosts && session.sharedCosts.length > 0) {
    content.appendChild(createDetailSection('平摊费用', session.sharedCosts, null));
  }

  // 计算结果
  if (session.calcResult) {
    const resultSection = document.createElement('div');
    resultSection.className = 'detail-section';

    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'detail-section-title';
    sectionTitle.textContent = '计算结果';
    resultSection.appendChild(sectionTitle);

    // 复用 renderCalcResult 的逻辑，但渲染到 resultSection
    const header = document.createElement('div');
    header.className = 'result-header';
    header.innerHTML =
      '<span class="result-header-name">姓名</span>' +
      '<span class="result-header-cell">赢额</span>' +
      '<span class="result-header-cell">分摊</span>' +
      '<span class="result-header-cell">净赢</span>';
    resultSection.appendChild(header);

    session.calcResult.winnerResults.forEach(wr => {
      const row = document.createElement('div');
      row.className = 'result-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'result-name';
      nameSpan.textContent = wr.name;

      const winSpan = document.createElement('span');
      winSpan.className = 'result-cell';
      winSpan.textContent = wr.winAmount;

      const shareSpan = document.createElement('span');
      shareSpan.className = 'result-cell';
      shareSpan.textContent = wr.shareAmount;

      const netSpan = document.createElement('span');
      netSpan.className = 'result-cell' + (wr.isNegative ? ' negative' : '');
      netSpan.textContent = wr.netWin;

      row.appendChild(nameSpan);
      row.appendChild(winSpan);
      row.appendChild(shareSpan);
      row.appendChild(netSpan);
      resultSection.appendChild(row);
    });

    content.appendChild(resultSection);
  }
}

/**
 * 创建详情区块（赢方/输方/平摊）
 * @param {string} title
 * @param {Array} entries
 * @param {object|null} supplement
 * @returns {HTMLElement}
 */
function createDetailSection(title, entries, supplement) {
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'detail-section-title';
  sectionTitle.textContent = title;
  section.appendChild(sectionTitle);

  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'detail-entry-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'detail-entry-name';
    nameSpan.textContent = entry.name;

    const amountSpan = document.createElement('span');
    amountSpan.className = 'detail-entry-amount';
    amountSpan.textContent = entry.amount;

    row.appendChild(nameSpan);
    row.appendChild(amountSpan);
    section.appendChild(row);
  });

  // Supplement 行
  if (supplement) {
    const suppRow = document.createElement('div');
    suppRow.className = 'detail-entry-row supplement-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'supplement-name';
    nameSpan.textContent = '补齐';

    const amountSpan = document.createElement('span');
    amountSpan.className = 'supplement-amount';
    amountSpan.textContent = supplement.amount;

    suppRow.appendChild(nameSpan);
    suppRow.appendChild(amountSpan);
    section.appendChild(suppRow);
  }

  return section;
}

/* ============================================================
   主题切换
   ============================================================ */

/**
 * 切换主题
 */
function toggleTheme() {
  const current = StorageManager.getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  StorageManager.saveTheme(next);
}

/* ============================================================
   DOMContentLoaded — 事件绑定与初始化
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // 初始化主题
  const savedTheme = StorageManager.getTheme();
  applyTheme(savedTheme);

  // 初始化视图
  switchView('main');

  // 初始渲染（空列表）
  renderWinners();
  renderLosers();
  renderSharedCosts();

  // 添加赢家
  document.getElementById('add-winner-btn').addEventListener('click', () => {
    AppState.winnerCounter += 1;
    const entry = {
      id: generateId(),
      name: '玩家' + AppState.winnerCounter,
      amount: 0,
    };
    AppState.winners.push(entry);
    renderWinners();
    updateTotals();
  });

  // 添加输家
  document.getElementById('add-loser-btn').addEventListener('click', () => {
    AppState.loserCounter += 1;
    const entry = {
      id: generateId(),
      name: '玩家' + AppState.loserCounter,
      amount: 0,
    };
    AppState.losers.push(entry);
    renderLosers();
    updateTotals();
  });

  // 添加平摊费用
  document.getElementById('add-cost-btn').addEventListener('click', () => {
    AppState.costCounter += 1;
    const entry = {
      id: generateId(),
      name: '费用' + AppState.costCounter,
      amount: 0,
    };
    AppState.sharedCosts.push(entry);
    renderSharedCosts();
  });

  // 计算按钮
  document.getElementById('calc-btn').addEventListener('click', handleCalc);

  // 保存按钮
  document.getElementById('save-btn').addEventListener('click', handleSave);

  // 历史记录按钮
  document.getElementById('history-btn').addEventListener('click', () => {
    renderHistoryView();
    switchView('history');
  });

  // 历史返回按钮
  document.getElementById('history-back-btn').addEventListener('click', () => {
    switchView('main');
  });

  // 详情返回按钮
  document.getElementById('detail-back-btn').addEventListener('click', () => {
    switchView('history');
  });

  // 主题切换按钮
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
});

/* ============================================================
   Service Worker 注册
   ============================================================ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
