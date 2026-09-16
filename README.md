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
- **除语言相关内容外，没有改动任何功能、接口或数据结构**：API 路径与请求/响应格式、鉴权逻辑、数据处理、Scheduler/Cron、Rewards Script 控制、Docker 部署方式全部保持原样。

> 截图、功能列表、环境变量等完整说明见英文原版文档：[README.en.md](./README.en.md)

---

## 快速开始（Docker）

### 方式一：克隆后本地构建（推荐）

```bash
git clone https://github.com/zPan2327/rewards-dashboard-i18n.git
cd rewards-dashboard-i18n

# 填写与机器人端一致的 Control API 令牌
cp .env.example .env
vi .env                      # API_TOKEN=...

docker compose up -d --build
```

打开 `http://<宿主机IP>:8890`。

### 方式二：在你要用的目录里直接拉取源码运行

```bash
mkdir rewards-dashboard-i18n && cd rewards-dashboard-i18n
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
> GHCR 上的 package 默认是 **private**。首次发布后，请到
> `GitHub → 你的头像 → Packages → rewards-dashboard-i18n → Package settings → Change visibility`
> 把它改成 **public**，否则别人（以及未登录的 `docker pull`）拉不下来。

---

## 机器人端需要做什么

在 `microsoft-rewards-script` 一侧开启 Control API：

```yaml
environment:
  API_MODE: "true"
  API_TOKEN: "<一段足够长的随机串>"     # 必须和本项目的 API_TOKEN 相同
  API_ALLOW_CONFIG_WRITE: "true"        # 想让仪表盘能改机器人配置时
  API_ALLOW_SCHEDULE_WRITE: "true"      # 想让仪表盘能改机器人定时任务时
```

两个容器必须能互相访问：把它们放进同一个 Docker 网络（本项目 `compose.yaml` 里已经接上了外部的 `rewards` 网络），或者直接把本项目的服务复制进机器人的 `compose.yaml`，参考 [`sample-stack-compose.yaml`](./sample-stack-compose.yaml)。

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

### 自检工具

```bash
cd rewards-dashboard
node tools/i18n-check.mjs          # 人类可读报告
node tools/i18n-check.mjs --strict # 连无用 key 也当作错误
```

它会报告：`ENGLISH FALLBACK`（缺中文，界面会显示英文）、`UNKNOWN t() KEY`（代码用了但字典里没有）、`PLACEHOLDER MISMATCH`（占位符对不上）、`ORPHAN`、`EMPTY VALUE`、`PLURAL VARIANT MISSING`、`UNUSED KEY`。

---

## 跟随上游更新（重点）

这套方案的核心目标就是：**上游发新版本时，不需要重新翻译一遍**。

```bash
git remote add upstream https://github.com/mgrimace/rewards-dashboard.git
git fetch upstream --tags
git merge upstream/v1.3.7        # 只会在 views/config.js 等少数调用点有冲突

cd rewards-dashboard
node tools/i18n-check.mjs        # 看还差哪些 key
```

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
