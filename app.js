'use strict';

const resultEl = document.getElementById('result');
const expressionEl = document.getElementById('expression');

let state = {
  current: '0',       // 当前输入的数字
  previous: null,     // 上一个数字
  operator: null,     // 当前运算符
  expression: '',     // 显示的表达式
  justCalculated: false, // 是否刚完成计算
  waitingForOperand: false, // 是否等待输入新数字
};

function updateDisplay() {
  // 自动缩小字体
  const len = state.current.length;
  resultEl.classList.remove('small', 'xsmall');
  if (len > 12) resultEl.classList.add('xsmall');
  else if (len > 9) resultEl.classList.add('small');

  resultEl.textContent = formatNumber(state.current);
  expressionEl.textContent = state.expression;
}

function formatNumber(str) {
  if (str === 'Error') return 'Error';
  // 保留小数点和负号，格式化整数部分加千位分隔符
  const isNeg = str.startsWith('-');
  const abs = isNeg ? str.slice(1) : str;
  const parts = abs.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (isNeg ? '-' : '') + parts.join('.');
}

function handleNumber(value) {
  if (state.current === 'Error') {
    state.current = value;
    state.expression = '';
    updateDisplay();
    return;
  }

  if (state.waitingForOperand) {
    state.current = value;
    state.waitingForOperand = false;
  } else {
    if (state.current === '0') {
      state.current = value;
    } else {
      if (state.current.replace('-', '').replace('.', '').length >= 15) return;
      state.current += value;
    }
  }
  state.justCalculated = false;
  updateDisplay();
}

function handleDecimal() {
  if (state.current === 'Error') {
    state.current = '0.';
    state.expression = '';
    updateDisplay();
    return;
  }

  if (state.waitingForOperand) {
    state.current = '0.';
    state.waitingForOperand = false;
    updateDisplay();
    return;
  }

  if (!state.current.includes('.')) {
    state.current += '.';
    updateDisplay();
  }
}

function handleOperator(op) {
  if (state.current === 'Error') return;

  // 如果已有运算符且未输入新数字，只更新运算符
  if (state.waitingForOperand && state.operator) {
    state.operator = op;
    state.expression = `${formatNumber(state.previous)} ${op}`;
    updateDisplay();
    return;
  }

  const current = parseFloat(state.current);

  if (state.previous !== null && !state.waitingForOperand) {
    const result = calculate(state.previous, current, state.operator);
    if (result === null) {
      state.current = 'Error';
      state.previous = null;
      state.operator = null;
      state.expression = 'Error';
      state.waitingForOperand = false;
      updateDisplay();
      return;
    }
    state.current = String(result);
    state.previous = result;
  } else {
    state.previous = current;
  }

  state.operator = op;
  state.expression = `${formatNumber(state.current)} ${op}`;
  state.waitingForOperand = true;
  state.justCalculated = false;
  updateDisplay();
}

function handleEquals() {
  if (state.current === 'Error') return;
  if (state.operator === null || state.previous === null) return;

  const current = parseFloat(state.current);
  const prev = state.previous;
  const op = state.operator;

  const fullExpr = `${formatNumber(String(prev))} ${op} ${formatNumber(state.current)} =`;
  const result = calculate(prev, current, op);

  if (result === null) {
    state.current = 'Error';
    state.expression = fullExpr;
    state.previous = null;
    state.operator = null;
    state.waitingForOperand = false;
  } else {
    state.expression = fullExpr;
    state.current = String(result);
    state.previous = null;
    state.operator = null;
    state.waitingForOperand = false;
    state.justCalculated = true;
  }
  updateDisplay();
}

function calculate(a, b, op) {
  let result;
  switch (op) {
    case '+': result = a + b; break;
    case '−': result = a - b; break;
    case '×': result = a * b; break;
    case '÷':
      if (b === 0) return null;
      result = a / b;
      break;
    default: return null;
  }
  // 避免浮点精度问题
  return parseFloat(result.toPrecision(15));
}

function handleClear() {
  state = {
    current: '0',
    previous: null,
    operator: null,
    expression: '',
    justCalculated: false,
    waitingForOperand: false,
  };
  updateDisplay();
}

function handleSign() {
  if (state.current === '0' || state.current === 'Error') return;
  if (state.current.startsWith('-')) {
    state.current = state.current.slice(1);
  } else {
    state.current = '-' + state.current;
  }
  updateDisplay();
}

function handlePercent() {
  if (state.current === 'Error') return;
  const val = parseFloat(state.current);
  if (state.previous !== null && state.operator) {
    // 相对百分比：如 100 + 10% = 100 + 10
    state.current = String(parseFloat((state.previous * val / 100).toPrecision(15)));
  } else {
    state.current = String(parseFloat((val / 100).toPrecision(15)));
  }
  updateDisplay();
}

// 高亮当前运算符按钮
function updateOperatorHighlight() {
  document.querySelectorAll('.btn.operator').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.value === state.operator && state.waitingForOperand) {
      btn.classList.add('active');
    }
  });
}

// 事件绑定
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const value = btn.dataset.value;

    switch (action) {
      case 'number':    handleNumber(value); break;
      case 'decimal':   handleDecimal(); break;
      case 'operator':  handleOperator(value); break;
      case 'equals':    handleEquals(); break;
      case 'clear':     handleClear(); break;
      case 'sign':      handleSign(); break;
      case 'percent':   handlePercent(); break;
    }

    updateOperatorHighlight();
  });
});

// 键盘支持
document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') handleNumber(e.key);
  else if (e.key === '.') handleDecimal();
  else if (e.key === '+') handleOperator('+');
  else if (e.key === '-') handleOperator('−');
  else if (e.key === '*') handleOperator('×');
  else if (e.key === '/') { e.preventDefault(); handleOperator('÷'); }
  else if (e.key === 'Enter' || e.key === '=') handleEquals();
  else if (e.key === 'Escape') handleClear();
  else if (e.key === 'Backspace') {
    if (state.current.length > 1 && state.current !== 'Error') {
      state.current = state.current.slice(0, -1);
      if (state.current === '-') state.current = '0';
      updateDisplay();
    } else {
      state.current = '0';
      updateDisplay();
    }
  }
  updateOperatorHighlight();
});

// Service Worker 注册
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// 初始化
updateDisplay();
