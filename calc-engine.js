/**
 * CalcEngine — 牌局分账计算引擎
 * 纯函数模块，不依赖 DOM 或全局状态
 */

/**
 * 验证输入是否为正整数
 * @param {string} value - 用户输入的字符串
 * @returns {boolean}
 */
export function isPositiveInteger(value) {
  return /^[1-9]\d*$/.test(value);
}

/**
 * 生成补齐条目（如需要）
 * @param {number} winTotal  - 赢方总额（非负整数）
 * @param {number} loseTotal - 输方总额（非负整数）
 * @returns {{ side: 'win'|'lose', amount: number } | null}
 */
export function computeSupplement(winTotal, loseTotal) {
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
 * @param {number[]} winAmounts - 每位赢家金额（含 Supplement，至少一个元素）
 * @param {number} totalShared  - 平摊费用总额（非负整数）
 * @returns {number[]} 每位赢家的分摊金额（与 winAmounts 等长）
 */
export function allocateSharedCosts(winAmounts, totalShared) {
  const n = winAmounts.length;

  if (totalShared === 0) {
    return Array(n).fill(0);
  }

  const balancedTotal = winAmounts.reduce((sum, a) => sum + a, 0);

  // 边界情况：所有赢家金额为 0（理论上不应发生，但防御性处理）
  if (balancedTotal === 0) {
    return Array(n).fill(0);
  }

  // 计算每人精确分摊额，取整数部分和小数部分
  const exact = winAmounts.map(a => (a / balancedTotal) * totalShared);
  const floors = exact.map(v => Math.floor(v));
  const remainders = exact.map((v, i) => v - floors[i]);

  // 还需要进1的名额数
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
 * @param {Array<{id: string, name: string, amount: number}>} winners - 赢家列表
 * @param {Array<{id: string, name: string, amount: number}>} losers  - 输家列表
 * @param {Array<{id: string, name: string, amount: number}>} sharedCosts - 平摊费用列表
 * @returns {object} CalcResult
 */
export function calculate(winners, losers, sharedCosts) {
  const winTotal = winners.reduce((sum, w) => sum + w.amount, 0);
  const loseTotal = losers.reduce((sum, l) => sum + l.amount, 0);
  const sharedTotal = sharedCosts.reduce((sum, c) => sum + c.amount, 0);

  const supplement = computeSupplement(winTotal, loseTotal);

  // 构建参与分摊计算的赢家金额列表（含 Supplement 补齐条目）
  const winAmountsForAlloc = winners.map(w => w.amount);
  if (supplement && supplement.side === 'win') {
    winAmountsForAlloc.push(supplement.amount);
  }

  // 计算分摊
  const balancedTotal = winAmountsForAlloc.reduce((sum, a) => sum + a, 0);
  const shares = allocateSharedCosts(winAmountsForAlloc, sharedTotal);

  // 精确分摊额（未进1/去尾的原始比例值）
  const exactShares = balancedTotal > 0 && sharedTotal > 0
    ? winAmountsForAlloc.map(a => (a / balancedTotal) * sharedTotal)
    : winAmountsForAlloc.map(() => 0);

  // 构建 winnerResults（仅真实赢家，不含 Supplement 条目）
  const winnerResults = winners.map((w, i) => {
    const shareAmount = shares[i];
    const exactShare = exactShares[i];
    const netWin = w.amount - shareAmount;
    return {
      id: w.id,
      name: w.name,
      winAmount: w.amount,
      shareAmount,
      exactShare,
      netWin,
      isNegative: netWin < 0,
    };
  });

  // 补齐后的两侧总额
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
