/**
 * 日志正文（`message`）→ 中文渲染。
 *
 * 与 `logTitles.js` 同一思路：日志数据保持英文原样（`lib/parser.js`、日志搜索、
 * CSV 导出都靠英文关键词与 `key=value` 匹配），只在**渲染时**查字典替换。
 *
 * 为什么不是逐句翻译：
 *   一轮真实运行的 472 行日志里有 207 个不同模板，逐句翻既跟不上上游更新，
 *   也会让「没见过的日志」永远是英文。而其中一半以上是结构化形态：
 *
 *       Account balance observed | currentBalance=18457 | initialPoints=18457
 *
 *   所以拆成两个有限集合去翻：**前缀短语** + **字段名**。
 *   值是标识符或数字（`offerId=ENWW_...`、`currentBalance=18457`），照原样保留。
 *
 * 占位符：
 *   {n}   数字（含小数）
 *   {s}   单个非空白 token（邮箱、路径、时区等）
 *   {rest} 行尾剩余内容
 */

const PHRASES = [
  // ── 启动 / 配置 ────────────────────────────────────────────────
  ["Starting Microsoft Rewards Script", "启动微软奖励脚本"],
  ["Config ready.", "配置就绪"],
  ["config.json is up to date.", "config.json 已是最新"],
  ["Applied {n} override(s).", "已应用 {n} 项配置覆盖"],
  ["Scheduler started (TZ={s})", "调度器已启动（时区={s}）"],
  ["Applied env schedule: {rest}", "已应用环境变量调度：{rest}"],
  ["Starting Control API on {s}", "启动控制接口：{s}"],
  ["Found {n} account(s) in environment", "环境变量中发现 {n} 个账号"],
  ["Starting run: {rest}", "开始运行：{rest}"],
  ["Run started (pid {n}).", "运行已启动（进程 {n}）"],
  [
    "Browser mode enabled - starting desktop-first, trying Daily Set and More Rewards in the flyout before /earn fallbacks, and using rendered controls for web activities.",
    "浏览器模式已启用：先走桌面端，在 flyout 里尝试每日任务与更多奖励，再回落到 /earn，网页任务使用页面渲染控件",
  ],

  // ── 账号 ───────────────────────────────────────────────────────
  ["Starting account: {s}", "开始处理账号：{s}"],
  ["Finished account: {s}", "账号处理结束：{s}"],
  ["Completed all accounts", "所有账号处理完成"],
  ["Account balance observed", "账户余额"],
  ["Account information observed", "账号信息"],

  // ── 登录 ───────────────────────────────────────────────────────
  ["Starting login process", "开始登录"],
  ["Successfully logged in", "登录成功"],
  ["Selecting Microsoft Authenticator sign-in", "选择 Microsoft Authenticator 登录"],
  ["Please approve login on your authenticator app", "请在 Authenticator 上批准登录"],
  ["Waiting for approval... (timeout after {n} seconds)", "等待批准…（{n} 秒后超时）"],
  ["Still waiting... ({n}/{n} seconds elapsed)", "仍在等待…（{n}/{n} 秒）"],
  ["Approval detected", "已检测到批准"],
  ["Login approved successfully", "登录批准成功"],
  ["State check iteration {n}/{n}", "登录状态检查 {n}/{n}"],
  ["Accepting KMSI prompt", "接受「保持登录」提示"],
  ["Skipping Passkey prompt", "跳过 Passkey 提示"],
  [
    "Discarding saved cookies because the paired fingerprint is unavailable or incompatible",
    "丢弃已保存的 Cookie：配对指纹缺失或不兼容",
  ],
  ["Entering email", "输入邮箱"],
  ["Email entered successfully", "邮箱已输入"],
  ["Entering password", "输入密码"],
  ["Password entered successfully", "密码已输入"],

  // ── 浏览器 ─────────────────────────────────────────────────────
  ["Desktop browser started", "桌面浏览器已启动"],
  ["Mobile browser started", "移动浏览器已启动"],
  ["Browser context closed", "浏览器上下文已关闭"],
  ["Browser was already closed.", "浏览器已关闭"],
  ["Mobile opened for: {s}", "已打开移动端：{s}"],
  ["No rendered visual-search activation control matched", "未找到可用的图片搜索激活控件"],

  // ── 任务 ───────────────────────────────────────────────────────
  ["Starting flyout task pass", "开始 flyout 任务轮"],
  ["Starting /earn task pass for remaining tasks", "开始 /earn 任务轮（剩余任务）"],
  ["Completed flyout and earn task passes", "flyout 与 /earn 任务轮完成"],
  ["Waiting before next task", "等待下一个任务"],
  ["Bing Search Streak completed today", "Bing 搜索连续天数今日已完成"],
  ["Daily Set Streak completed today", "每日任务连续天数今日已完成"],
  ["Bing App Streak completed today", "Bing 应用连续天数今日已完成"],
  ["Bing App Streak is already completed today; skipping Daily Check-In", "Bing 应用连续天数今日已完成，跳过每日签到"],
  ["Claimable bonus points could not be verified; skipping claim request", "无法确认可领取的奖励积分，跳过领取"],
  ["Bonus point claim", "奖励积分领取"],
  ["Search perk", "搜索加成"],
  ["Streak protection", "连续保护"],
  ["Visual Search", "图片搜索"],
  ["Earnable today", "今日可获取"],
  ["App points available: {n}", "应用端可获取积分：{n}"],
  ["Search summary", "搜索汇总"],
  ["User data source unavailable", "用户数据源不可用"],
  ["Run partial (code {n}).", "运行部分完成（退出码 {n}）"],
  ["Applied {n} response cookie(s) and persisted the updated session", "已应用 {n} 个响应 Cookie 并保存会话"],
  ["Refreshed cookie cache", "刷新 Cookie 缓存"],

  // ── 搜索 ───────────────────────────────────────────────────────
  ["Queries acquired", "搜索词获取完成"],
  ["Search activity", "搜索任务"],
  ["Waiting before next search", "等待下一次搜索"],
  ["Scrolling results", "滚动搜索结果"],
  ["Clicked a result", "点击了一个结果"],
  ["Visit finished", "访问完成"],

  // ── 启动说明（一次性长句）─────────────────────────────────────
  ["Starting session for {s}", "为 {s} 启动会话"],
  ["Read from Chromium", "读取自 Chromium"],
  ["Sign-in evidence", "登录依据"],
  ["Bing session verified successfully", "Bing 会话校验通过"],
  ["App-only API exceptions enabled in browser mode: {rest}", "浏览器模式下仅走 API 的任务例外：{rest}"],

  // ── 任务节奏 / 会话（调试）──────────────────────────────────────
  ["Task delay checked", "任务间隔已检查"],
  ["Task delay unchanged", "任务间隔未变"],
  ["Task delay scheduled", "任务间隔已安排"],
  ["Parsed streak protection", "解析连续保护"],
  ["At Bing page: {rest}", "当前在 Bing 页面：{rest}"],
  ["Daily streak reset", "每日连续天数重置"],
  ["Chromium process closed", "Chromium 进程已关闭"],
  ["Desktop signed in; session saved", "桌面端已登录，会话已保存"],
  ["User data loaded", "用户数据已加载"],
  ["No protection days remain; skipping", "没有剩余保护天数，跳过"],
  ["Cleaned saved session", "已清理保存的会话"],
  [
    "Saved fingerprint locale or browser profile changed; generating a replacement for {s}",
    "已存指纹的语言或浏览器配置已变化，为 {s} 重新生成",
  ],
  ["Passkey prompt skipped", "已跳过 Passkey 提示"],
  ["KMSI prompt accepted", "已接受「保持登录」提示"],
  ["Dismissed: cookie consent banner (Accept)", "已关闭 Cookie 同意横幅（接受）"],
  ["Requesting app access token", "正在请求应用访问令牌"],
  ["Auth URL constructed: {rest}", "已构造授权地址：{rest}"],
  ["OAuth code resolved, exchanging for access token", "已获得授权码，正在换取访问令牌"],
  ["App access token received", "已获取应用访问令牌"],
  ["No eligible pending App Promotions are available", "没有可用的待处理应用推广任务"],
  ["Skipping on mobile - desktop-only activity", "移动端跳过：该任务仅限桌面端"],
  ["Points collected", "积分已统计"],
  ["Sequential sessions: finish and close desktop before opening mobile", "顺序执行：桌面端完成并关闭后再打开移动端"],
  [
    "No visual-search streak in the snapshot - falling back to the activation offer",
    "快照中没有图片搜索连续任务，回退到激活任务",
  ],
  ["Bing App Streak state", "Bing 应用连续天数状态"],
  ["Daily Check-In", "每日签到"],
  ["App data", "应用数据"],
  ["Available sign-in methods: {rest}", "可用登录方式：{rest}"],
  ["Launching bundled Chromium", "启动内置 Chromium"],
  ["Restoring saved browser session", "恢复已保存的浏览器会话"],
  [
    "doVisualSearch will use the rendered Rewards activation control and Bing Visual Search UI.",
    "doVisualSearch 将使用页面渲染的奖励激活控件与 Bing 图片搜索界面。",
  ],
  [
    "doClaimBonusPoints always claims through the API in both modes.",
    "doClaimBonusPoints 在两种模式下始终通过 API 领取。",
  ],
  [
    "Browser mode enabled - starting desktop-first, trying Daily Set and More Rewards in the flyout before /earn fallbacks, and using rendered controls for web activities.",
    "浏览器模式：先走桌面端，在 flyout 里尝试每日任务与更多奖励，再回落到 /earn，网页任务使用页面渲染控件",
  ],

  // ── 调试：登录状态机 ───────────────────────────────────────────
  ["Current state: {state}", "当前状态：{state}"],
  ["Processing state: {state}", "处理状态：{state}"],
  ["State transition: {state} → {state}", "状态流转：{state} → {state}"],
  ["Opening alternative sign-in methods", "打开其它登录方式"],
  ["Handling passwordless authentication", "处理免密登录"],
  ["Passwordless authentication requested", "已请求免密登录"],
  ["Passwordless authentication completed successfully", "免密登录完成"],
  ["Finalizing login", "登录收尾"],
  ["Logged into Microsoft Rewards successfully", "已登录微软奖励"],
  ["Starting Bing session verification", "开始校验 Bing 会话"],
  ["Verifying Bing session", "校验 Bing 会话"],
  ["Verification loop {n}/{n}", "校验循环 {n}/{n}"],
  ["At Bing page: {s}", "当前在 Bing 页面：{s}"],
  ["Acquiring rewards context", "获取奖励上下文"],
  ["Bootstrapping rewards context", "初始化奖励上下文"],
  ["Saving session", "保存会话"],
  ["Login completed, session saved", "登录完成，会话已保存"],
  ["Persisted live browser session", "已保存实时浏览器会话"],
  ["Browser context ready", "浏览器上下文就绪"],
  ["Created context", "已创建浏览器上下文"],
  ["Detected bundled engine {s}", "检测到内置浏览器引擎 {s}"],
  ["Modified request body: {rest}", "已修改请求体：{rest}"],
  ["Email submitted", "邮箱已提交"],
  ["Password submitted", "密码已提交"],

  // ── 调试：页面解析 ─────────────────────────────────────────────
  ["Concatenated flight chunks", "合并页面数据块"],
  ["Parsed offers", "解析优惠项"],
  ["Parsed offer ids", "解析任务 ID"],
  ["Parsed streaks", "解析连续天数"],
  ["Parsed account", "解析账号"],
  ["Parsed quest children", "解析任务子项"],
  ["Snapshot complete", "快照完成"],
  ["Read rendered Bing Rewards flyout", "读取 flyout 渲染结果"],
  ["Read rendered /earn cards", "读取 /earn 卡片"],
  ["Rendered Daily Set readiness unavailable; using displayed cards only", "无法确认每日任务就绪状态，改用已显示卡片"],
  ["Using rendered Daily Set", "使用已渲染的每日任务"],
  ["No search multiplier is available", "当前没有搜索加成"],
  ["Mobile: skip (disabled, quota unavailable)", "移动端：跳过（已禁用或配额不可用）"],
  ["Quest progress", "打卡进度"],
  ["User data received", "已获取用户数据"],
  ["Found {n} incomplete quest(s)", "发现 {n} 个未完成打卡"],
  ["Run cancelled (code {n}).", "运行已取消（退出码 {n}）"],
  ["Browser was already closed.", "浏览器已关闭"],
];

