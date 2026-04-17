import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import StorageManager from './storage-manager.js';

// StorageManager 存储管理模块测试

// ─────────────────────────────────────────────
// localStorage mock 设置
// ─────────────────────────────────────────────
let store = {};
const localStorageMock = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { store = {}; },
};

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', localStorageMock);
});

// ─────────────────────────────────────────────
// 属性测试生成器：随机 Session 对象
// ─────────────────────────────────────────────
const sessionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 0, maxLength: 50 }),
  savedAt: fc.nat(),
  winners: fc.array(
    fc.record({
      id: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      amount: fc.nat({ min: 1 }),
    }),
    { maxLength: 5 }
  ),
  losers: fc.array(
    fc.record({
      id: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      amount: fc.nat({ min: 1 }),
    }),
    { maxLength: 5 }
  ),
  sharedCosts: fc.array(
    fc.record({
      id: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      amount: fc.nat({ min: 1 }),
    }),
    { maxLength: 3 }
  ),
  calcResult: fc.record({
    winTotal: fc.nat(),
    loseTotal: fc.nat(),
    sharedTotal: fc.nat(),
    supplement: fc.option(
      fc.record({
        side: fc.constantFrom('win', 'lose'),
        amount: fc.nat({ min: 1 }),
      }),
      { nil: null }
    ),
    winnerResults: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        name: fc.string({ minLength: 1 }),
        winAmount: fc.nat({ min: 1 }),
        shareAmount: fc.nat(),
        netWin: fc.integer(),
        isNegative: fc.boolean(),
      }),
      { maxLength: 5 }
    ),
  }),
});

// ─────────────────────────────────────────────
// Feature: calculator-pwa, Property 5: Session持久化往返
// Validates: Requirements 6.1, 6.7
// ─────────────────────────────────────────────
describe('StorageManager - Property 5: Session持久化往返', () => {
  it('saveSession 后 getSessions 返回列表中包含深度相等的记录', () => {
    fc.assert(
      fc.property(sessionArb, (session) => {
        // 每次重置 store
        store = {};
        StorageManager.saveSession(session);
        const sessions = StorageManager.getSessions();
        // 返回列表中应包含与原始 session 深度相等的记录
        return sessions.some(s => JSON.stringify(s) === JSON.stringify(session));
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// Feature: calculator-pwa, Property 6: 历史记录按savedAt倒序排列
// Validates: Requirements 6.4
// ─────────────────────────────────────────────
describe('StorageManager - Property 6: 历史记录按savedAt倒序排列', () => {
  it('多条不同 savedAt 的记录，getSessions 返回严格降序列表', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            title: fc.string(),
            savedAt: fc.nat(),
            winners: fc.constant([]),
            losers: fc.constant([]),
            sharedCosts: fc.constant([]),
            calcResult: fc.constant({
              winTotal: 0,
              loseTotal: 0,
              sharedTotal: 0,
              supplement: null,
              winnerResults: [],
            }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (sessions) => {
          // 确保 id 唯一（避免重复 id 干扰测试）
          const uniqueSessions = sessions.map((s, i) => ({ ...s, id: `id-${i}` }));
          // 确保 savedAt 各不相同
          const distinctSessions = uniqueSessions.map((s, i) => ({ ...s, savedAt: i * 1000 + s.savedAt % 1000 }));

          store = {};
          // 逐条保存
          for (const s of distinctSessions) {
            StorageManager.saveSession(s);
          }

          const result = StorageManager.getSessions();

          // 验证严格降序
          for (let i = 0; i < result.length - 1; i++) {
            if (result[i].savedAt < result[i + 1].savedAt) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// Feature: calculator-pwa, Property 7: 删除后记录不再出现
// Validates: Requirements 6.6
// ─────────────────────────────────────────────
describe('StorageManager - Property 7: 删除后记录不再出现', () => {
  it('随机选取一个 id 执行删除后，getSessions 结果中不再包含该 id', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            title: fc.string(),
            savedAt: fc.nat(),
            winners: fc.constant([]),
            losers: fc.constant([]),
            sharedCosts: fc.constant([]),
            calcResult: fc.constant({
              winTotal: 0,
              loseTotal: 0,
              sharedTotal: 0,
              supplement: null,
              winnerResults: [],
            }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (sessions) => {
          // 确保 id 唯一
          const uniqueSessions = sessions.map((s, i) => ({ ...s, id: `uid-${i}` }));

          store = {};
          for (const s of uniqueSessions) {
            StorageManager.saveSession(s);
          }

          // 随机选取第一条的 id 执行删除（fc 已随机生成数组，取第一条即可）
          const targetId = uniqueSessions[0].id;
          StorageManager.deleteSession(targetId);

          const result = StorageManager.getSessions();
          // 结果中不应再包含该 id
          return !result.some(s => s.id === targetId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// Feature: calculator-pwa, Property 8: 主题偏好持久化往返
// Validates: Requirements 7.3
// ─────────────────────────────────────────────
describe('StorageManager - Property 8: 主题偏好持久化往返', () => {
  it('saveTheme 后 getTheme 返回相同值', () => {
    fc.assert(
      fc.property(fc.constantFrom('dark', 'light'), (theme) => {
        store = {};
        StorageManager.saveTheme(theme);
        return StorageManager.getTheme() === theme;
      }),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────
// 单元测试：边界情况
// ─────────────────────────────────────────────
describe('StorageManager - 单元测试', () => {
  it('getSessions 在 localStorage 为空时返回 []', () => {
    expect(StorageManager.getSessions()).toEqual([]);
  });

  it('getTheme 在 localStorage 为空时默认返回 dark', () => {
    expect(StorageManager.getTheme()).toBe('dark');
  });

  it('getTheme 返回已保存的 light 主题', () => {
    StorageManager.saveTheme('light');
    expect(StorageManager.getTheme()).toBe('light');
  });

  it('getSessions 在 JSON 损坏时返回 [] 并重置', () => {
    store['pwa_sessions'] = 'invalid json{{{';
    expect(StorageManager.getSessions()).toEqual([]);
    // 重置后再次读取也应返回 []
    expect(StorageManager.getSessions()).toEqual([]);
  });

  it('deleteSession 删除指定 id 后不再出现', () => {
    const s1 = { id: 'a', title: '局1', savedAt: 1000, winners: [], losers: [], sharedCosts: [], calcResult: { winTotal: 0, loseTotal: 0, sharedTotal: 0, supplement: null, winnerResults: [] } };
    const s2 = { id: 'b', title: '局2', savedAt: 2000, winners: [], losers: [], sharedCosts: [], calcResult: { winTotal: 0, loseTotal: 0, sharedTotal: 0, supplement: null, winnerResults: [] } };
    StorageManager.saveSession(s1);
    StorageManager.saveSession(s2);
    StorageManager.deleteSession('a');
    const result = StorageManager.getSessions();
    expect(result.some(s => s.id === 'a')).toBe(false);
    expect(result.some(s => s.id === 'b')).toBe(true);
  });

  it('saveSession 后 getSessions 包含该记录', () => {
    const session = { id: 'x1', title: '测试', savedAt: 9999, winners: [], losers: [], sharedCosts: [], calcResult: { winTotal: 0, loseTotal: 0, sharedTotal: 0, supplement: null, winnerResults: [] } };
    StorageManager.saveSession(session);
    const sessions = StorageManager.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(session);
  });
});
