# Rewards Dashboard（简体中文版）

[![Release](https://img.shields.io/github/v/release/zPan2327/rewards-dashboard-i18n?include_prereleases&sort=semver)](https://github.com/zPan2327/rewards-dashboard-i18n/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[`mgrimace/rewards-dashboard`](https://github.com/mgrimace/rewards-dashboard) 的**简体中文 / 多语言（i18n）分支**。

在原版基础上加入了一套完整、可长期跟随上游更新的国际化方案：

- 完整保留英文原版，默认语言仍是 **English**，行为与上游一致；
- 新增 **简体中文**，界面上可自由切换，选择会**记住**（刷新、重开浏览器都不丢）；
- 中文文案针对「仪表盘 + Microsoft Rewards」的真实语境重写，术语全项目统一；
- 界面文案全部抽成**独立的语言资源 + 稳定的 translation key**，业务代码里不再硬编码任何一种语言；
- 缺少译文时**自动回退英文**，绝不会出现 `undefined` 或空白；
- 内置 **翻译自检工具**，同步上游新版本时能一眼看出「新增了哪些待翻译文案 / 哪些 key 的占位符对不上」；
- **另外独立维护了一处 `lib/parser.js` 的中文日志解析补丁**，让总览页能正确解析中文日志（与本仓库的 i18n 无关）：见 [docs/parser-zh.md](./docs/parser-zh.md)；
- **除语言相关内容、以及上面那处 `lib/parser.js` 中文日志解析补丁外，没有改动任何功能、接口或数据结构**：API 路径与请求/响应格式、鉴权逻辑、数据处理、Scheduler/Cron、Rewards Script 控制、Docker 部署方式全部保持原样；

> 截图、功能列表、环境变量等完整说明见英文原版文档：[README.en.md](./README.en.md)

---

## 快速开始（Docker）

### 方式一：克隆后本地构建（推荐）

```bash
git clone https://github.com/zPan2327/rewards-dashboard-i18n.git
cd rewards-dashboard-i18n

# 与机器人容器共享的 Docker 网络（已存在时会报 already exists，忽略即可）
docker network create rewards 2>/dev/null || true

# 填写与机器人端一致的 Control API 令牌
cp .env.example .env
vi .env                      # API_TOKEN=...

docker compose up -d --build
```

打开 `http://<宿主机IP>:8890`。

### 方式二：在你要用的目录里直接拉取源码运行

```bash
mkdir rewards-dashboard-i18n && cd rewards-dashboard-i18n
docker network create rewards 2>/dev/null || true
curl -fsSL https://raw.githubusercontent.com/zPan2327/rewards-dashboard-i18n/main/compose.yaml -o compose.yaml
cp .env.example .env 2>/dev/null || printf 'API_TOKEN=your-token\n' > .env
# compose.yaml 里的 build.context 指向 ./rewards-dashboard，所以还要拿到源码
git clone --depth 1 https://github.com/zPan2327/rewards-dashboard-i18n.git src
cp -r src/rewards-dashboard .
docker compose up -d --build
```

### 方式三：使用已构建好的镜像

本仓库的 Release 工作流会把镜像推送到 GitHub Container Registry：

```bash
docker pull ghcr.io/zpan2327/rewards-dashboard-i18n:latest
```

> [!IMPORTANT]
> GHCR 上的 package 默认是 **private**，需要手动改成 public（本仓库已改好，fork 出去的人请自行处理）：
> `GitHub → 你的头像 → Packages → rewards-dashboard-i18n → Package settings → Change visibility`。
> 否则未登录的 `docker pull` 会拉不下来。

已发布的可用 tag：

| tag | 说明 |
| --- | --- |
| `latest` | 每次都指向最新一次发布 |
| `v2.0.0-i18n.1` | 当前推荐：基于上游 v2.0.0 的简体中文版（支持 Rewards Script v4/v5），建议生产环境固定使用 |
| `v1.3.6-i18n.3` | 旧版：基于上游 v1.3.6，仅供回滚使用 |

完整的 tag 列表见 [Releases](https://github.com/zPan2327/rewards-dashboard-i18n/releases)。

想看这一版和上一版（v1.3.6-i18n.3）到底差在哪，包括上游 23 个提交带来的功能变化、
新增的 82 条文案、以及部署方式的调整，见 **[docs/CHANGELOG-v2.0.0.md](./docs/CHANGELOG-v2.0.0.md)**。

---

## 机器人端需要做什么

在 `microsoft-rewards-script` 一侧开启 Control API：

```yaml
environment:
  API_MODE: "true"
  API_TOKEN: "<一段足够长的随机串>"     # 必须和本项目的 API_TOKEN 相同
  API_ALLOW_CONFIG_WRITE: "true"        # 想让仪表盘能改机器人配置时
  API_ALLOW_SCHEDULE_WRITE: "true"      # 想让仪表盘能改机器人定时任务时
  API_ALLOW_CONFIG_REVEAL: "true"       # 想让仪表盘查看/修改 token 等敏感配置时（v2.0.0 新增）
```

> [!CAUTION]
> v2.0.0 起，仪表盘可以查看和修改 `API_TOKEN`、代理密码等敏感配置。
> 只有在你确实需要时再开启 `API_ALLOW_CONFIG_REVEAL`；开启后请确保仪表盘本身已有登录保护。

两个容器必须能互相访问：把它们放进同一个 Docker 网络（本项目 `compose.yaml` 里已经接上了外部的 `rewards` 网络），或者直接把本项目的服务复制进机器人的 `compose.yaml`，参考 [`sample-stack-compose.yaml`](./sample-stack-compose.yaml)。

---

## 从 v1.3.6 升级到 v2.0.0

上游 v2.0.0 是一个大版本，除了继续支持 Rewards Script v4，还新增了对 v5 的配置项支持
（`config` 页会按机器人版本自动置灰不适用的开关，并标注 `v5 only` / `v4 only`）。
本分支已把上游 diff 全量合并，并保留全部中文文案与 `lib/parser.js` 的中文日志解析补丁。

升级步骤：

```bash
git pull
docker compose build --pull
docker compose up -d
```

如果用的是 GHCR 镜像，把 `compose.yaml` 的 `image:` 指向 `v2.0.0-i18n.1` 后 `docker compose up -d` 即可。
仪表盘数据（`./data`）与 `CONTROL_API_URL` / `CONTROL_API_TOKEN` 都不需要改。

---

## 语言切换

界面右上角、主题选择框旁边就是**语言选择框**：

| 选项 | 说明 |
| --- | --- |
| `English` | 默认语言，与上游原版完全一致 |
| `简体中文` | 本次新增的完整中文翻译 |

选择保存在浏览器的 `localStorage`（键名 `rewards-dashboard:locale`），刷新页面、关闭后重新打开都会保持。

---

## 技术实现

界面文案全部抽到独立的语言资源里，业务代码只引用 **key**：

```
rewards-dashboard/
├── public/i18n/
│   ├── index.js              运行时：t() / tp() / setLocale() / applyI18n() …
│   ├── cronText.js           把控制 API 返回的英文 cron 描述重新排版成中文
│   └── locales/
│       ├── en.js             英文原文（源语言，全部 key 的权威定义）
│       └── zh-CN.js          简体中文译文
└── tools/
    └── i18n-check.mjs        翻译自检工具
```

- 查找顺序：**当前语言 → 英文 → key 本身**，所以漏翻时显示英文，不会出现空值或 `undefined`；
- key 采用 `namespace.key` 形式，**key 是身份、不是文案** —— 英文措辞变了 key 不动，已有译文继续生效；
- 支持复数形式 `{ one, other }` 与 `{param}` 插值；
- 英文模式下日期格式完全不干预（输出与改动前逐字节一致），切到中文才交给 `Intl` 本地化。

完整设计说明、术语表和「如何跟随上游更新」见 **[docs/i18n.md](./docs/i18n.md)**。
> 中文日志解析补丁的完整说明（现象 / 根因 / 改动 / 验证数据）见 **[docs/parser-zh.md](./docs/parser-zh.md)**。

### 自检工具

```bash
cd rewards-dashboard
node tools/i18n-check.mjs          # 人类可读报告
node tools/i18n-check.mjs --strict # 连无用 key 也当作错误
```

它会报告：`ENGLISH FALLBACK`（缺中文，界面会显示英文）、`UNKNOWN t() KEY`（代码用了但字典里没有）、`PLACEHOLDER MISMATCH`（占位符对不上）、`ORPHAN`、`EMPTY VALUE`、`PLURAL VARIANT MISSING`、`UNUSED KEY`。

---

## 中文日志解析补丁

配合 `microsoft-rewards-script` 的 `V4-china` 分支（日志已全部中文化）使用时，上游原版的 `lib/parser.js` 只认英文日志，
会导致仪表盘「总览」页解析不出任何数据。本仓库对此打了一处补丁，让每条正则同时接受英文与中文两种写法。

- 只改了 `lib/parser.js` 一个文件；
- 跟随上游更新时，用一行 `grep` 就能确认补丁还在：

```bash
grep -c "开始处理账户" rewards-dashboard/lib/parser.js    # 输出 0 就是补丁丢了
```

完整说明见 **[docs/parser-zh.md](./docs/parser-zh.md)**。

---

## 本分支的其它本地适配

除了中文文案与日志解析，本分支还做了三处与上游不同的小改动，都会在合并上游时被保留：

| 改动 | 原因 |
| --- | --- |
| `public/vendor/phosphor/` 内置图标字体 | 上游从 `unpkg.com` 现场加载 Phosphor 图标；账号状态轨道是**纯图标**的，CDN 一旦被墙或超时，状态就完全看不见。这里把 v2.1.1 的 CSS + woff2 收进仓库（约 220 KB），不再依赖第三方网络。 |
| `server.js` 的 MIME 表补 `woff2/woff/ttf` | 静态服务原来把字体当成 `application/octet-stream` 返回，Chromium 会直接放弃加载，表现为所有图标空白。 |
| 页脚版本行跟随语言、`runAccountMap` 空状态防护 | 切换语言后页脚仍显示英文；首帧 `status` 还没到时概览页会抛 `Cannot read properties of null`。两处都是上游 v2.0.0 遗留的小问题。 |

升级上游并重新内置图标时，只需用同版本的 `style.css` 与 `Phosphor.woff2` 覆盖 `public/vendor/phosphor/` 即可。

---

## 跟随上游更新（重点）

这套方案的核心目标就是：**上游发新版本时，不需要重新翻译一遍**。

```bash
git remote add upstream https://github.com/mgrimace/rewards-dashboard.git
git fetch upstream --tags

# 当前基线是 v2.0.0：i18n 的提交已经 rebase 到上游 v2.0.0 之上，
# 所以上游提交是真正的祖先，后续合并是正常的三方合并。
git merge upstream/v2.1.0        # 换成上游实际的新 tag

cd rewards-dashboard
node tools/i18n-check.mjs        # 看还差哪些 key
```

> 合并前建议先看一眼上游改了什么：`git log --oneline v2.0.0..upstream/v2.1.0`。
> 如果上游只是加功能、没动 `views/` 的结构，通常只需要补几条 `zh-CN.js`。
> 如果上游重写了某个视图（像 v2.0.0 重写账号页那样），就以上游结构为准，
> 再把该文件的 `t()` 调用补回去 —— 这正是 v2.0.0 升级时做的事。

| 上游的改动 | 你要做的事 |
| --- | --- |
| 改了某条英文文案的措辞 | **什么都不用做**，译文继续生效 |
| 新增了一个界面文案 | 补 **1 条** `zh-CN.js` 条目（在补之前显示英文） |
| 新增了一个配置项 | **什么都不用做**，配置页会自动回退显示代码里的英文 |
| 删除了某个功能 | 删掉对应的旧 key（自检会提示 `UNUSED KEY`） |

详细流程见 [docs/i18n.md](./docs/i18n.md) 第 7 节。

---

## 安全提醒

- `.env`、`data/`（SQLite 数据库）都在 `.gitignore` 里，**不会被提交**；
- 仓库中不包含任何真实的 `API_TOKEN`、Webhook 地址、账号邮箱或代理凭据；
- 仪表盘对外只暴露 `8890` 端口，请自行用防火墙 / 反向代理限制访问范围；
- 建议始终在 Control API 上设置强 `API_TOKEN`。

---

## 致谢与许可

- 上游项目：[mgrimace/rewards-dashboard](https://github.com/mgrimace/rewards-dashboard)
- 配套机器人：[thenetsky/microsoft-rewards-script](https://github.com/thenetsky/microsoft-rewards-script)
- 本分支沿用上游的 [MIT License](./LICENSE)