/** 登录状态机的枚举值。这类值只在固定短语里出现，因此单独映射，不做全局替换。 */
const STATES = {
  EMAIL_INPUT: "邮箱输入",
  PASSWORD_INPUT: "密码输入",
  FOOTER_ACTION: "页脚操作",
  SIGN_IN_METHOD_PICKER: "登录方式选择",
  LOGIN_PASSWORDLESS: "免密登录",
  LOGIN_TOTP: "验证码登录",
  LOGIN_CODE: "登录验证码",
  RECOVERY_EMAIL: "备用邮箱验证",
  KMSI_PROMPT: "保持登录提示",
  PASSKEY_ERROR: "Passkey 提示",
  LOGGED_IN: "已登录",
  ACCOUNT_LOCKED: "账号被锁定",
  ERROR: "异常",
};

/** 状态/结果类枚举值（`status=partial`、`points earned: unverified`）。 */
const VALUES = {
  partial: "部分完成",
  completed: "已完成",
  complete: "已完成",
  failed: "失败",
  success: "成功",
  skipped: "已跳过",
  unavailable: "不可用",
  incomplete: "未完成",
  cancelled: "已取消",
  running: "运行中",
  idle: "空闲",
  unknown: "未知",
  unverified: "未确认",
  no: "否",
  yes: "是",
  verified: "已验证",
  enabled: "已启用",
  disabled: "已禁用",
  "disabled-root": "已禁用(root)",
  true: "是",
  false: "否",
};

