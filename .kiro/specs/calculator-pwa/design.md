# 技术设计文档：牌局分账 PWA

## 概述

本应用是一个面向 iPhone 用户的牌局分账 PWA，通过 Safari 添加到主屏幕后以全屏 standalone 模式运行，部署于 GitHub Pages。

**核心功能**：录入赢家/输家金额 → 自动补齐差额 → 按比例分摊平摊费用 → 计算每位赢家净赢额 → 保存历史记录。

**技术约束**：
- 纯前端，无后端服务，所有数据存储于 `localStorage`
- 应用已从基础计算器 PWA 完整重写为牌局分账应用
- 目标平台：iPhone Safari，支持 iOS 16+
- 部署：GitHub Pages（静态文件托管）

---

## 架构

### 整体架构

应用采用**单页应用（SPA）+ 多视图切换**架构，无路由库，通过 JavaScript 控制视图显示/隐藏。

```
┌─────────────────────────────────────────────────────┐
│                    index.html                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  主界面视图   │  │  历史列表视图 │  │ 详情视图  │  │
│  │  (main-view) │  │ (history-view│  │(detail-view│  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│    app.js       │  │   localStorage  │
│  ┌───────────┐  │  │  ┌───────────┐  │
│  │ AppState  │  │  │  │ sessions  │  │
│  ├───────────┤  │  │  ├───────────┤  │
│  │ CalcEngine│  │  │  │ theme     │  │
│  ├───────────┤  │  │  └───────────┘  │
│  │ Storage   │  │  └─────────────────┘
│  │ Manager   │  │
│  ├───────────┤  │
│  │ UI        │  │
│  │ Renderer  │  │
│  └───────────┘  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│     sw.js       │
│  Cache-First    │
│  离线缓存策略    │
└─────────────────┘
```

### 视图切换模型

三个视图通过 CSS `display` 属性切换，同一时刻只有一个视图可见：

- **主界面视图**（`#main-view`）：录入赢家/输家/平摊费用，触发计算，保存 Session
- **历史列表视图**（`#history-view`）：展示所有已保存 Session，支持删除
- **详情视图**（`#detail-view`）：展示单条 Session 完整详情

### 模块划分

| 模块 | 职责 |
|------|------|
| `CalcEngine` | 纯函数计算模块：补齐逻辑、分摊计算、净赢额计算 |
| `StorageManager` | localStorage 读写封装 |
| `AppState` | 应用运行时状态（当前录入数据、当前视图） |
| `UIRenderer` | DOM 操作、视图渲染、事件绑定 |

---

## 组件与接口

### CalcEngine（计算引擎）

纯函数模块，不依赖 DOM 或全局状态，便于单元测试和属性测试。

```javascript
/**
 * 生成补齐条目（如需要）
 * @param {number} winTotal  - 赢方总额（非负整数）
 * @param {number} loseTotal - 输方总额（非负整数）
 * @returns {{ side: 'win'|'lose'|null, amount: number }}
 */
function computeSupplement(winTotal, loseTotal) {}

/**
 * 按比例分摊平摊费用（赢额优先进1规则：按赢额从高到低进1，赢额相同时按小数部分从大到小，总和精确等于 totalShared）
 * @param {number[]} winAmounts - 每位赢家金额（含 Supplement，至少一个元素）
 * @param {number} totalShared  - 平摊费用总额（非负整数）
 * @returns {number[]} 每位赢家的分摊金额（与 winAmounts 等长）
 */
function allocateSharedCosts(winAmounts, totalShared) {}

/**
 * 验证输入是否为正整数
 * @param {string} value - 用户输入的字符串
 * @returns {boolean}
 */
function isPositiveInteger(value) {}

/**
 * 计算分账结果（顶层入口）
 * @param {Winner[]} winners       - 赢家列表（不含 Supplement）
 * @param {Loser[]} losers         - 输家列表（不含 Supplement）
 * @param {SharedCost[]} sharedCosts - 平摊费用列表
 * @returns {CalcResult}
 */
function calculate(winners, losers, sharedCosts) {}
```

### StorageManager（存储管理）

