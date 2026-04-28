# 实现计划：牌局分账 PWA

## 概述

将现有基础计算器 PWA 完全重写为牌局分账应用。实现顺序：核心计算引擎（含属性测试）→ 存储层 → HTML 结构 → CSS 样式 → UI 渲染与交互 → PWA 配置更新。

## 任务

- [x] 1. 搭建测试框架与项目结构
  - 在 `calculator-pwa/` 目录下初始化 `package.json`，安装 `vitest` 和 `fast-check` 作为开发依赖
  - 创建 `calculator-pwa/calc-engine.test.js` 和 `calculator-pwa/storage-manager.test.js` 测试文件骨架
  - 在 `package.json` 中配置 `"test": "vitest --run"` 脚本
  - _需求：8.1（静态资源结构）_

- [x] 2. 实现 CalcEngine 计算引擎
  - [x] 2.1 实现 `isPositiveInteger(value)` 函数
    - 在 `app.js` 中编写 `isPositiveInteger`，使用正则 `/^[1-9]\d*$/` 验证输入
    - _需求：1.4、1.5、2.4、2.5、4.3、4.4_

  - [x]* 2.2 为 `isPositiveInteger` 编写属性测试
    - **属性 1：正整数输入验证**
    - 使用 `fc.string()` 生成任意字符串，验证函数当且仅当输入为正整数时返回 `true`
    - 补充已知正例（`"1"`, `"100"`）和反例（`"0"`, `"-1"`, `"1.5"`, `"01"`, `""`）的单元测试
    - 注释格式：`// Feature: calculator-pwa, Property 1: 正整数输入验证`
    - **验证：需求 1.4、1.5、2.4、2.5、4.3、4.4**

  - [x] 2.3 实现 `computeSupplement(winTotal, loseTotal)` 函数
    - 按设计文档算法：赢方多则补输方，输方多则补赢方，相等返回 `null`
    - _需求：3.1、3.2、3.3、3.4_

  - [x]* 2.4 为 `computeSupplement` 编写属性测试
    - **属性 2：补齐后两侧有效总额相等**
    - 使用 `fc.nat()` × 2 生成任意非负整数对，验证补齐后两侧总额相等
    - 补充边界单元测试：`(800,600)→{side:'lose',amount:200}`、`(600,600)→null`、`(0,0)→null`
    - 注释格式：`// Feature: calculator-pwa, Property 2: 补齐后两侧有效总额相等`
    - **验证：需求 3.1、3.2、3.3、3.4**

  - [x] 2.5 实现 `allocateSharedCosts(winAmounts, totalShared)` 函数
    - 按设计文档 ceiling 策略：前 n-1 位向上取整，最后一位承担尾差
    - 处理 `totalShared === 0` 时返回全零数组的边界情况
    - _需求：5.1、5.2_

  - [x]* 2.6 为 `allocateSharedCosts` 编写属性测试
    - **属性 3：分摊金额之和等于平摊费用总额，且前 n-1 位为 ceiling 值**
    - 使用 `fc.array(fc.nat({min:1}), {minLength:1})` + `fc.nat()` 生成测试数据
    - 验证：① 所有分摊之和精确等于 `totalShared`；② 前 n-1 位等于 ceiling 值
    - 补充单元测试：`([500,300],100)→[63,37]`、`([500],100)→[100]`、`([500,300],0)→[0,0]`
    - 注释格式：`// Feature: calculator-pwa, Property 3: 分摊之和等于平摊总额且前n-1位为ceiling`
    - **验证：需求 5.1、5.2**

  - [x] 2.7 实现 `calculate(winners, losers, sharedCosts)` 顶层入口函数
    - 组合 `computeSupplement` 和 `allocateSharedCosts`，构建完整 `CalcResult`
    - 计算每位赢家的 `netWin = winAmount - shareAmount`，设置 `isNegative` 标志
    - Supplement 条目参与分摊计算但不出现在 `winnerResults` 中
    - _需求：5.1、5.2、5.3、5.4、5.5、5.6_

  - [x]* 2.8 为 `calculate` 中的净赢额逻辑编写属性测试
    - **属性 4：净赢额等于赢额减去分摊金额**
    - 使用 `fc.nat({min:1})` + `fc.nat()` 生成赢额和分摊额，验证 `netWin = winAmount - shareAmount` 且 `isNegative` 当且仅当 `netWin < 0`
    - 注释格式：`// Feature: calculator-pwa, Property 4: 净赢额等于赢额减去分摊金额`
    - **验证：需求 5.3、5.4、5.5**