/**
 * `|` 分隔的自由文本片段（不是 key=value 形态）。
 * 正文里这类片段最多，不翻就会出现「前半句中文、后半句英文」的夹生行。
 */
const SEGMENTS = {
  "could not be enabled or verified": "无法启用或验证",
  "No streak protection days remain": "没有剩余的连续保护天数",
  "completion not confirmed": "完成状态未确认",
  "claimable bonus unknown": "可领取奖励未知",
  "points earned: unverified": "获得积分：未确认",
  "Offer activation could not be started because its rendered control was not found":
    "未找到渲染控件，无法开始任务激活",
  "Offer activation could not be started": "无法开始任务激活",
  "Request deadline exceeded": "请求超时",
  "No search multiplier is offered to this account": "该账号没有搜索加成",
  Punchcard: "打卡任务",
  Punchcards: "打卡任务",
  "Run cancelled": "运行已取消",
  "Search perk": "搜索加成",
  "Visual Search": "图片搜索",
  "Bonus point claim": "奖励积分领取",
  "User data source unavailable": "用户数据源不可用",
  "could not be verified": "无法确认",
  "unavailable (skipped)": "不可用（已跳过）",
  "pending mobile sign-in": "等待移动端登录",
  "browser and app Chrome versions follow this engine": "浏览器与应用端 Chrome 版本均跟随此引擎",
  "These workers still obtain an app access token and use the Microsoft Rewards app-platform API.":
    "这些任务仍会获取应用访问令牌并调用微软奖励应用平台 API。",
};