```javascript
const StorageManager = {
  /** 读取所有历史 Session，按保存时间倒序 */
  getSessions(),        // returns Session[]

  /** 保存一条新 Session */
  saveSession(session), // session: Session, returns void

  /** 删除指定 Session */
  deleteSession(id),    // id: string, returns void

  /** 读取主题偏好，默认 'dark' */
  getTheme(),           // returns 'dark' | 'light'

  /** 保存主题偏好 */
  saveTheme(theme),     // theme: 'dark' | 'light', returns void
};
```

### UIRenderer（UI 渲染）

负责所有 DOM 操作，监听用户事件并调用 CalcEngine / StorageManager：

- `renderMainView(state)` — 渲染主界面（赢家列表、输家列表、平摊列表、计算结果）
- `renderHistoryView()` — 渲染历史列表
- `renderDetailView(session)` — 渲染 Session 详情
- `switchView(viewId)` — 切换当前可见视图
- `applyTheme(theme)` — 切换主题 CSS 类

---

## 数据模型

### 运行时状态（AppState）

```typescript
interface AppState {
  winners: Winner[];           // 用户录入的赢家列表
  losers: Loser[];             // 用户录入的输家列表
  sharedCosts: SharedCost[];   // 平摊费用列表
  calcResult: CalcResult | null; // 最新计算结果，null 表示未计算
  currentView: 'main' | 'history' | 'detail';
  detailSession: Session | null; // 当前查看的历史详情
}
```

### 核心数据类型

```typescript
interface Winner {
  id: string;      // 唯一标识（递增 ID）
  name: string;    // 赢家姓名，默认"玩家N"
  amount: number;  // 赢额，正整数
}

interface Loser {
  id: string;
  name: string;    // 输家姓名，默认"玩家N"
  amount: number;  // 输额，正整数
}

interface SharedCost {
  id: string;
  name: string;    // 费用名称，默认"费用N"
  amount: number;  // 费用金额，正整数
}

interface Supplement {
  side: 'win' | 'lose'; // 补齐条目出现在哪一侧
  amount: number;       // 补齐金额（正整数）
}

interface WinnerResult {
  id: string;
  name: string;
  winAmount: number;    // 原始赢额
  exactShare: number;   // 精确分摊额（未进1/去尾的原始比例值，用于展示保留2位小数）
  shareAmount: number;  // 整数分摊金额（经进1/去尾后的最终值，非负整数）
  netWin: number;       // 净赢额 = winAmount - shareAmount（可为负）
  isNegative: boolean;  // netWin < 0
}

interface CalcResult {
  winTotal: number;              // 赢方总额（含 Supplement）
  loseTotal: number;             // 输方总额（含 Supplement）
  sharedTotal: number;           // 平摊费用总额
  supplement: Supplement | null;
  winnerResults: WinnerResult[]; // 仅包含真实赢家，不含 Supplement 条目
}

interface Session {
  id: string;           // 唯一标识（时间戳字符串）
  title: string;        // 备注/标题
  savedAt: number;      // 保存时间戳（ms）
  winners: Winner[];
  losers: Loser[];
  sharedCosts: SharedCost[];
  calcResult: CalcResult;
}
```

### localStorage 存储结构

```
localStorage:
  "pwa_sessions"  → JSON.stringify(Session[])   // 历史记录数组，按 savedAt 倒序
  "pwa_theme"     → "dark" | "light"            // 主题偏好
```

---

## 核心算法

### 补齐逻辑（computeSupplement）

```
winTotal  = sum(winners.map(w => w.amount))
loseTotal = sum(losers.map(l => l.amount))

if winTotal > loseTotal:
    return { side: 'lose', amount: winTotal - loseTotal }
elif loseTotal > winTotal:
    return { side: 'win', amount: loseTotal - winTotal }
else:
    return null
```

补齐后，赢方有效总额 = 输方有效总额（记为 `balancedTotal`）。

### 分摊计算（allocateSharedCosts）— 最大余数法

```
n = winAmounts.length
balancedTotal = sum(winAmounts)

if sharedTotal == 0 or balancedTotal == 0:
    return Array(n).fill(0)

// 计算每人精确分摊额，取整数部分（floor）和小数部分（remainder）
exact[i]     = winAmounts[i] / balancedTotal * sharedTotal
floor[i]     = Math.floor(exact[i])
remainder[i] = exact[i] - floor[i]

// 还需要进1的名额数 = 总额 - 所有 floor 之和
roundUpCount = sharedTotal - sum(floor)

// 按赢额从高到低排序决定进1顺序；赢额相同时按小数部分从大到小
indices = [0..n-1].sort by (winAmounts[i] descending, remainder[i] descending)
for k in 0..roundUpCount-1:
    share[indices[k]] = floor[indices[k]] + 1
for k in roundUpCount..n-1:
    share[indices[k]] = floor[indices[k]]

return share
```

