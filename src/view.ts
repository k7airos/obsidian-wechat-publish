import { ItemView, WorkspaceLeaf } from "obsidian";

import {
  actionLabel,
  isTaskComplete,
  phaseStatusLabel,
} from "./labels";
import type ZzhubPipelinePlugin from "./main";
import type { NotePublishRecord } from "./note-meta";
import { accountDisplayName } from "./pipeline-config";
import type { AgentTaskShape } from "./types";

export const VIEW_TYPE_ZZHUB = "wechat-publish-panel";

export type PanelNoteState = "none" | "draft" | "running" | "published";

export class ZzhubPanelView extends ItemView {
  plugin: ZzhubPipelinePlugin;
  private root: HTMLElement | null = null;
  private envBanner: HTMLElement | null = null;
  private heroCard: HTMLElement | null = null;
  private actionsEl: HTMLElement | null = null;
  private primaryBtn: HTMLButtonElement | null = null;
  private refreshBtn: HTMLButtonElement | null = null;
  private logEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ZzhubPipelinePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ZZHUB;
  }

  getDisplayText(): string {
    return "公众号发布";
  }

  getIcon(): string {
    return "send";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("zzhub-panel");
    this.root = container;

    const header = container.createDiv({ cls: "zzhub-panel-header" });
    header.createEl("h4", { text: "公众号发布", cls: "zzhub-panel-title" });

    this.envBanner = container.createDiv({ cls: "zzhub-env-banner" });
    this.envBanner.hide();

    this.heroCard = container.createDiv({ cls: "zzhub-hero" });

    this.actionsEl = container.createDiv({ cls: "zzhub-actions" });
    this.primaryBtn = this.actionsEl.createEl("button", {
      text: "一键发布",
      cls: "zzhub-btn-primary mod-cta",
    });
    this.primaryBtn.addEventListener("click", () => {
      void this.plugin.publishCurrentNote();
    });
    this.refreshBtn = this.actionsEl.createEl("button", {
      text: "刷新",
      cls: "zzhub-btn-secondary",
    });
    this.refreshBtn.addEventListener("click", () => {
      void this.plugin.onPanelRefresh();
    });

    this.logEl = container.createDiv({ cls: "zzhub-log" });
    this.logEl.hide();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.plugin.onActiveNoteChange();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        void this.plugin.onActiveNoteChange();
      }),
    );

    await this.plugin.onPanelOpen();
  }

  async onClose(): Promise<void> {
    this.root = null;
    this.envBanner = null;
    this.heroCard = null;
    this.actionsEl = null;
    this.primaryBtn = null;
    this.refreshBtn = null;
    this.logEl = null;
  }

  setLog(message: string, kind: "info" | "error" | "ok" = "info"): void {
    if (!this.logEl) return;
    if (!message) {
      this.logEl.setText("");
      this.logEl.hide();
      return;
    }
    this.logEl.show();
    this.logEl.removeClass("zzhub-log-error");
    this.logEl.removeClass("zzhub-log-ok");
    this.logEl.removeClass("zzhub-log-info");
    this.logEl.addClass(
      kind === "error" ? "zzhub-log-error" : kind === "ok" ? "zzhub-log-ok" : "zzhub-log-info",
    );
    this.logEl.setText(message);
  }

  setBusy(busy: boolean, text?: string): void {
    if (this.primaryBtn) this.primaryBtn.disabled = busy;
    if (this.refreshBtn) this.refreshBtn.disabled = busy;
    if (busy && text) this.setLog(text, "info");
  }

  showEnvNotReady(): void {
    if (!this.envBanner) return;
    this.envBanner.show();
    this.envBanner.empty();
    this.envBanner.setText("环境未就绪");
  }

  hideEnvNotReady(): void {
    if (!this.envBanner) return;
    this.envBanner.hide();
    this.envBanner.empty();
  }

  showCliMissing(): void {
    this.showEnvNotReady();
  }

  hideCliMissing(): void {
    this.hideEnvNotReady();
  }

  render(opts: {
    fileName: string | null;
    noteTitle: string | null;
    notePath: string | null;
    noteState: PanelNoteState;
    record: NotePublishRecord | null;
    task: AgentTaskShape | null;
    running: boolean;
    cliOk: boolean;
  }): void {
    const { fileName, noteTitle, noteState, record, task, running, cliOk } = opts;
    const displayTitle = (noteTitle && noteTitle.trim()) || fileName || "—";
    const nameOpts = {
      accounts: this.plugin.getPipelineAccounts(),
      overrides: this.plugin.settings.accountLabels,
    };

    if (!cliOk) this.showEnvNotReady();
    else this.hideEnvNotReady();

    // 主按钮
    if (this.primaryBtn) {
      this.primaryBtn.disabled = running || !fileName || !cliOk;
      this.primaryBtn.removeClass("zzhub-btn-publish");
      this.primaryBtn.removeClass("zzhub-btn-republish");
      if (!cliOk) {
        this.primaryBtn.setText("环境未就绪");
      } else if (running) {
        this.primaryBtn.setText("发布中…");
      } else if (noteState === "published") {
        this.primaryBtn.setText("重新发布");
        this.primaryBtn.addClass("zzhub-btn-republish");
      } else {
        this.primaryBtn.setText("一键发布");
        this.primaryBtn.addClass("zzhub-btn-publish");
      }
    }
    if (this.refreshBtn) {
      this.refreshBtn.disabled = !cliOk || running;
    }

    if (!this.heroCard) return;
    this.heroCard.empty();
    this.heroCard.removeClass("zzhub-hero-empty");
    this.heroCard.removeClass("zzhub-hero-draft");
    this.heroCard.removeClass("zzhub-hero-published");
    this.heroCard.removeClass("zzhub-hero-running");
    this.heroCard.removeClass("zzhub-hero-error");

    if (!cliOk) {
      this.heroCard.addClass("zzhub-hero-error");
      this.heroCard.createDiv({ cls: "zzhub-hero-empty-msg", text: "请到设置中检测或安装发布工具" });
      return;
    }

    if (!fileName) {
      this.heroCard.addClass("zzhub-hero-empty");
      this.heroCard.createDiv({
        cls: "zzhub-hero-empty-msg",
        text: "打开一篇 Markdown 文章后即可发布",
      });
      return;
    }

    // 状态
    let stateKey: "draft" | "published" | "running" = "draft";
    let stateLabel = "未发布";
    if (running) {
      stateKey = "running";
      const step = task?.next_action?.action
        ? actionLabel(task.next_action.action)
        : "处理中";
      stateLabel = `发布中 · ${step}`;
    } else if (noteState === "published") {
      stateKey = "published";
      stateLabel = "已发布";
    } else if (task?.summary && !isTaskComplete(task) && isTaskForCurrentRecord(task, record)) {
      stateKey = "running";
      stateLabel = `进行中 · ${actionLabel(task.next_action?.action)}`;
    }

    this.heroCard.addClass(`zzhub-hero-${stateKey === "draft" ? "draft" : stateKey}`);

    // 顶行：徽章
    const top = this.heroCard.createDiv({ cls: "zzhub-hero-top" });
    const badge = top.createDiv({
      cls: `zzhub-badge zzhub-badge-${stateKey}`,
      text: stateLabel,
    });
    void badge;

    // 标题
    this.heroCard.createDiv({ cls: "zzhub-hero-title", text: displayTitle });

    // 元信息
    const meta = this.heroCard.createDiv({ cls: "zzhub-hero-meta" });
    if (stateKey === "published" && record) {
      this.metaChip(meta, "公众号", accountDisplayName(record.account, nameOpts));
      this.metaChip(meta, "平台", platformLabel(record.platform || "wechat"));
      if (record.publishedAt) {
        this.metaChip(meta, "时间", formatTime(record.publishedAt));
      }
    } else if (running || (task?.summary && !isTaskComplete(task))) {
      const account =
        task?.summary?.route?.account ||
        record?.account ||
        this.plugin.settings.defaultAccount;
      this.metaChip(meta, "公众号", accountDisplayName(account, nameOpts));
      if (task?.summary?.phase) {
        this.metaChip(
          meta,
          "进度",
          `${shortPhase(task.summary.phase.prepare)} · ${shortPhase(task.summary.phase.render)} · ${shortPhase(task.summary.phase.publish)}`,
        );
      }
    } else {
      // 未发布：简洁
      this.metaChip(
        meta,
        "将发往",
        accountDisplayName(this.plugin.settings.defaultAccount, nameOpts),
      );
      this.metaChip(meta, "平台", "微信公众号");
    }

    // 发布中进度条视觉
    if (running || stateKey === "running") {
      const bar = this.heroCard.createDiv({ cls: "zzhub-progress" });
      const fill = bar.createDiv({ cls: "zzhub-progress-fill" });
      const p = task?.summary?.phase;
      let pct = 15;
      if (p?.prepare === "done" || p?.prepare === "completed") pct = 40;
      if (p?.render === "done" || p?.render === "completed") pct = 70;
      if (p?.publish === "done" || p?.publish === "completed") pct = 100;
      if (running && pct < 90) pct = Math.max(pct, 25);
      fill.style.width = `${pct}%`;
    }
  }

  private metaChip(parent: HTMLElement, label: string, value: string): void {
    const chip = parent.createDiv({ cls: "zzhub-chip" });
    chip.createSpan({ cls: "zzhub-chip-label", text: label });
    chip.createSpan({ cls: "zzhub-chip-value", text: value || "—" });
  }
}

function platformLabel(platform: string): string {
  if (platform === "wechat" || platform === "wechat-article") return "微信公众号";
  if (platform === "blog") return "博客";
  return platform || "微信公众号";
}

function shortPhase(status?: string | null): string {
  const s = phaseStatusLabel(status);
  if (s === "已完成") return "✓";
  if (s === "进行中") return "…";
  if (s === "等待中") return "·";
  if (s === "失败") return "✕";
  return s.slice(0, 1);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function isTaskForCurrentRecord(
  task: AgentTaskShape,
  record: NotePublishRecord | null,
): boolean {
  if (!record?.runId) return false;
  return task.summary?.run_id === record.runId;
}