/** 形如 `activities: 1 completed, 3 incomplete, …` 的汇总片段。 */
const COUNT_SUMMARY =
  /^activities:\s*(\d+)\scompleted,\s*(\d+)\sincomplete,\s*(\d+)\sunavailable,\s*(\d+)\snot applicable$/;

const FIELDS = {
  // 通用
  status: "状态",
  reason: "原因",
  message: "消息",
  source: "来源",
  via: "经由",
  path: "路径",
  attempt: "尝试次数",
  total: "总数",
  level: "等级",
  warnings: "警告",
  activity: "任务",
  offerId: "任务ID",
  progress: "进度",
  page: "页面",
  pages: "页数",
  chunks: "分块",
  length: "长度",
  reportable: "可上报",

  // 积分 / 连续
  pointsGained: "获得积分",
  previousBalance: "运行前余额",
  currentBalance: "当前余额",
  initialPoints: "初始积分",
  pointsProgress: "积分类别进度",
  pointsRemaining: "剩余积分",
  bonus: "奖励",
  streak: "连续天数",
  streakCounter: "连续计数",
  durationSeconds: "用时(秒)",
  runtimeMinutes: "耗时(分钟)",
  accountsProcessed: "处理账号数",

  // 时间 / 会话
  waitMs: "等待毫秒",
  elapsedMs: "已耗时(毫秒)",
  remainingMs: "剩余(毫秒)",
  localDate: "本地日期",
  mobile: "移动端",
  desktop: "桌面端",
  shouldUseFingerprint: "需用指纹",
  savedFingerprintPresent: "已存指纹",
  profileMatch: "配置匹配",
  localeMatch: "语言匹配",

  // 任务 / 搜索
  expectedCards: "预期卡片",
  renderedCards: "已渲染卡片",
  maxSearches: "最大搜索次数",
  completedSearches: "已完成搜索",
  offers: "优惠项",
  offerIds: "任务ID列表",
  quests: "任务数",
  cards: "卡片",
  incomplete: "未完成",
  quota: "配额",
  attempts: "尝试次数",
  perSource: "分源",
  streakProtectionEnabled: "连续保护",
  remainingDays: "剩余天数",

  // 启动摘要里用冒号分隔的字段（`Accounts: 1`、`geoLocale: CN`）
  Accounts: "账号数",
  Clusters: "集群数",
  geoLocale: "地区",
  locale: "语言",
  Mobile: "移动端",
  Browser: "浏览器端",
  App: "应用端",
  isRealEdge: "真实 Edge",
  headless: "无头模式",
  clicks: "点击方式",
  proxy: "代理",
  tls: "TLS",
  sandbox: "沙箱",
  cookies: "Cookie 数",
  origins: "来源数",
  ageMinutes: "已存分钟",
  profile: "配置",
  engine: "引擎",
  screen: "屏幕",
  pixelRatio: "像素比",
  persisted: "已保存",
  platform: "平台",
  timezone: "时区",
  offset: "偏移(分)",
  userDataSource: "用户数据源",
  previous: "之前",
  current: "当前",
  evidence: "依据",
  operationId: "操作ID",
  lifetimeEarn: "累计积分",
  session: "会话",
  account: "账号",
  dailySet: "每日任务",
  more: "更多奖励",
  bing: "Bing",
  available: "可用",
  toGo: "待获取",
  lifetime: "累计",
  streaks: "连续天数",
  streakProtectionRemainingDays: "连续保护剩余天数",
  "page.waitForFunction": "页面等待函数",
};