**特性**：
- 赢额最高的赢家一定优先进1，体现"赢得多的多承担"原则
- 赢额相同时，按小数部分大小决定（更接近精确比例的人优先进1）
- 每人分摊值只为 floor 或 floor+1，差距最多为 1
- 总和精确等于 `sharedTotal`，无尾差问题

**注意**：Supplement 条目（补齐赢家）参与分摊计算，但不出现在 `winnerResults` 中（它不是真实玩家）。

### 正整数验证（isPositiveInteger）

```
isPositiveInteger(value):
    return /^[1-9]\d*$/.test(value)
```

接受：`"1"`, `"100"`, `"9999"`  
拒绝：`"0"`, `"-1"`, `"1.5"`, `""`, `"abc"`, `"01"`, `" 1"`

---

## UI 结构

### 主界面布局

```
┌─────────────────────────────┐
│  [历史] 牌局分账  [主题切换] │  ← 顶部导航栏
├─────────────────────────────┤
│  赢方                        │
│  ┌──────┬──────────────┬──┐ │
│  │ 玩家1│  500         │×│ │  ← 姓名固定6字符宽 | 金额占剩余 | 删除
│  │ 玩家2│  300         │×│ │
│  │ 补齐 │  200  ── [补齐]│ │  ← Supplement（灰色/斜体，含"补齐"按钮）
│  └──────┴──────────────┴──┘ │
│  赢方合计：1000   [+ 添加]   │
├─────────────────────────────┤
│  输方                        │
│  ┌──────┬──────────────┬──┐ │
│  │ 玩家3│  600         │×│ │
│  │ 玩家4│  400         │×│ │
│  └──────┴──────────────┴──┘ │
│  输方合计：1000   [+ 添加]   │
├─────────────────────────────┤
│  平摊费用                    │
│  ┌──────┬──────────────┬──┐ │
│  │ 台费 │  100         │×│ │
│  └──────┴──────────────┴──┘ │
│  平摊合计：100    [+ 添加]   │
├─────────────────────────────┤
│  [计算]                      │
├─────────────────────────────┤
│  计算结果                    │
│  姓名  赢额  分摊  精确分摊  净赢   │
│  玩家1  500   63   62.50    437   │
│  玩家2  300   37   37.50    263   │  ← 负值用红色标注；精确分摊列偏灰小字
│  ──────────────────────────      │
│  合计   800  100  100.00    700   │  ← 合计行（加粗，上边框分隔）
│  [保存本局]                  │
└─────────────────────────────┘
```

### 输入验证规则

| 字段 | 规则 | 非法时处理 |
|------|------|-----------|
| 金额 | 正整数（`/^[1-9]\d*$/`） | 失焦时恢复为上一个合法值（或清空） |
| 姓名/费用名 | 非空字符串，最大 **6** 字符 | 失焦时恢复为默认名称 |
| 保存标题 | 任意字符串 | 为空时自动填充当前日期时间 |

---

## 正确性属性

*属性（Property）是在系统所有合法执行中都应成立的特征或行为——本质上是对系统应做什么的形式化陈述。属性是人类可读规范与机器可验证正确性保证之间的桥梁。*

### 属性 1：正整数输入验证

*对于任意* 字符串输入，`isPositiveInteger` 函数应当且仅当输入满足正整数条件（大于 0 的整数，无小数点、无前导零、无负号、无非数字字符）时返回 `true`；所有其他输入均应返回 `false`。

**验证需求：需求 1.4、1.5、2.4、2.5、4.3、4.4**

### 属性 2：补齐后两侧有效总额相等

*对于任意* 赢方总额和输方总额（均为非负整数），经过 `computeSupplement` 计算后，将补齐金额加入对应一侧，赢方有效总额必须等于输方有效总额。

**验证需求：需求 3.1、3.2、3.3、3.4**

