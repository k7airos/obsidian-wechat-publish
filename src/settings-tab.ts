import { App, Notice, PluginSettingTab, Setting } from "obsidian";

import { INSTALL_COMMANDS } from "./cli";
import {
  accountDisplayName,
  guessConfigPath,
  loadPipelineWxSnapshot,
  maskAppId,
  type PipelineWxSnapshot,
} from "./pipeline-config";
import type ZzhubPipelinePlugin from "./main";

export class ZzhubSettingTab extends PluginSettingTab {
  plugin: ZzhubPipelinePlugin;
  private envStatusEl: HTMLElement | null = null;
  private installLogEl: HTMLElement | null = null;
  private accountsEl: HTMLElement | null = null;
  private snapshot: PipelineWxSnapshot | null = null;
  private loadingAccounts = false;

  constructor(app: App, plugin: ZzhubPipelinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "公众号一键发布" });
    containerEl.createEl("p", {
      text: "把当前笔记提交到本机发布工具，自动准备文章并推到微信公众号草稿箱。",
      cls: "zzhub-muted",
    });

    // —— 环境 ——
    containerEl.createEl("h3", { text: "发布环境" });
    this.envStatusEl = containerEl.createDiv({ cls: "zzhub-settings-env" });
    this.refreshEnvStatus();

    new Setting(containerEl)
      .setName("检测环境")
      .setDesc("检查本机 zzhub-pipeline 是否可用。")
      .addButton((btn) =>
        btn.setButtonText("检测").onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("检测中…");
          try {
            await this.plugin.runDoctor({ fromSettings: true });
            this.refreshEnvStatus();
            await this.reloadAccounts();
          } finally {
            btn.setDisabled(false);
            btn.setButtonText("检测");
          }
        }),
      );

    new Setting(containerEl)
      .setName("自动安装发布工具")
      .setDesc(
        `使用本机 bun 或 npm 全局安装 @zzclub/pipeline。等价于：${INSTALL_COMMANDS.bun}`,
      )
      .addButton((btn) =>
        btn
          .setButtonText("一键安装")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("安装中…");
            this.ensureInstallLog();
            try {
              const ok = await this.plugin.installCli((line) => {
                this.appendInstallLog(line);
              });
              this.refreshEnvStatus();
              if (ok) {
                new Notice("发布工具安装成功");
                await this.reloadAccounts();
              } else new Notice("安装失败，请查看下方日志");
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("一键安装");
            }
          }),
      );

    this.installLogEl = containerEl.createEl("pre", { cls: "zzhub-install-log" });
    this.installLogEl.hide();

    containerEl.createEl("p", {
      text: "若还没有 bun，请先在系统终端执行下面命令，装好后回到这里点「一键安装」发布工具。",
      cls: "zzhub-muted",
    });

    this.addCopyCommandSetting(
      containerEl,
      "安装 bun（macOS / Linux）",
      INSTALL_COMMANDS.bunRuntimeMac,
    );
    this.addCopyCommandSetting(
      containerEl,
      "安装 bun（Windows）",
      INSTALL_COMMANDS.bunRuntimeWin,
    );
    this.addCopyCommandSetting(
      containerEl,
      "手动安装发布工具（已有 bun）",
      INSTALL_COMMANDS.bun,
    );
    this.addCopyCommandSetting(
      containerEl,
      "手动安装发布工具（已有 npm）",
      INSTALL_COMMANDS.npm,
    );

    // —— 公众号账号 ——
    containerEl.createEl("h3", { text: "公众号账号" });
    containerEl.createEl("p", {
      text: `只读展示，数据来自 pipeline（${guessConfigPath()}）。显示名用配置里的 name；账号增改请用 zzp/config，本插件暂不改配置文件。`,
      cls: "zzhub-muted",
    });

    this.accountsEl = containerEl.createDiv({ cls: "zzhub-accounts" });
    void this.reloadAccounts();

    new Setting(containerEl)
      .setName("刷新账号列表")
      .setDesc("从 pipeline 重新读取已配置的公众号。")
      .addButton((btn) =>
        btn.setButtonText("刷新").onClick(async () => {
          btn.setDisabled(true);
          try {
            await this.reloadAccounts();
            new Notice("账号列表已刷新");
          } finally {
            btn.setDisabled(false);
          }
        }),
      );

    // —— 发布默认 ——
    containerEl.createEl("h3", { text: "发布默认" });

    new Setting(containerEl)
      .setName("发布目标")
      .setDesc("一般填 wechat（微信公众号）。")
      .addText((text) =>
        text
          .setPlaceholder("wechat")
          .setValue(this.plugin.settings.defaultTargets)
          .onChange(async (value) => {
            this.plugin.settings.defaultTargets = value.trim() || "wechat";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("正文怎么处理")
      .setDesc("推荐「直接用笔记正文」。")
      .addDropdown((dd) =>
        dd
          .addOption("format_only", "直接用笔记正文（推荐）")
          .addOption("write", "需要重新写稿")
          .addOption("revise", "在原文上修改")
          .setValue(this.plugin.settings.authoringPolicy)
          .onChange(async (value) => {
            this.plugin.settings.authoringPolicy = value as "format_only" | "write" | "revise";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("发布前是否要人工审核")
      .setDesc("自己写自己发：选「不用审核，直接发」。")
      .addDropdown((dd) =>
        dd
          .addOption("trust_user", "不用审核，直接发（推荐）")
          .addOption("required", "需要审核通过后再发")
          .setValue(this.plugin.settings.reviewPolicy)
          .onChange(async (value) => {
            this.plugin.settings.reviewPolicy = value as "trust_user" | "required";
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "高级" });

    new Setting(containerEl)
      .setName("发布工具路径")
      .setDesc("本机 zzhub-pipeline 可执行文件。留空则自动查找。")
      .addText((text) =>
        text
          .setPlaceholder("/Users/你/.bun/bin/zzhub-pipeline")
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (value) => {
            this.plugin.settings.cliPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("工作区目录")
      .setDesc("发布任务存放目录。留空用发布工具自己的配置。")
      .addText((text) =>
        text
          .setPlaceholder("/Users/你/.oh-my-zzhub")
          .setValue(this.plugin.settings.workspaceRoot)
          .onChange(async (value) => {
            this.plugin.settings.workspaceRoot = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("额外 PATH")
      .setDesc("若提示找不到命令，可填 bun 所在目录。")
      .addText((text) =>
        text
          .setPlaceholder("/Users/你/.bun/bin")
          .setValue(this.plugin.settings.extraPath)
          .onChange(async (value) => {
            this.plugin.settings.extraPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("清理笔记里旧的发布字段")
      .setDesc("打开笔记时自动删除旧的 zzhub_* frontmatter。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.stripLegacyFrontmatter).onChange(async (v) => {
          this.plugin.settings.stripLegacyFrontmatter = v;
          await this.plugin.saveSettings();
        }),
      );
  }

  private async reloadAccounts(): Promise<void> {
    if (!this.accountsEl || this.loadingAccounts) return;
    this.loadingAccounts = true;
    this.accountsEl.empty();
    this.accountsEl.createEl("p", { text: "正在读取账号…", cls: "zzhub-muted" });

    try {
      this.snapshot = await loadPipelineWxSnapshot(this.plugin.settings);
      if (this.snapshot.ok) {
        // 推入插件缓存，面板同步用 name
        await this.plugin.refreshPipelineAccounts();
      }
      this.renderAccounts();
    } catch (e) {
      this.accountsEl.empty();
      this.accountsEl.createEl("p", {
        text: e instanceof Error ? e.message : String(e),
        cls: "zzhub-error",
      });
    } finally {
      this.loadingAccounts = false;
    }
  }

  private renderAccounts(): void {
    if (!this.accountsEl) return;
    this.accountsEl.empty();
    const snap = this.snapshot;

    if (!snap) {
      this.accountsEl.createEl("p", { text: "尚未加载", cls: "zzhub-muted" });
      return;
    }

    if (!snap.ok) {
      this.accountsEl.createEl("p", {
        text: `无法读取账号：${snap.error || "环境未就绪"}`,
        cls: "zzhub-error",
      });
      this.accountsEl.createEl("p", {
        text: "请先完成上方「检测环境 / 一键安装」。",
        cls: "zzhub-muted",
      });
      return;
    }

    if (snap.accounts.length === 0) {
      this.accountsEl.createEl("p", {
        text: "pipeline 配置里还没有公众号账号。",
        cls: "zzhub-muted",
      });
      return;
    }

    // 同步到插件缓存，面板立即可用
    void this.plugin.refreshPipelineAccounts();

    const nameOpts = { accounts: snap.accounts };

    // 默认账号：仅存插件本地，不写 pipeline 配置文件
    const defaultSetting = new Setting(this.accountsEl)
      .setName("发布时默认使用")
      .setDesc("仅影响本插件一键发布，不会改 pipeline 配置文件。");

    defaultSetting.addDropdown((dd) => {
      for (const acc of snap.accounts) {
        dd.addOption(acc.key, accountDisplayName(acc.key, nameOpts));
      }
      const current =
        this.plugin.settings.defaultAccount ||
        snap.defaultAccount ||
        snap.accounts[0]?.key ||
        "default";
      dd.setValue(current);
      dd.onChange(async (value) => {
        this.plugin.settings.defaultAccount = value;
        await this.plugin.saveSettings();
        new Notice(
          `默认公众号：${accountDisplayName(value, { accounts: this.snapshot?.accounts })}`,
        );
        this.renderAccounts();
      });
    });

    // 账号卡片：只读展示
    for (const acc of snap.accounts) {
      const isDefault =
        acc.key === (this.plugin.settings.defaultAccount || snap.defaultAccount);
      const card = this.accountsEl.createDiv({
        cls: isDefault ? "zzhub-account-card zzhub-account-card-default" : "zzhub-account-card",
      });

      const header = card.createDiv({ cls: "zzhub-account-card-header" });
      header.createEl("strong", {
        text: accountDisplayName(acc.key, nameOpts),
      });
      if (isDefault) {
        header.createEl("span", { text: "默认", cls: "zzhub-account-badge" });
      }

      const meta = card.createDiv({ cls: "zzhub-account-meta" });
      meta.createEl("div", {
        text: `配置键：${acc.key}`,
        cls: "zzhub-muted",
      });
      meta.createEl("div", {
        text: `AppID：${maskAppId(acc.appId)}`,
      });

      const statusParts: string[] = [];
      statusParts.push(acc.hasAppId ? "AppID 已填" : "AppID 未填");
      statusParts.push(acc.hasSecret ? "密钥已配置" : "密钥未配置");
      if (acc.hasPat) statusParts.push("PAT 已配置");
      meta.createEl("div", {
        text: statusParts.join(" · "),
        cls: acc.hasAppId && acc.hasSecret ? "zzhub-ok" : "zzhub-error",
      });
    }
  }

  private addCopyCommandSetting(containerEl: HTMLElement, name: string, command: string): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(command)
      .addButton((btn) =>
        btn.setButtonText("复制").onClick(async () => {
          await navigator.clipboard.writeText(command);
          new Notice("已复制到剪贴板");
        }),
      );
  }

  private refreshEnvStatus(): void {
    if (!this.envStatusEl) return;
    this.envStatusEl.empty();
    const probe = this.plugin.getCliProbe();
    if (!probe) {
      this.envStatusEl.createEl("p", {
        text: "尚未检测。请点「检测」。",
        cls: "zzhub-muted",
      });
      return;
    }
    if (probe.ok) {
      this.envStatusEl.createEl("p", {
        text: `✓ 环境正常${probe.versionLine ? ` · ${probe.versionLine}` : ""} · ${probe.path}`,
        cls: "zzhub-ok",
      });
    } else {
      this.envStatusEl.createEl("p", {
        text: `环境未就绪 · ${probe.path}${probe.error ? `（${probe.error}）` : ""}`,
        cls: "zzhub-error",
      });
      this.envStatusEl.createEl("p", {
        text: "可点「一键安装」；若无 bun，请先复制下方命令安装 bun。",
        cls: "zzhub-muted",
      });
    }
  }

  private ensureInstallLog(): void {
    if (!this.installLogEl) return;
    this.installLogEl.show();
    this.installLogEl.setText("");
  }

  private appendInstallLog(line: string): void {
    if (!this.installLogEl || !line) return;
    this.installLogEl.show();
    const prev = this.installLogEl.getText();
    this.installLogEl.setText((prev ? prev + "\n" : "") + line);
    this.installLogEl.scrollTop = this.installLogEl.scrollHeight;
  }
}