/** 把 `{n}` / `{s}` / `{rest}` 模板编译成可复用正则。 */
function compile(pattern) {
  const slots = [];
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.startsWith("{n}", i)) {
      slots.push("n");
      source += "(-?\\d+(?:\\.\\d+)?)";
      i += 2;
    } else if (pattern.startsWith("{s}", i)) {
      slots.push("s");
      source += "(\\S+)";
      i += 2;
    } else if (pattern.startsWith("{state}", i)) {
      slots.push("state");
      source += "([A-Z][A-Z0-9_]*)";
      i += 6;
    } else if (pattern.startsWith("{rest}", i)) {
      slots.push("rest");
      source += "([\\s\\S]+)";
      i += 5;
    } else {
      source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return { re: new RegExp(`^${source}$`), slots };
}

const COMPILED = PHRASES.map(([pattern, zh]) => ({ ...compile(pattern), zh }));

/** 按模板渲染成中文；未命中返回 null。 */
function renderPhrase(text) {
  for (const { re, slots, zh } of COMPILED) {
    const m = text.match(re);
    if (!m) continue;
    let i = 0;
    // 占位符按出现顺序依次替换；{state} 额外过一次枚举映射
    return zh.replace(/\{(?:n|s|rest|state)\}/g, () => {
      i += 1;
      const value = m[i] ?? "";
      const slot = slots[i - 1];
      if (slot === "state") return STATES[value] || value;
      // `{rest}` 常是一整句尾巴（`Modified request body: …`），能整段命中片段表就换掉
      if (slot === "rest") return SEGMENTS[value.trim()] ?? value;
      return value;
    });
  }
  return null;
}

/**
 * 翻译一个值（`status=partial` 的 `partial`、`points earned: unverified` 的
 * `unverified`、`reason="…"` 里带引号的整句）。
 *
 * 值里也可能嵌多句（用 `; ` 分隔），逐句尝试；都不认识就原样返回。
 */