- [x] 3. 检查点 —— 确保计算引擎测试全部通过
  - 运行 `npm test`，确保所有属性测试和单元测试通过，如有问题请告知。

- [x] 4. 实现 StorageManager 存储管理模块
  - [x] 4.1 实现 `StorageManager` 对象及其所有方法
    - 实现 `getSessions()`：从 `localStorage["pwa_sessions"]` 读取并按 `savedAt` 倒序返回
    - 实现 `saveSession(session)`：追加到数组并写回 localStorage
    - 实现 `deleteSession(id)`：过滤掉对应 id 后写回 localStorage
    - 实现 `getTheme()` / `saveTheme(theme)`：读写 `localStorage["pwa_theme"]`，默认返回 `'dark'`
    - 处理 localStorage 不可用、JSON 解析失败、`QuotaExceededError` 三种异常情况
    - _需求：6.1、6.4、6.6、6.7、7.3_

  - [x]* 4.2 为 `StorageManager.saveSession` / `getSessions` 编写属性测试
    - **属性 5：历史记录持久化往返**
    - 使用 `fc.record(...)` 生成随机 Session 对象，验证 save 后 get 返回的列表中包含深度相等的记录
    - 每次测试前重置 localStorage mock（使用 `vitest` 的 `vi.stubGlobal`）
    - 注释格式：`// Feature: calculator-pwa, Property 5: Session持久化往返`
    - **验证：需求 6.1、6.7**

  - [x]* 4.3 为 `getSessions` 排序行为编写属性测试
    - **属性 6：历史记录按保存时间倒序排列**
    - 使用 `fc.array(fc.record({savedAt: fc.nat()}), {minLength:2})` 生成多条记录，验证返回列表严格按 `savedAt` 降序排列
    - 注释格式：`// Feature: calculator-pwa, Property 6: 历史记录按savedAt倒序排列`
    - **验证：需求 6.4**

  - [x]* 4.4 为 `deleteSession` 编写属性测试
    - **属性 7：删除后记录不再出现**
    - 生成随机 Session 数组，随机选取一个 id 执行删除，验证 `getSessions()` 结果中不再包含该 id
    - 注释格式：`// Feature: calculator-pwa, Property 7: 删除后记录不再出现`
    - **验证：需求 6.6**

  - [x]* 4.5 为 `saveTheme` / `getTheme` 编写属性测试
    - **属性 8：主题偏好持久化往返**
    - 使用 `fc.constantFrom('dark', 'light')` 验证 save 后 get 返回相同值
    - 注释格式：`// Feature: calculator-pwa, Property 8: 主题偏好持久化往返`
    - **验证：需求 7.3**

- [x] 5. 检查点 —— 确保存储层测试全部通过
  - 运行 `npm test`，确保所有属性测试和单元测试通过，如有问题请告知。

- [x] 6. 重写 `index.html` HTML 结构
  - [x] 6.1 编写 HTML 骨架与 PWA meta 标签
    - 设置 `viewport` 禁用缩放（`maximum-scale=1.0, user-scalable=no`）
    - 添加 `apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style` 等 iOS PWA meta 标签
    - 引入 `style.css`、`app.js`（`type="module"` 或普通脚本）
    - _需求：8.3、8.4、9.1_

  - [x] 6.2 编写三个视图的 HTML 结构
    - `#main-view`：顶部导航栏（历史按钮、标题、主题切换按钮）、赢方区域、输方区域、平摊费用区域、计算按钮、计算结果区域
    - `#history-view`：返回按钮、历史列表容器
    - `#detail-view`：返回按钮、Session 详情容器
    - 所有动态内容区域预留空 `<div>` 容器，由 JS 填充
    - _需求：1.1、2.1、4.1、5.6、6.4、6.5_

- [x] 7. 重写 `style.css` 样式
  - [x] 7.1 实现 CSS 变量与主题系统
    - 定义 `:root` 深色主题变量和 `html.light` 浅色主题变量（按设计文档中的色值）
    - _需求：7.1、7.2_

  - [x] 7.2 实现布局与 iPhone 适配样式
    - `.app-container` 使用 `height: 100dvh` 和 `env(safe-area-inset-*)` 内边距
    - 禁用 `-webkit-tap-highlight-color`、`user-select: none`
    - _需求：8.5、9.2、9.3、9.5_

  - [x] 7.3 实现各组件样式
    - 录入行（姓名输入框 + 金额输入框 + 删除按钮）、Supplement 条目（灰色/斜体）、计算结果行（负值红色标注）
    - 按钮按压动画（`:active` 缩放或亮度变化）
    - 历史列表卡片、详情视图布局
    - _需求：3.5、5.4、6.4、6.5、9.4_