### 属性 3：分摊金额之和等于平摊费用总额，且每人分摊为 floor 或 floor+1

*对于任意* 赢家金额列表（至少一位，所有金额为正整数）和非负整数平摊费用总额，`allocateSharedCosts` 的返回值应满足：
1. 所有分摊金额之和精确等于平摊费用总额
2. 每位赢家的分摊金额等于其精确比例值的 floor 或 floor+1
3. 进1的优先级按赢额从高到低排列（赢额最高者一定进1）；赢额相同时按小数部分从大到小

**验证需求：需求 5.1、5.2**

### 属性 4：净赢额等于赢额减去分摊金额

*对于任意* 赢额（正整数）和分摊金额（非负整数），`WinnerResult` 中的 `netWin` 必须精确等于 `winAmount - shareAmount`（结果可为负数），且 `isNegative` 当且仅当 `netWin < 0` 时为 `true`。

**验证需求：需求 5.3、5.4、5.5**

### 属性 5：历史记录持久化往返

*对于任意* Session 对象，调用 `StorageManager.saveSession(session)` 后再调用 `StorageManager.getSessions()`，返回的列表中应包含一条与原始 Session 所有字段值深度相等的记录。

**验证需求：需求 6.1、6.7**

### 属性 6：历史记录按保存时间倒序排列

*对于任意* 包含不同 `savedAt` 时间戳的 Session 列表，`StorageManager.getSessions()` 返回的列表应按 `savedAt` 降序排列（最新的在最前面）。

**验证需求：需求 6.4**

### 属性 7：删除后记录不再出现

*对于任意* Session 列表和其中任意一条 Session 的 `id`，调用 `StorageManager.deleteSession(id)` 后，`getSessions()` 返回的列表中不应再包含该 `id` 对应的记录。

**验证需求：需求 6.6**

### 属性 8：主题偏好持久化往返

*对于任意* 主题值（`'dark'` 或 `'light'`），调用 `StorageManager.saveTheme(theme)` 后再调用 `StorageManager.getTheme()`，应返回相同的主题值。

**验证需求：需求 7.3**

---

## 错误处理

### 输入错误

| 场景 | 处理方式 |
|------|----------|
| 金额输入非正整数 | 拒绝输入，`input` 元素失焦时恢复为上一个合法值（或清空） |
| 姓名/费用名为空 | 失焦时自动恢复为默认名称（"玩家N" / "费用N"） |
| 赢家或输家列表为空时触发计算 | 禁用计算按钮，提示需要至少各一条记录 |

### 计算边界情况

| 场景 | 处理方式 |
|------|----------|
| 平摊费用总额为 0 | 所有赢家分摊金额为 0，净赢额等于赢额 |
| 只有一位赢家 | 该赢家承担全部平摊费用（尾差逻辑退化为全额） |
| 赢家净赢额为负 | 正常显示负值，以红色/特殊样式标注（`isNegative: true`） |

### 存储错误

| 场景 | 处理方式 |
|------|----------|
| localStorage 不可用 | 捕获异常，显示提示"存储不可用，历史记录无法保存" |
| localStorage 数据损坏 | JSON 解析失败时清空并重置为空数组，不崩溃 |
| localStorage 容量超限 | 捕获 `QuotaExceededError`，提示用户删除旧记录 |

---

## 测试策略

### 单元测试与属性测试（CalcEngine + StorageManager）

使用 **Vitest** 对纯函数进行单元测试，使用 **fast-check** 进行属性测试。

每个属性测试配置最少运行 **100 次**，并通过注释标注对应设计属性：

```javascript
// Feature: calculator-pwa, Property N: <属性描述>
```

**属性测试覆盖**：

| 属性 | 测试内容 | fast-check 生成器 |
|------|----------|-------------------|
| 属性 1 | 正整数验证函数正确性 | `fc.string()` + 已知正例/反例 |
| 属性 2 | 补齐后两侧总额相等 | `fc.nat()` × 2（赢方总额、输方总额） |
| 属性 3 | 分摊之和 = 平摊总额，每人为 floor 或 floor+1 | `fc.array(fc.nat({min:1}))` + `fc.nat()` |
| 属性 4 | 净赢额 = 赢额 - 分摊额，isNegative 正确 | `fc.integer({min:1})` + `fc.nat()` |
| 属性 5 | Session 持久化往返 | `fc.record(...)` 生成随机 Session |
| 属性 6 | 历史记录倒序排列 | `fc.array(fc.record({savedAt: fc.nat()}))` |
| 属性 7 | 删除后记录不再出现 | `fc.array(...)` + 随机选取一个 id |
| 属性 8 | 主题偏好往返 | `fc.constantFrom('dark', 'light')` |