function renderValue(value) {
  if (!value) return value;
  const quoted = /^"([\s\S]*)"$/.test(value);
  const inner = quoted ? value.slice(1, -1) : value;

  const tryOne = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (VALUES[trimmed] != null) return VALUES[trimmed];
    if (SEGMENTS[trimmed] != null) return SEGMENTS[trimmed];
    const timeout = trimmed.match(/^Timeout ([\d.]+)ms exceeded.$/);
    if (timeout) return `超时 ${timeout[1]}ms`;
    if (VALUES[trimmed] != null) return VALUES[trimmed];
    const counted = trimmed.match(COUNT_SUMMARY);
    if (counted) {
      const [, a, b, c, d] = counted;
      return `任务：已完成 ${a}、未完成 ${b}、不可用 ${c}、不适用 ${d}`;
    }
    const phrase = renderPhrase(trimmed);
    if (phrase != null) return phrase;
    // 「片段名：片段」的组合式原因（`Visual Search: claimable bonus unknown`）
    const composed = trimmed.match(/^([^:]{1,60}):\s*([\s\S]+)$/);
    if (composed) {
      const head = SEGMENTS[composed[1].trim()];
      const tail = SEGMENTS[composed[2].trim()] ?? renderPhrase(composed[2].trim());
      if (head != null && tail != null) return `${head}：${tail}`;
    }
    return null;
  };

  // 整值命中优先（保留未在词表里的部分不动）
  const whole = tryOne(inner);
  if (whole != null) return quoted ? `"${whole}"` : whole;

  // 多句：逐句翻译，能翻的翻，翻不了的保留英文
  if (inner.includes("; ")) {
    let any = false;
    const out = inner
      .split("; ")
      .map((part) => {
        const one = tryOne(part);
        if (one != null) {
          any = true;
          return one;
        }
        return part;
      })
      .join("；");
    if (any) return quoted ? `"${out}"` : out;
  }

  return value;
}

/**
 * 拆 `标签：取值`。标签允许带空格与连字符（`Available sign-in methods`），
 * 但只有 FIELDS 里确实收了才认，因此不会误伤普通句子。
 */
