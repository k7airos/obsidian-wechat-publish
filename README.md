# 公众号一键发布（Obsidian）

**仓库名：** [obsidian-wechat-publish](https://github.com/k7airos/obsidian-wechat-publish)  
**插件 ID：** `wechat-publish`  
**平台：** 仅桌面端（Desktop）

在 Obsidian 里打开一篇 Markdown，一键提交到 **微信公众号草稿箱**。  
插件本身是薄壳 UI，真正的排版 / 素材 / 草稿接口由本机命令行工具 **[zzhub-pipeline](https://github.com/k7airos/zzhub-pipeline)**（npm：`@akairos/pipeline`，命令：`zzp` / `zzhub-pipeline`）完成。

> 未上架官方社区插件市场，请按下方说明 **自行下载安装**。

## 生态与依赖

| 项目 | 与本插件的关系 |
| --- | --- |
| [zzhub-pipeline](https://github.com/k7airos/zzhub-pipeline) | 必需的本机执行依赖；本插件通过子进程调用 CLI，不把 Pipeline 源码打进插件 |
| [myno](https://github.com/k7airos/myno) | Pipeline 的可选正文排版插件；可独立调样式和导出配置，再供笔记发布使用 |
| [Typeset Studio](https://github.com/k7airos/typeset-studio) | Pipeline 的可选图片渲染插件，用于文章封面与贴图；本插件间接使用 |
| [Kairos Skills](https://github.com/k7airos/kairos-skills) | 外部 Agent 写作和发布说明；普通 Obsidian 一键发布不要求安装 Skill 或 LLM |

本插件面向 Obsidian 桌面用户，公众号账号、主题和外部微信中转服务统一在 Pipeline 配置。成功表示草稿箱写入成功，后续公开发布由用户在微信后台完成。

---

## 功能概览

- 侧边栏面板：看待发布 / 已发布状态
- **一键发布 / 重新发布**（自动跑完 prepare → render → publish）
- 发布记录记在插件本地（不往笔记 frontmatter 里塞一堆字段）
- 多公众号：从本机 pipeline 配置读取，显示 `name`（如「我的主号」）
- 设置页：环境检测、账号展示和 CLI 路径配置；当前安装按钮的旧包名限制见下文

---

## 依赖（必读）

| 依赖 | 说明 |
|------|------|
| Obsidian 桌面版 | ≥ 1.5.0 |
| **zzhub-pipeline (zzp)** | 本机全局命令，负责调公众号 API |

### 1）安装 bun（若还没有）

**macOS / Linux：**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows（PowerShell）：**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

装完后重新打开终端，确认：

```bash
bun --version
```

### 2）安装发布工具 CLI

```bash
bun add -g @akairos/pipeline
```

或：

```bash
npm install -g @akairos/pipeline
```

CLI 仍需要 Bun 运行，npm 只负责安装。当前插件源码的“一键安装”和复制安装命令仍使用旧包名 `@zzclub/pipeline`；请先在终端按上述命令安装当前包，再在插件中检测环境或指定 `zzp` 路径。本文更新不代表已修复或发布新的 Obsidian 插件版本。

确认：

```bash
zzp --help
# 或
zzhub-pipeline --help
```

### 3）配置公众号账号

在本机配置 pipeline（密钥等），例如：

```bash
# 查看配置（密钥会打码）
zzp config --export

# 设置账号显示名（可选，示例）
zzp config --key wx.accounts.default.name --value "我的主号"
```

配置文件一般在：

- macOS：`~/Library/Application Support/zzhub-pipeline/config.json`
- 需配置 `wx.baseUrl` 对应的微信中转服务，以及账号 `appId`、`appSecret`、`pat`；完整契约见 [Pipeline README](https://github.com/k7airos/zzhub-pipeline#配置微信和外部服务)。
- 微信 IP 白名单通常填写实际请求微信官方接口的中转服务器出口 IP，而不是默认填写 Obsidian 所在机器的 IP。

---

## 安装插件

### 方式 A：从 GitHub Release 下载（推荐）

1. 打开仓库 [Releases](https://github.com/k7airos/obsidian-wechat-publish/releases) 页面  
2. 下载最新版本的 **`wechat-publish.zip`**（或分别下载下面三个文件）  
3. 解压到你的库目录：

```text
<你的库>/.obsidian/plugins/wechat-publish/
├── main.js
├── manifest.json
└── styles.css
```

4. 打开 Obsidian → **设置 → 第三方插件**  
   - 关闭「安全模式」  
   - 启用 **公众号一键发布**  
5. 若列表没有：完全退出 Obsidian 再开一次，或点「重新加载」

### 方式 B：用 git 克隆

```bash
# 进入你的库的插件目录
cd "/path/to/your-vault/.obsidian/plugins"

git clone https://github.com/k7airos/obsidian-wechat-publish.git wechat-publish
cd wechat-publish
npm install
npm run build
```

然后在 Obsidian 里启用插件（同上）。

### 方式 C：BRAT（开发/尝鲜）

1. 安装社区插件 [BRAT](https://github.com/TfTHacker/obsidian42-brat)  
2. 添加 beta 插件仓库：`k7airos/obsidian-wechat-publish`
3. 启用 **公众号一键发布**

---

## 使用

1. 确认本机 `zzp` 可用（设置 → 公众号一键发布 → **检测环境**）  
2. 打开要发的 Markdown 笔记  
3. 点左侧边栏 **发送** 图标，打开「公众号发布」面板  
4. 点 **一键发布**（已发过则是 **重新发布**）  
5. 成功后到 [微信公众平台](https://mp.weixin.qq.com/) → **草稿箱** 预览并群发  

### 可选 frontmatter

```yaml
---
title: 文章标题          # 优先用作标题
zzhub_account: default # 可选，指定账号配置键
zzhub_intent: 发大号   # 可选，发布意图文案
---
```

---

## 设置说明（简要）

| 项 | 说明 |
|----|------|
| 检测环境 / 一键安装 | 检测已有 CLI；当前安装按钮仍指向旧包名，建议手动安装 `@akairos/pipeline` |
| 公众号账号 | **只读**展示 pipeline 里的账号与 `name` |
| 发布时默认使用 | 仅本插件使用的默认账号（不改配置文件） |
| 发布工具路径 | 若 PATH 找不到，可填 `zzhub-pipeline` 绝对路径 |
| 工作区目录 | 对应 pipeline 的 workspace（有默认可不填） |

---

## 从源码构建

```bash
git clone https://github.com/k7airos/obsidian-wechat-publish.git
cd obsidian-wechat-publish
npm install
npm run build   # 生成 main.js
```

开发时：

```bash
npm run dev     # watch 构建
```

---

## 常见问题

**面板显示「环境未就绪」**  
- 终端执行 `zzp --help` 是否成功  
- 设置里填发布工具路径，例如 `~/.bun/bin/zzhub-pipeline`  
- 确认 Obsidian 能访问该路径（桌面端）

**发布失败 / IP 相关错误**  
- 先检查 Pipeline 的中转服务地址、PAT 和公众号凭据，再核对微信白名单是否包含中转服务器的实际出口 IP。

**已发布状态不准**  
- 状态存在插件数据里，与笔记 frontmatter 无关  
- 可换笔记对比；误标时可删插件目录下的 `data.json` 后重载（会清空本地发布记录）

**和官方市场的关系**  
- 当前 **未** 上架官方社区插件列表，只能手动 / BRAT / Release 安装  

---

## 许可与说明

- 插件 UI：见仓库 LICENSE（若未添加则以源码为准）  
- 发布能力依赖 `@akairos/pipeline`，请遵守其许可与微信公众平台规范
- 请勿将 AppSecret 等密钥提交到公开仓库  

---

## 反馈

Issue：<https://github.com/k7airos/obsidian-wechat-publish/issues>