- [x] 8. 实现 UIRenderer 与 AppState（`app.js` 主逻辑）
  - [x] 8.1 实现 AppState 初始化与视图切换
    - 定义 `AppState` 对象，初始化 `winners`、`losers`、`sharedCosts`、`calcResult`、`currentView`、`detailSession`
    - 实现 `switchView(viewId)` 通过 CSS `display` 切换三个视图
    - 启动时从 `StorageManager.getTheme()` 读取主题并调用 `applyTheme()`
    - _需求：7.3、7.4_

  - [x] 8.2 实现赢方/输方/平摊费用的增删与实时渲染
    - 实现"添加赢家"、"添加输家"、"添加平摊费用"按钮的事件处理
    - 实现删除按钮事件处理，删除后重新渲染对应列表
    - 实现姓名和金额输入框的 `blur` 事件验证（非正整数恢复原值；姓名为空恢复默认名）
    - 实时更新赢方/输方/平摊合计显示，并同步更新 Supplement 条目
    - _需求：1.1–1.7、2.1–2.7、3.1–3.5、4.1–4.6_

  - [x] 8.3 实现计算触发与结果渲染
    - 实现"计算"按钮：赢家或输家列表为空时禁用按钮并提示
    - 调用 `calculate()` 获取 `CalcResult`，调用 `renderMainView` 渲染结果区域
    - 结果区域显示每位赢家的姓名、赢额、分摊金额、净赢额；负值添加红色样式类
    - _需求：5.1–5.6_

  - [x] 8.4 实现保存 Session 功能
    - 计算完成后显示"保存本局"按钮
    - 点击后弹出标题输入（`prompt` 或内联输入框），为空时自动填充当前日期时间
    - 构建 `Session` 对象并调用 `StorageManager.saveSession()`
    - _需求：6.1、6.2、6.3_

  - [x] 8.5 实现历史列表视图渲染与交互
    - `renderHistoryView()`：调用 `StorageManager.getSessions()` 渲染列表，每条显示标题和保存时间
    - 点击列表项切换到详情视图，点击删除按钮调用 `StorageManager.deleteSession()` 后刷新列表
    - _需求：6.4、6.5、6.6_

  - [x] 8.6 实现详情视图渲染
    - `renderDetailView(session)`：展示 Session 完整信息（赢方、输方、平摊、计算结果）
    - _需求：6.5_

  - [x] 8.7 实现主题切换
    - 主题切换按钮点击时调用 `applyTheme()` 切换 `html` 元素的 `light` 类，并调用 `StorageManager.saveTheme()`
    - _需求：7.1、7.2、7.3_

- [x] 9. 更新 PWA 配置文件
  - [x] 9.1 更新 `manifest.json`
    - 将 `name` 改为 `"牌局分账"`，`short_name` 改为 `"分账"`，`description` 改为 `"牌局赢输金额分账计算"`
    - 确认 `display: "standalone"`、`theme_color: "#1c1c1e"`、`background_color: "#1c1c1e"`
    - 确认图标路径（192×192 和 512×512）正确
    - _需求：8.3、8.4_

  - [x] 9.2 检查并更新 `sw.js` 缓存资源列表
    - 确保 `ASSETS` 列表包含所有必要静态资源（`index.html`、`app.js`、`style.css`、`manifest.json`、图标文件）
    - 确认缓存路径与 GitHub Pages 实际部署路径一致
    - _需求：8.1、8.2_

- [x] 10. 最终检查点 —— 确保所有测试通过
  - 运行 `npm test`，确保全部属性测试和单元测试通过，如有问题请告知。

## 备注

- 标有 `*` 的子任务为可选项，可跳过以加快 MVP 交付
- 每个任务均引用具体需求条款以保证可追溯性
- 检查点确保增量验证，避免错误积累
- 属性测试验证计算引擎和存储层的通用正确性，单元测试覆盖具体边界情况
- `app.js` 采用单文件结构，所有模块（`CalcEngine`、`StorageManager`、`UIRenderer`）均在同一文件中以对象/函数形式组织