function splitLabel(text) {
  const m = text.match(/^([A-Za-z][\w .'/\\-]*?)\s*:\s*([\s\S]*)$/);
  if (!m) return null;
  const key = m[1].trim().replace(/\s+/g, " ");
  const zh = FIELDS[key];
  if (zh == null) return null;
  return { zh, value: m[2] };
}

/** 处理一段 `|` 分隔的内容：命中则返回中文，否则 null。 */
function renderSegment(segment) {
  const kv = segment.match(/^([A-Za-z][\w.]*)(\s*=\s*)([\s\S]*)$/);
  if (kv) {
    const zh = FIELDS[kv[1]];
    const value = renderValue(kv[3]);
    if (zh == null && value === kv[3]) return null;
    return `${zh ?? kv[1]}${kv[2]}${value}`;
  }

  // 冒号形式（`Accounts: 1`、`geoLocale: CN`），键名不认识就原样保留，
  // 避免把 `bing:3/7` 这类指标串改坏。
  const colon = splitLabel(segment);
  if (colon) return `${colon.zh}：${renderValue(colon.value)}`;

  // 键名不是字段名、但整段是「片段名：片段」（`Visual Search: claimable bonus unknown`）
  const composed = segment.match(/^([^:]{1,60}):\s*([\s\S]+)$/);
  if (composed) {
    const head = SEGMENTS[composed[1].trim()];
    const tail = SEGMENTS[composed[2].trim()] ?? renderPhrase(composed[2].trim());
    if (head != null && tail != null) return `${head}：${tail}`;
  }

  const trimmed = segment.trim();
  if (SEGMENTS[trimmed] != null) return SEGMENTS[trimmed];

  const counted = trimmed.match(COUNT_SUMMARY);
  if (counted) {
    const [, a, b, c, d] = counted;
    return `任务：已完成 ${a}、未完成 ${b}、不可用 ${c}、不适用 ${d}`;
  }

  const phrase = renderPhrase(trimmed);
  return phrase;
}

/**
 * 行首可能由多个句子拼成（启动说明类），整句未命中时按句子拆开逐句翻，
 * 全部命中才算成功，避免出现「半句中文半句英文」。
 */
function renderHead(text) {
  // 有些调试日志的正文就是一个状态枚举（如 LOGGED_IN），直接查表
  if (STATES[text.trim()]) return STATES[text.trim()];

  // 先按句拆分：否则像 "…: {rest}" 这样的贪婪模式会把后面整段一起吞掉
  if (text.includes(". ")) {
    const sentences = text.split(/(?<![.…])\.\s+/);
    const parts = sentences.map((x) => renderPhrase(x) ?? SEGMENTS[x.trim()] ?? null);
    if (parts.every((x) => x != null)) return parts.join(" ");
    let any = false;
    const merged = parts.map((x, i) => {
      if (x != null) {
        any = true;
        return x;
      }
      return sentences[i];
    });
    if (any) return merged.join(" ");
    return null;
  }

  return renderPhrase(text) ?? SEGMENTS[text.trim()] ?? null;
}

/**
 * 已翻译的句头里可能还挂着英文尾句 —— 典型如 `…例外：a, b. These workers …`，
 * 短语里的 `{rest}` 会把整段吞掉。这里按句号再扫一遍，只翻译能精确命中的尾句
 * （走 SEGMENTS / 短语表），命不中的保持原样，绝不产出半句中文。
 */
function translateTrailingSentences(text) {
  const m = text.match(/^(.*[.…])\s+([A-Za-z][\s\S]*)$/);
  if (!m) return text;
  const tail = m[2].trim();
  const zh = SEGMENTS[tail] ?? renderPhrase(tail);
  if (zh == null) return text;
  return `${m[1]} ${zh}`;
}

/**
 * 中文行（机器人侧的中文摘要）只翻译开头的英文标签，
 * 例如 `Available sign-in methods: 批准登录请求 …`，避免出现半英半中。
 */
function translateLeadingLabel(message) {
  const label = splitLabel(message);
  if (label == null) return message;
  return `${label.zh}：${label.value}`;
}

/**
 * 中文摘要行里的英文取值：`原因=Visual Search: …; Bonus point claim: …`。
 * 只按 `; ` 拆开逐段走片段表，命不中保持原样。
 */
function translateMixedValues(message) {
  const parts = String(message).split(" | ");
  let changed = false;
  const out = parts.map((part) => {
    const eq = part.match(/^([^=]+)=([\s\S]*)$/);
    if (!eq) return part;
    const raw = eq[2];
    if (!raw || /[\u4e00-\u9fa5]/.test(raw)) return part;
    const zh = raw
      .split("; ")
      .map((piece) => renderSegment(piece.trim()) ?? SEGMENTS[piece.trim()] ?? piece)
      .join("；");
    if (zh === raw) return part;
    changed = true;
    return `${eq[1]}=${zh}`;
  });
  if (changed) return out.join(" | ");
  return translateLeadingLabel(message);
}

/** 中文摘要里偶尔还挂着英文的计数尾巴（`任务数：1 completed, 3 incomplete, …`）。 */
const COUNT_TAIL =
  /(\d+)\s+completed,\s*(\d+)\s+incomplete,\s*(\d+)\s+unavailable,\s*(\d+)\s+not applicable/g;

function localizeCounts(text) {
  return text.replace(COUNT_TAIL, "已完成 $1、未完成 $2、不可用 $3、不适用 $4");
}

/**
 * 把一条日志正文渲染成中文。
 *
 * 未命中任何规则时**原样返回** —— 宁可显示英文，也不要出现空串或半截文本，
 * 因此上游新增日志只会「保持英文」，不会让界面坏掉。
 */
export function translateLogMessage(message, localeId) {
  if (!message) return "";
  if (localeId !== "zh-CN") return message;

  // 已经是中文的行（机器人侧的中文摘要）只处理其中的英文标签/取值，避免二次处理
  if (/[\u4e00-\u9fa5]/.test(message)) return localizeCounts(translateMixedValues(message));

  const parts = String(message).split(" | ");
  let changed = false;

  // 首段可能是 key=value / key: value，也可能是普通句子：先按分段试，失败再按短语
  const head = renderSegment(parts[0]) ?? renderHead(parts[0]);
  if (head != null) {
    parts[0] = translateTrailingSentences(head);
    changed = true;
  }

  for (let i = 1; i < parts.length; i += 1) {
    const seg = renderSegment(parts[i]);
    if (seg != null && seg !== parts[i]) {
      parts[i] = seg;
      changed = true;
    }
  }

  // 配置覆盖行（`.workers.doPunchCards = [set]`）没有短语也没有字段，
  // 只有末尾的标记需要中文化，因此单独判断一次。
  const hasMarker = /\[set\]|\(forced\)/.test(message);
  if (!changed && !hasMarker) return message;

  // 配置覆盖那类标记顺手中文化（键名本身保持原样，见 docs/i18n.md 的术语约定）
  return localizeCounts(
    parts
      .join(" | ")
      .replace(/\[set\]/g, "[已设置]")
      .replace(/\(forced\)/g, "（强制）"),
  );
}

// ── 补充词条 ──────────────────────────────────────────────────────
// 上游新增字段/句式时集中加在这里，避免在长表里改行导致格式错乱。
Object.assign(FIELDS, {
  Desktop: "桌面端",
  resetAt: "重置时间",
  local: "本地时间",
  remainingMinutes: "剩余分钟",
  explore: "探索任务",
  completedSearches: "已完成搜索",
  maxSearches: "最大搜索次数",
  offerId2: "任务ID",
  rewardsMode: "运行模式",
  enabled: "已启用",
  modelDates: "模型日期",
  warnings: "警告",
  sections: "分区数",
  promotionSections: "推广分区",
  catalogItems: "目录条目",
  orders: "订单数",
  suggestions: "建议数",
  "Accept-Language": "接受语言",
});

Object.assign(VALUES, {
  null: "无",
  desktop: "桌面端",
  mobile: "移动端",
  "task-skipped": "任务已跳过",
  "visual-search": "图片搜索",
  completed: "已完成",
  unavailable: "不可用",
  skipped: "已跳过",
  none: "无",
  browser: "浏览器模式",
  api: "接口模式",
});

Object.assign(SEGMENTS, {
  "Dismissed: cookie consent banner (Accept)": "已关闭 Cookie 同意横幅（接受）",
  "points earned: 0": "获得积分：0",
  "These workers still obtain an app access token and use the Microsoft Rewards app-platform API.":
    "这些任务仍会获取应用访问令牌并调用微软奖励应用平台 API。",
  "true (cn.bing.com/)": "是（cn.bing.com）",
});

export default PHRASES;

// ── 高频补漏（按真实日志词频统计补充）────────────────────────────────
// 注意：PHRASES 是在模块初始化时编译成正则的，所以新增短语后必须重建 COMPILED。
PHRASES.push(
  ["Extracted action ids", "提取任务 ID"],
  ["Extracted offers", "提取优惠项"],
  ["Extracted quest ids", "提取任务 ID"],
  ["skip (disabled, quota unavailable)", "跳过（已禁用或配额不可用）"],
  ["skip (disabled, {n}/{n})", "跳过（已禁用，{n}/{n}）"],
);
COMPILED.length = 0;
for (const [pattern, zh] of PHRASES) COMPILED.push({ ...compile(pattern), zh });

Object.assign(FIELDS, {
  Desktop: "桌面端",
  named: "已命名",
  windowState: "窗口状态",
});

Object.assign(VALUES, {
  null: "无",
  desktop: "桌面端",
  mobile: "移动端",
  "task-skipped": "任务已跳过",
  "visual-search": "图片搜索",
  completed: "已完成",
  unavailable: "不可用",
});

Object.assign(FIELDS, {
  delayMs: "延迟毫秒",
  readyAt: "就绪时间",
});

Object.assign(VALUES, {
  "perk-unavailable": "加成不可用",
  unconfirmed: "未确认",
  "activation-control-missing": "缺少激活控件",
  "quota-unavailable": "配额不可用",
});

Object.assign(SEGMENTS, {
  "not applicable (skipped)": "不适用（已跳过）",
  "Activity only applies to desktop": "该任务仅适用于桌面端",
  completed: "已完成",
  failed: "失败",
  skipped: "已跳过",
});

Object.assign(FIELDS, {
  partner: "合作方",
  dayCompleted: "今日已完成",
  activities: "任务数",
  days: "天数",
});

Object.assign(VALUES, {
  "already-complete": "今日已完成",
});

Object.assign(SEGMENTS, {
  "already completed (skipped)": "今日已完成（跳过）",
  "Already completed": "今日已完成",
  "not applicable": "不适用",
});

Object.assign(FIELDS, {
  "Available sign-in methods": "可用登录方式",
  "Sign-in methods": "登录方式",
  "App-only API exceptions enabled in browser mode": "浏览器模式下仅走 API 的任务例外",
});

Object.assign(SEGMENTS, {
  "isFidoSupported set to false": "isFidoSupported 已设为 false",
});

Object.assign(VALUES, {
  login: "登录",
  rewards: "奖励",
  account: "账号",
  confirmed: "已确认",
  "claimable-bonus-unknown": "可领取奖励未知",
  "claim-balance-confirmed": "奖励余额已确认",
  "rewards-desktop-app": "奖励桌面应用",
  "android-browser": "安卓浏览器",
  "no-protection-days": "无保护天数",
  "mobile-not-applicable": "移动端不适用",
  "app-api-exceptions": "应用接口例外",
  "app-data-loaded": "应用数据已加载",
  "app-data": "应用数据",
  "visual-search": "图片搜索",
  true: "是",
  false: "否",
});
