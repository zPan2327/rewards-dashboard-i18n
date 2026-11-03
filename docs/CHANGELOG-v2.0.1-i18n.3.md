# v2.0.1-i18n.3 — 顶部与页脚 GitHub 图标

> 配套脚本：**[zPan2327/Microsoft-Rewards-Script-Ch](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch) `5.0.0-ch.2`** — 两者配套使用。

## 新增

- **顶部导航栏 GitHub 图标**：位于右上角控制区（模式切换左侧），点击新窗口打开本仓库
- **页脚 GitHub 小图标**：紧跟「Microsoft Rewards 仪表盘 / 脚本 / 状态」之后，同样指向本仓库

## 深浅色适配

图标用 GitHub 官方 mark，SVG `fill="currentColor"`，颜色自动继承主题文字色：

| 模式 | 顶栏图标 | 页脚图标 |
| --- | --- | --- |
| 浅色 | `--text` `rgb(36,41,45)` | `--text-muted` `rgb(67,74,81)` |
| 深色 | `rgb(210,212,213)` | `rgb(177,182,185)` |

13 套主题全部无需单独配色，切换即生效。

## 多语言

新增 `app.githubLink` 文案：

- 简体中文：**在 GitHub 上查看本项目**
- English：**View this project on GitHub**

`title` 与 `aria-label` 跟随界面语言切换（无障碍友好）。

## 验证

- `npm test` 15/15，`i18n:check` 612/612
- 无头 Chromium 实机回归：顶栏 / 页脚图标位置、跳转链接、深浅色、中英文均确认无误

## 升级

```bash
docker pull ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.1-i18n.3
```

## 链接

- 本仓库：<https://github.com/zPan2327/rewards-dashboard-i18n>
- 配套脚本：<https://github.com/zPan2327/Microsoft-Rewards-Script-Ch>
- 日志中文化设计：[docs/i18n.md](https://github.com/zPan2327/rewards-dashboard-i18n/blob/main/docs/i18n.md)
