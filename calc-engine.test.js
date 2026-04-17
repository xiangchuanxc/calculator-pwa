import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isPositiveInteger,
  computeSupplement,
  allocateSharedCosts,
  calculate,
} from './calc-engine.js';

// CalcEngine 计算引擎测试

// ─────────────────────────────────────────────
// isPositiveInteger
// ─────────────────────────────────────────────
describe('isPositiveInteger', () => {
  // 已知正例
  it('returns true for "1"', () => expect(isPositiveInteger('1')).toBe(true));
  it('returns true for "100"', () => expect(isPositiveInteger('100')).toBe(true));
  it('returns true for "9999"', () => expect(isPositiveInteger('9999')).toBe(true));

  // 已知反例
  it('returns false for "0"', () => expect(isPositiveInteger('0')).toBe(false));
  it('returns false for "-1"', () => expect(isPositiveInteger('-1')).toBe(false));
  it('returns false for "1.5"', () => expect(isPositiveInteger('1.5')).toBe(false));
  it('returns false for "01"', () => expect(isPositiveInteger('01')).toBe(false));
  it('returns false for ""', () => expect(isPositiveInteger('')).toBe(false));
  it('returns false for "abc"', () => expect(isPositiveInteger('abc')).toBe(false));
  it('returns false for " 1"', () => expect(isPositiveInteger(' 1')).toBe(false));

  // Feature: calculator-pwa, Property 1: 正整数输入验证
  // Validates: Requirements 1.4, 1.5, 2.4, 2.5, 4.3, 4.4
  it('Property 1: 当且仅当输入为正整数字符串时返回 true', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = isPositiveInteger(s);
        // 正整数：匹配 /^[1-9]\d*$/
        const expected = /^[1-9]\d*$/.test(s);
        return result === expected;
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// computeSupplement
// ─────────────────────────────────────────────
describe('computeSupplement', () => {
  // 单元测试
  it('赢方多时补输方', () => {
    expect(computeSupplement(800, 600)).toEqual({ side: 'lose', amount: 200 });
  });
  it('输方多时补赢方', () => {
    expect(computeSupplement(600, 800)).toEqual({ side: 'win', amount: 200 });
  });
  it('相等时返回 null', () => {
    expect(computeSupplement(600, 600)).toBeNull();
  });
  it('均为 0 时返回 null', () => {
    expect(computeSupplement(0, 0)).toBeNull();
  });

  // Feature: calculator-pwa, Property 2: 补齐后两侧有效总额相等
  // Validates: Requirements 3.1, 3.2, 3.3, 3.4
  it('Property 2: 补齐后赢方有效总额等于输方有效总额', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (winTotal, loseTotal) => {
        const supp = computeSupplement(winTotal, loseTotal);
        let effectiveWin = winTotal;
        let effectiveLose = loseTotal;
        if (supp !== null) {
          if (supp.side === 'win') effectiveWin += supp.amount;
          else effectiveLose += supp.amount;
        }
        return effectiveWin === effectiveLose;
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// allocateSharedCosts
// ─────────────────────────────────────────────
describe('allocateSharedCosts', () => {
  // 单元测试
  it('([500,300], 100) → [63, 37]', () => {
    expect(allocateSharedCosts([500, 300], 100)).toEqual([63, 37]);
  });
  it('([500], 100) → [100]', () => {
    expect(allocateSharedCosts([500], 100)).toEqual([100]);
  });
  it('([500,300], 0) → [0, 0]', () => {
    expect(allocateSharedCosts([500, 300], 0)).toEqual([0, 0]);
  });
  it('单人时全额承担', () => {
    expect(allocateSharedCosts([1000], 300)).toEqual([300]);
  });

  // Feature: calculator-pwa, Property 3: 分摊之和等于平摊总额且按最大余数法分配
  // Validates: Requirements 5.1, 5.2
  it('Property 3: 分摊之和精确等于平摊总额，每人分摊为 floor 或 floor+1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ min: 1 }), { minLength: 1 }),
        fc.nat(),
        (winAmounts, totalShared) => {
          const shares = allocateSharedCosts(winAmounts, totalShared);
          const balancedTotal = winAmounts.reduce((s, a) => s + a, 0);

          // 条件 1：所有分摊之和精确等于 totalShared
          const sumShares = shares.reduce((s, a) => s + a, 0);
          if (sumShares !== totalShared) return false;

          // 条件 2：每人分摊值为 floor 或 floor+1
          for (let i = 0; i < winAmounts.length; i++) {
            const exact = (winAmounts[i] / balancedTotal) * totalShared;
            const floor = Math.floor(exact);
            if (shares[i] !== floor && shares[i] !== floor + 1) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// calculate
// ─────────────────────────────────────────────
describe('calculate', () => {
  // 基础单元测试
  it('基本场景：两赢家、两输家、一项平摊', () => {
    const winners = [
      { id: '1', name: '玩家1', amount: 500 },
      { id: '2', name: '玩家2', amount: 300 },
    ];
    const losers = [
      { id: '3', name: '玩家3', amount: 600 },
      { id: '4', name: '玩家4', amount: 200 },
    ];
    const sharedCosts = [{ id: 'c1', name: '台费', amount: 100 }];

    const result = calculate(winners, losers, sharedCosts);

    expect(result.winTotal).toBe(800);
    expect(result.loseTotal).toBe(800);
    expect(result.sharedTotal).toBe(100);
    expect(result.supplement).toBeNull();
    expect(result.winnerResults).toHaveLength(2);

    const r1 = result.winnerResults[0];
    expect(r1.winAmount).toBe(500);
    expect(r1.shareAmount).toBe(63);
    expect(r1.netWin).toBe(437);
    expect(r1.isNegative).toBe(false);

    const r2 = result.winnerResults[1];
    expect(r2.winAmount).toBe(300);
    expect(r2.shareAmount).toBe(37);
    expect(r2.netWin).toBe(263);
    expect(r2.isNegative).toBe(false);
  });

  it('平摊为 0 时净赢额等于赢额', () => {
    const winners = [{ id: '1', name: '玩家1', amount: 500 }];
    const losers = [{ id: '2', name: '玩家2', amount: 500 }];
    const result = calculate(winners, losers, []);

    expect(result.winnerResults[0].netWin).toBe(500);
    expect(result.winnerResults[0].shareAmount).toBe(0);
    expect(result.winnerResults[0].isNegative).toBe(false);
  });

  it('净赢额为负时 isNegative 为 true', () => {
    const winners = [{ id: '1', name: '玩家1', amount: 50 }];
    const losers = [{ id: '2', name: '玩家2', amount: 50 }];
    const sharedCosts = [{ id: 'c1', name: '台费', amount: 100 }];
    const result = calculate(winners, losers, sharedCosts);

    expect(result.winnerResults[0].netWin).toBe(-50);
    expect(result.winnerResults[0].isNegative).toBe(true);
  });

  it('赢方总额不等时生成 Supplement', () => {
    const winners = [{ id: '1', name: '玩家1', amount: 500 }];
    const losers = [{ id: '2', name: '玩家2', amount: 300 }];
    const result = calculate(winners, losers, []);

    expect(result.supplement).toEqual({ side: 'lose', amount: 200 });
    expect(result.winTotal).toBe(500);
    expect(result.loseTotal).toBe(500);
    // Supplement 不出现在 winnerResults
    expect(result.winnerResults).toHaveLength(1);
  });

  it('输方多时 Supplement 在赢方侧，参与分摊但不出现在 winnerResults', () => {
    const winners = [{ id: '1', name: '玩家1', amount: 300 }];
    const losers = [{ id: '2', name: '玩家2', amount: 500 }];
    const sharedCosts = [{ id: 'c1', name: '台费', amount: 100 }];
    const result = calculate(winners, losers, sharedCosts);

    expect(result.supplement).toEqual({ side: 'win', amount: 200 });
    // winnerResults 只含真实赢家
    expect(result.winnerResults).toHaveLength(1);
    // 分摊按 300/500 比例计算（Supplement 200 也参与）
    // 玩家1: ceil(300/500 * 100) = ceil(60) = 60，最后一位（Supplement）承担尾差
    expect(result.winnerResults[0].shareAmount).toBe(60);
    expect(result.winnerResults[0].netWin).toBe(240);
  });

  // Feature: calculator-pwa, Property 4: 净赢额等于赢额减去分摊金额
  // Validates: Requirements 5.3, 5.4, 5.5
  it('Property 4: 净赢额等于赢额减去分摊金额，isNegative 当且仅当 netWin < 0', () => {
    fc.assert(
      fc.property(
        fc.nat({ min: 1 }),  // winAmount（正整数）
        fc.nat(),             // shareAmount（非负整数）
        (winAmount, shareAmount) => {
          // 构造一个最简场景：单赢家，赢输相等，平摊费用 = shareAmount
          const winners = [{ id: '1', name: '玩家1', amount: winAmount }];
          const losers = [{ id: '2', name: '玩家2', amount: winAmount }];
          const sharedCosts = shareAmount > 0
            ? [{ id: 'c1', name: '费用', amount: shareAmount }]
            : [];

          const result = calculate(winners, losers, sharedCosts);
          const r = result.winnerResults[0];

          // 单赢家时全额承担平摊
          const expectedNetWin = winAmount - shareAmount;
          if (r.netWin !== expectedNetWin) return false;
          if (r.isNegative !== (expectedNetWin < 0)) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