**示例单元测试**（具体边界情况）：

```javascript
// computeSupplement
computeSupplement(800, 600) → { side: 'lose', amount: 200 }
computeSupplement(600, 800) → { side: 'win', amount: 200 }
computeSupplement(600, 600) → null
computeSupplement(0, 0)     → null

// allocateSharedCosts（赢额优先进1规则）
allocateSharedCosts([500, 300], 100) → [63, 37]  // 精确值 62.5/37.5，赢额 500 > 300，500 先进1
allocateSharedCosts([500], 100)      → [100]      // 单人全额
allocateSharedCosts([500, 300], 0)   → [0, 0]    // 平摊为 0
allocateSharedCosts([400, 300, 300], 100) → [40, 30, 30]  // 精确值整除，无需进1

// isPositiveInteger
isPositiveInteger("1")    → true
isPositiveInteger("100")  → true
isPositiveInteger("0")    → false
isPositiveInteger("-1")   → false
isPositiveInteger("1.5")  → false
isPositiveInteger("01")   → false
isPositiveInteger("")     → false
isPositiveInteger("abc")  → false
```

### 手动测试（iPhone Safari）

- 添加到主屏幕后以 standalone 模式启动
- 安全区域适配（刘海、底部 Home 指示条）
- 离线使用（关闭 Wi-Fi 后核心功能正常运行）
- 主题切换持久化（关闭重开后恢复上次主题）
- 触控反馈（按压动画、无文本选中、无缩放）
- 历史记录保存/查看/删除完整流程

---

## 实现说明

### 文件结构

```
calculator-pwa/
├── index.html          # 三个视图的 HTML 结构（主界面/历史/详情）
├── app.js              # CalcEngine + StorageManager + UIRenderer（内联合并）
├── calc-engine.js      # CalcEngine 纯函数模块（独立，供测试使用）
├── storage-manager.js  # StorageManager 模块（独立，供测试使用）
├── style.css           # 分账 UI 样式，支持深色/浅色主题
├── manifest.json       # PWA 配置（应用名称"牌局分账"）
├── sw.js               # Cache-First 离线缓存策略（版本 pwa-v2）
├── calc-engine.test.js # CalcEngine 属性测试 + 单元测试
├── storage-manager.test.js # StorageManager 属性测试 + 单元测试
├── package.json        # vitest + fast-check 测试依赖
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

### PWA 配置更新

`manifest.json` 需更新：
- `name`: `"牌局分账"`
- `short_name`: `"分账"`
- `description`: `"牌局赢输金额分账计算"`
- `theme_color` / `background_color`: 保持深色 `#1c1c1e`

### 主题实现

通过在 `<html>` 元素上切换 CSS 类实现主题：

```css
/* 深色主题（默认） */
:root {
  --bg: #1c1c1e;
  --surface: #2c2c2e;
  --text-primary: #ffffff;
  --text-secondary: rgba(255,255,255,0.55);
  --accent: #ff9f0a;       /* 主题色，用于按钮、链接、补齐按钮边框/文字 */
  --danger: #ff453a;
  --supplement: rgba(255,255,255,0.3);  /* 补齐条目文字颜色 */
}

/* 浅色主题 */
html.light {
  --bg: #f2f2f7;
  --surface: #ffffff;
  --text-primary: #1c1c1e;
  --text-secondary: rgba(0,0,0,0.45);
  --accent: #ff9f0a;
  --danger: #ff3b30;
  --supplement: rgba(0,0,0,0.25);
}
```

### iPhone 安全区域适配

```css
.app-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  height: 100dvh;
}
```

### GitHub Pages 部署

- 仓库 `calculator-pwa/` 子目录作为 Pages 源
- Service Worker 的缓存路径需与实际部署路径一致
- 若部署在子路径（如 `/calculator-pwa/`），需相应调整 `manifest.json` 的 `start_url` 和 `sw.js` 的 `ASSETS` 列表
