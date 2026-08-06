import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { join } from "path";

import {
  installPipelineCli,
  parseJsonFromOutput,
  probeCli,
  runCli,
  runSuggestedCommand,
  workspaceArgs,
  type CliProbe,
} from "./cli";
import {
  buildWorkflowHandoffPayload,
  displayTitleFromCache,
  resolveNoteTitle,
  writeHandoffFile,
} from "./handoff";
import {
  actionLabel,
  canAutoAdvance,
  friendlyStopMessage,
  isTaskComplete,
} from "./labels";
import {
  getNoteRecord,
  isRecordBelongsToNote,
  migrateFromFrontmatter,
  sanitizeNotesIndex,
  stripLegacyFrontmatterKeys,
  type NotePublishRecord,
} from "./note-meta";
import {
  loadPipelineWxSnapshot,
  type PipelineWxAccount,
} from "./pipeline-config";
import { ZzhubSettingTab } from "./settings-tab";
import {
  DEFAULT_SETTINGS,
  type AgentTaskShape,
  type ZzhubSettings,
} from "./types";
import { VIEW_TYPE_ZZHUB, ZzhubPanelView, type PanelNoteState } from "./view";

export default class ZzhubPipelinePlugin extends Plugin {
  settings: ZzhubSettings = { ...DEFAULT_SETTINGS };
  /** 仅缓存「当前笔记」对应的任务，切笔记必须清空 */
  private currentTask: AgentTaskShape | null = null;
  /** currentTask 所属笔记路径，不一致则丢弃 */
  private currentTaskNotePath: string | null = null;
  private running = false;
  private cliProbe: CliProbe | null = null;
  private boundFile: TFile | null = null;
  /** 防止快速切换笔记时旧请求覆盖新状态 */
  private refreshSeq = 0;
  /** pipeline 账号列表（含 name），面板/设置共用 */
  private pipelineAccounts: PipelineWxAccount[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_ZZHUB, (leaf) => new ZzhubPanelView(leaf, this));

    this.addRibbonIcon("send", "打开公众号发布面板", () => {
      void this.activatePanel();
    });

    this.addCommand({
      id: "open-panel",
      name: "打开公众号发布面板",
      callback: () => {
        void this.activatePanel();
      },
    });

    this.addCommand({
      id: "publish-current-note",
      name: "一键发布 / 重新发布当前文章",
      callback: () => {
        void this.activatePanel().then(() => this.publishCurrentNote());
      },
    });

    this.addCommand({
      id: "continue-publish",
      name: "继续发布（自动推进到结束）",
      callback: () => {
        void this.continuePublish();
      },
    });

    this.addCommand({
      id: "refresh-status",
      name: "刷新发布状态",
      callback: () => {
        void this.onPanelRefresh();
      },
    });

    this.addCommand({
      id: "doctor",
      name: "检查发布环境",
      callback: () => {
        void this.runDoctor({ fromSettings: false });
      },
    });

    this.addCommand({
      id: "install-cli",
      name: "安装发布工具 CLI",
      callback: () => {
        void this.installCli();
      },
    });

    this.addSettingTab(new ZzhubSettingTab(this.app, this));
  }

  getCliProbe(): CliProbe | null {
    return this.cliProbe;
  }

  getPipelineAccounts(): PipelineWxAccount[] {
    return this.pipelineAccounts;
  }

  /** 从 pipeline 刷新账号列表（含 name） */
  async refreshPipelineAccounts(): Promise<PipelineWxAccount[]> {
    const snap = await loadPipelineWxSnapshot(this.settings);
    if (snap.ok) {
      this.pipelineAccounts = snap.accounts;
      // 同步默认账号（若插件未单独指定）
      if (snap.defaultAccount) {
        this.settings.defaultAccount = snap.defaultAccount;
      }
    }
    return this.pipelineAccounts;
  }

  onunload(): void {
    /* views auto-detach */
  }

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) || {}) as Partial<ZzhubSettings> & {
      lastStatePath?: string;
      lastRunId?: string;
    };
    const { notes, removed } = sanitizeNotesIndex(raw.notes || {});
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw, {
      notes,
      accountLabels: { ...(raw.accountLabels || {}) },
    });
    // 丢弃旧版全局 last* 字段，防止串台
    delete (this.settings as { lastStatePath?: string }).lastStatePath;
    delete (this.settings as { lastRunId?: string }).lastRunId;
    if (removed.length > 0) {
      console.info("[zzhub] 已清理串台发布记录:", removed);
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    // 写入前再 sanitize，避免内存脏数据落盘
    const { notes } = sanitizeNotesIndex(this.settings.notes);
    this.settings.notes = notes;
    const payload = { ...this.settings };
    delete (payload as { lastStatePath?: string }).lastStatePath;
    delete (payload as { lastRunId?: string }).lastRunId;
    await this.saveData(payload);
  }

  async activatePanel(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_ZZHUB)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      leaf = right ?? workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_ZZHUB, active: true });
    }
    workspace.revealLeaf(leaf);
    await this.onPanelOpen();
  }

  private getPanel(): ZzhubPanelView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ZZHUB)[0];
    return leaf?.view instanceof ZzhubPanelView ? leaf.view : null;
  }

  private panelLog(msg: string, kind: "info" | "error" | "ok" = "info"): void {
    this.getPanel()?.setLog(msg, kind);
  }

  private setBusy(busy: boolean, text?: string): void {
    this.running = busy;
    this.getPanel()?.setBusy(busy, text);
    this.renderPanel();
  }

  private activeMdFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file && file.extension === "md" ? file : null;
  }

  private getRecordFor(file: TFile | null): NotePublishRecord | null {
    if (!file) return null;
    const rec = getNoteRecord(this.settings.notes, file.path);
    if (!rec) return null;
    if (!isRecordBelongsToNote(file.path, rec)) {
      // 脏数据：删掉
      delete this.settings.notes[file.path];
      void this.saveSettings();
      return null;
    }
    return rec;
  }

  private upsertRecord(path: string, patch: Partial<NotePublishRecord>): void {
    const prev = this.settings.notes[path] || {
      runId: "",
      published: false,
      platform: "wechat",
      sourceNotePath: path,
    };
    const next: NotePublishRecord = {
      ...prev,
      ...patch,
      sourceNotePath: path,
    };
    // 拒绝写入「明显不属于该笔记」的记录
    if (!isRecordBelongsToNote(path, next) && next.published && next.statePath) {
      console.warn("[zzhub] 拒绝写入不一致的发布记录", path, next);
      return;
    }
    this.settings.notes[path] = next;
  }

  private setCurrentTask(task: AgentTaskShape | null, notePath: string | null): void {
    this.currentTask = task;
    this.currentTaskNotePath = task ? notePath : null;
  }

  private taskForNote(notePath: string | null): AgentTaskShape | null {
    if (!notePath || !this.currentTask) return null;
    if (this.currentTaskNotePath !== notePath) return null;
    return this.currentTask;
  }

  private noteState(record: NotePublishRecord | null, task: AgentTaskShape | null): PanelNoteState {
    if (this.running) return "running";
    if (record?.published) return "published";
    if (task && record?.runId && task.summary?.run_id === record.runId && !isTaskComplete(task)) {
      return "draft";
    }
    return "draft";
  }

  renderPanel(): void {
    const panel = this.getPanel();
    if (!panel) return;

    const file = this.activeMdFile();
    const fileName = file ? file.basename : null;
    const notePath = file?.path ?? null;
    const record = this.getRecordFor(file);
    const task = this.taskForNote(notePath);

    if (this.cliProbe && !this.cliProbe.ok) {
      panel.showEnvNotReady();
    } else {
      panel.hideEnvNotReady();
    }

    // 标题：frontmatter.title → 文件名（不用任务 title，避免串台）
    const noteTitle = file
      ? displayTitleFromCache(
          this.app.metadataCache.getFileCache(file)?.frontmatter as
            | Record<string, unknown>
            | undefined,
          file.basename,
        )
      : null;

    panel.render({
      fileName,
      noteTitle,
      notePath,
      noteState: fileName ? this.noteState(record, task) : "none",
      record,
      task,
      running: this.running && this.boundFile?.path === notePath,
      cliOk: this.cliProbe ? this.cliProbe.ok : true,
    });
  }

  async onPanelOpen(): Promise<void> {
    await this.ensureCliProbed();
    if (this.cliProbe?.ok) {
      try {
        await this.refreshPipelineAccounts();
      } catch (e) {
        console.error(e);
      }
    }
    await this.onActiveNoteChange();
  }

  async onPanelRefresh(): Promise<void> {
    await this.ensureCliProbed(true);
    await this.refreshStatusForActiveNote({ quiet: false });
  }

  async onActiveNoteChange(): Promise<void> {
    const file = this.activeMdFile();
    this.boundFile = file;
    this.refreshSeq++; // 取消进行中的旧 refresh

    // 立刻清空任务缓存并重绘，避免闪现上一篇
    this.setCurrentTask(null, null);
    this.panelLog("");
    this.renderPanel();

    if (!file) return;

    await this.maybeMigrateLegacyFrontmatter(file);
    await this.refreshStatusForActiveNote({ quiet: true });
  }

  private async maybeMigrateLegacyFrontmatter(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter as Record<string, unknown> | undefined;
    const existing = this.settings.notes[file.path];
    const migrated = migrateFromFrontmatter(fm);
    if (migrated && !existing?.runId && !existing?.published) {
      this.upsertRecord(file.path, migrated);
      await this.saveSettings();
    }
    if (this.settings.stripLegacyFrontmatter && fm && migrateFromFrontmatter(fm)) {
      try {
        await this.app.fileManager.processFrontMatter(file, (front) => {
          stripLegacyFrontmatterKeys(front);
        });
      } catch (e) {
        console.error(e);
      }
    }
  }

  private async ensureCliProbed(force = false): Promise<boolean> {
    if (!force && this.cliProbe) return this.cliProbe.ok;
    this.cliProbe = await probeCli(this.settings);
    if (!this.cliProbe.ok) {
      this.getPanel()?.showEnvNotReady();
      this.renderPanel();
      return false;
    }
    this.getPanel()?.hideEnvNotReady();
    return true;
  }

  private vaultBasePath(): string | null {
    const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    if (typeof adapter.basePath === "string") return adapter.basePath;
    return null;
  }

  private absolutePathForFile(file: TFile): string {
    const base = this.vaultBasePath();
    if (!base) throw new Error("无法读取笔记路径，请在电脑版 Obsidian 中使用。");
    return join(base, normalizePath(file.path));
  }

  async publishCurrentNote(): Promise<void> {
    if (this.running) {
      new Notice("正在发布中，请稍候…");
      return;
    }
    await this.activatePanel();

    const okCli = await this.ensureCliProbed(true);
    if (!okCli) {
      new Notice("环境未就绪，请到设置 → 公众号一键发布 中检测/安装");
      return;
    }

    const file = this.activeMdFile();
    if (!file) {
      new Notice("请先打开要发布的 Markdown 文章");
      this.renderPanel();
      return;
    }
    this.boundFile = file;

    this.setBusy(true, "正在提交当前文章…");
    try {
      const ok = await this.enqueueCurrentNote({ quietNotice: true, file });
      if (!ok) return;
      new Notice("已开始发布，正在自动处理…");
      await this.advanceUntilDone({ maxSteps: 24, file });
    } finally {
      this.setBusy(false);
      await this.refreshStatusForActiveNote({ quiet: true });
    }
  }

  async continuePublish(): Promise<void> {
    if (this.running) {
      new Notice("正在发布中，请稍候…");
      return;
    }
    await this.activatePanel();
    const okCli = await this.ensureCliProbed(true);
    if (!okCli) {
      new Notice("环境未就绪，请到插件设置中检测/安装");
      return;
    }

    const file = this.activeMdFile() || this.boundFile;
    this.setBusy(true, "继续自动发布…");
    try {
      await this.refreshStatusForActiveNote({ quiet: true });
      const rec = file ? this.getRecordFor(file) : null;
      if (!rec?.runId && !this.currentTask) {
        new Notice("当前文章没有进行中的任务，请先发布");
        return;
      }
      await this.advanceUntilDone({ maxSteps: 24, file });
    } finally {
      this.setBusy(false);
      await this.refreshStatusForActiveNote({ quiet: true });
    }
  }

  async advanceUntilDone(opts?: { maxSteps?: number; file?: TFile | null }): Promise<void> {
    const maxSteps = opts?.maxSteps ?? 24;
    const file = opts?.file ?? this.boundFile;
    const autoReviewPass = this.settings.reviewPolicy === "trust_user";

    for (let i = 0; i < maxSteps; i++) {
      await this.refreshStatusForActiveNote({ quiet: true });
      const task = this.currentTask;
      if (!task) {
        this.panelLog("读不到任务状态。", "error");
        new Notice("读不到任务状态");
        return;
      }

      if (isTaskComplete(task)) {
        if (file) await this.savePublishedRecord(file, task);
        this.panelLog("");
        new Notice("发布完成！请到公众号草稿箱确认");
        this.renderPanel();
        return;
      }

      const next = task.next_action;
      if (!next) {
        this.panelLog("没有下一步了，但任务未完成。", "error");
        return;
      }

      const mode = canAutoAdvance(next, { autoReviewPass });
      if (mode === "stop") {
        if (next.action === "complete" || next.executor === "complete") {
          if (file) await this.savePublishedRecord(file, task);
          this.panelLog("");
          new Notice("发布完成！请到公众号草稿箱确认");
          this.renderPanel();
          return;
        }
        const msg = friendlyStopMessage(next);
        this.panelLog(msg, "error");
        new Notice(msg.slice(0, 80));
        return;
      }

      if (mode === "auto-review") {
        this.panelLog("自动确认内容…");
        const statePath =
          this.getRecordFor(file)?.statePath ||
          task.summary?.state_path ||
          next.params?.state_path;
        if (!statePath) {
          this.panelLog("无法自动审核：缺少任务路径。", "error");
          return;
        }
        const result = await runCli(
          this.settings,
          ["review", "--state", statePath, "--status", "passed", ...workspaceArgs(this.settings)],
          { timeoutMs: 60_000 },
        );
        if (!result.ok) {
          this.panelLog(this.shortErr(result.combined) || "自动审核失败", "error");
          return;
        }
        continue;
      }

      const stepName = actionLabel(next.action);
      this.panelLog(`正在${stepName}…`);
      this.renderPanel();
      const result = await runSuggestedCommand(this.settings, next.command!, {
        timeoutMs: 300_000,
      });
      if (!result.ok) {
        this.panelLog(this.shortErr(result.combined) || `${stepName}失败`, "error");
        new Notice(`${stepName}失败`);
        await this.refreshStatusForActiveNote({ quiet: true });
        return;
      }
    }

    await this.refreshStatusForActiveNote({ quiet: true });
    if (isTaskComplete(this.currentTask) && file && this.currentTask) {
      await this.savePublishedRecord(file, this.currentTask);
      this.panelLog("");
      new Notice("发布完成！请到公众号草稿箱确认");
    } else {
      this.panelLog("步骤较多已暂停，请再点一次发布按钮继续。", "error");
      new Notice("请再点一次发布按钮继续");
    }
    this.renderPanel();
  }

  private async savePublishedRecord(file: TFile, task: AgentTaskShape): Promise<void> {
    // 只允许给「真正在发的这篇」打标
    if (this.boundFile && this.boundFile.path !== file.path) {
      console.warn("[zzhub] skip savePublishedRecord: bound file mismatch");
      return;
    }
    const runId = task.summary?.run_id || this.getRecordFor(file)?.runId || "";
    const statePath = task.summary?.state_path || this.getRecordFor(file)?.statePath;
    const account = task.summary?.route?.account || this.settings.defaultAccount;
    const platform =
      task.summary?.route?.primary?.startsWith("wechat")
        ? "wechat"
        : task.summary?.route?.primary || "wechat";
    const results = task.summary?.publish?.results ?? [];
    const ok = results.find(
      (r) => r.status === "success" || r.status === "ok" || r.status === "done",
    );
    const draftId = (ok?.external_id || "").trim();

    // 标题：frontmatter.title → 文件名
    const title = displayTitleFromCache(
      this.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined,
      file.basename,
    );

    this.upsertRecord(file.path, {
      runId,
      statePath,
      published: true,
      publishedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      platform,
      account,
      title,
      draftId: draftId || this.getRecordFor(file)?.draftId,
      sourceNotePath: file.path,
    });
    await this.saveSettings();
  }

  private shortErr(raw: string): string {
    const t = raw.trim();
    if (!t) return "";
    if (/40164|IP|whitelist/i.test(t)) {
      return "公众号 IP 白名单未配置或已失效，请在微信公众平台更新本机 IP。";
    }
    if (/invalid credential|40001|40125|appsecret/i.test(t)) {
      return "公众号 AppID/AppSecret 有误，请检查发布工具配置。";
    }
    if (/ENOENT|not found|spawn/i.test(t)) {
      return "找不到发布工具，请安装或在设置中填写路径。";
    }
    const lines = t.split("\n").filter((l) => l.trim());
    return lines.slice(-4).join("\n").slice(0, 600);
  }

  async enqueueCurrentNote(opts?: {
    quietNotice?: boolean;
    file?: TFile;
  }): Promise<boolean> {
    const file = opts?.file || this.activeMdFile();
    if (!file) {
      new Notice("请先打开要发布的 Markdown 文章");
      this.panelLog("请先打开一篇 .md 文章。", "error");
      return false;
    }

    try {
      this.panelLog(`准备发布《${file.basename}》…`);
      const raw = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
      const rec = this.getRecordFor(file);
      const title = resolveNoteTitle(frontmatter, raw, file.basename);
      const bodyPath = this.absolutePathForFile(file);

      let account = this.settings.defaultAccount;
      if (rec?.account) account = rec.account;
      else if (typeof frontmatter.zzhub_account === "string") account = frontmatter.zzhub_account;
      else if (typeof frontmatter.account === "string") account = frontmatter.account;

      const isRepublish = !!rec?.published;
      const intentText =
        (typeof frontmatter.zzhub_intent === "string" && frontmatter.zzhub_intent) ||
        (isRepublish
          ? `重新发布到微信公众号（账号 ${account}）：${title}`
          : `发布到微信公众号（账号 ${account}）：${title}`);

      const payload = buildWorkflowHandoffPayload(this.settings, {
        bodyPath,
        title,
        account,
        intentText,
      });
      if (rec?.draftId) {
        const wh = payload.workflow_handoff as Record<string, unknown>;
        wh.explicit_constraints = [
          ...((wh.explicit_constraints as string[]) || []),
          `existing_draft_media_id=${rec.draftId}`,
        ];
      }

      const handoffPath = await writeHandoffFile(payload);
      const args = ["ingest-handoff", "--file", handoffPath, ...workspaceArgs(this.settings)];
      this.panelLog(isRepublish ? "正在创建重新发布任务…" : "正在创建发布任务…");
      const result = await runCli(this.settings, args, { timeoutMs: 120_000 });
      if (!result.ok) {
        this.panelLog(this.shortErr(result.combined) || "创建任务失败", "error");
        new Notice("创建发布任务失败");
        return false;
      }

      let statePath = "";
      let runId = "";
      try {
        const parsed = parseJsonFromOutput<Record<string, unknown>>(result.stdout || result.combined);
        const accepted = parsed.accepted_handoff as
          | { state_path?: string; run_id?: string }
          | undefined;
        const summary = parsed.summary as { state_path?: string; run_id?: string } | undefined;
        statePath = String(
          accepted?.state_path || summary?.state_path || (parsed.state_path as string) || "",
        );
        runId = String(accepted?.run_id || summary?.run_id || (parsed.run_id as string) || "");
        if (summary && parsed.next_action) {
          this.setCurrentTask(parsed as unknown as AgentTaskShape, file.path);
        }
      } catch {
        const mState = result.combined.match(/"state_path"\s*:\s*"([^"]+)"/);
        const mRun = result.combined.match(/"run_id"\s*:\s*"([^"]+)"/);
        if (mState) statePath = mState[1];
        if (mRun) runId = mRun[1];
      }

      // 只写插件存储；必须带 sourceNotePath；published 成功后再 true
      this.upsertRecord(file.path, {
        runId: runId || "",
        statePath: statePath || undefined,
        published: false,
        platform: "wechat",
        account,
        title,
        draftId: rec?.draftId,
        sourceNotePath: file.path,
      });
      await this.saveSettings();

      if (!opts?.quietNotice) {
        new Notice(`已创建发布任务：${title}`);
      }
      this.panelLog(`任务已创建：${title}`);
      await this.refreshStatusForActiveNote({ quiet: true });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.panelLog(msg, "error");
      new Notice(msg);
      return false;
    }
  }

  /**
   * 只查询「当前打开笔记」绑定的任务；无绑定则清空。
   * 注意：刷新时绝不给当前笔记「自动盖已发布章」（那是串台元凶）。
   */
  async refreshStatusForActiveNote(opts?: { quiet?: boolean }): Promise<void> {
    const seq = ++this.refreshSeq;
    const file = this.activeMdFile();

    if (!file) {
      this.setCurrentTask(null, null);
      this.renderPanel();
      if (!opts?.quiet) this.panelLog("");
      return;
    }

    const notePath = file.path;
    const rec = this.getRecordFor(file);

    // 当前笔记没有任何发布记录 → 未发布
    if (!rec?.runId && !rec?.statePath) {
      this.setCurrentTask(null, null);
      this.renderPanel();
      if (!opts?.quiet) this.panelLog("");
      return;
    }

    try {
      const args = ["status", "--view", "agent-json", ...workspaceArgs(this.settings)];
      if (rec.statePath) args.push("--state", rec.statePath);
      else if (rec.runId) args.push("--run-id", rec.runId);

      const result = await runCli(this.settings, args, { timeoutMs: 60_000 });
      if (seq !== this.refreshSeq) return;
      if (this.activeMdFile()?.path !== notePath) return;

      if (!result.ok) {
        this.setCurrentTask(null, null);
        this.renderPanel();
        if (!opts?.quiet && !rec.published) {
          this.panelLog(this.shortErr(result.combined) || "读取任务失败", "error");
        } else {
          this.panelLog("");
        }
        return;
      }

      const task = parseJsonFromOutput<AgentTaskShape>(result.stdout || result.combined);
      if (seq !== this.refreshSeq) return;
      if (this.activeMdFile()?.path !== notePath) return;

      if (rec.runId && task.summary?.run_id && task.summary.run_id !== rec.runId) {
        this.setCurrentTask(null, null);
        this.renderPanel();
        return;
      }

      // 任务标题/目录与笔记无关 → 当作脏关联，清掉记录
      const taskTitle = task.summary?.metadata?.title || "";
      const base = file.basename;
      if (
        taskTitle &&
        taskTitle !== base &&
        !taskTitle.includes(base) &&
        !base.includes(taskTitle) &&
        rec.statePath?.includes("test-ob-zzhub") &&
        !notePath.includes("test-ob-zzhub")
      ) {
        delete this.settings.notes[notePath];
        await this.saveSettings();
        this.setCurrentTask(null, null);
        this.renderPanel();
        if (!opts?.quiet) this.panelLog("已清除与当前笔记不匹配的旧发布记录", "ok");
        return;
      }

      this.setCurrentTask(task, notePath);

      // 只同步 statePath，不在 refresh 里改 published
      if (task.summary?.state_path && task.summary.state_path !== rec.statePath) {
        this.upsertRecord(notePath, {
          statePath: task.summary.state_path,
          sourceNotePath: notePath,
        });
        await this.saveSettings();
      }

      this.renderPanel();
      if (!opts?.quiet) this.panelLog("");
    } catch (err) {
      if (seq !== this.refreshSeq) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.setCurrentTask(null, null);
      if (!opts?.quiet) this.panelLog(msg, "error");
      this.renderPanel();
    }
  }

  async runDoctor(opts?: { fromSettings?: boolean }): Promise<void> {
    if (!opts?.fromSettings) {
      this.panelLog("正在检查环境…");
    }
    this.cliProbe = await probeCli(this.settings);
    if (!this.cliProbe.ok) {
      this.getPanel()?.showEnvNotReady();
      if (!opts?.fromSettings) {
        this.panelLog("环境未就绪", "error");
        new Notice("环境未就绪，请到插件设置中检测/安装");
      }
      this.renderPanel();
      return;
    }

    this.getPanel()?.hideEnvNotReady();
    try {
      await this.refreshPipelineAccounts();
    } catch {
      /* ignore */
    }
    const result = await runCli(
      this.settings,
      ["doctor", ...workspaceArgs(this.settings)],
      { timeoutMs: 60_000 },
    );
    if (result.ok) {
      if (!opts?.fromSettings) {
        this.panelLog("环境正常", "ok");
      }
      new Notice("环境正常，可以发布");
    } else {
      // CLI 能启动但 doctor 报错：仍算「有环境」，细节用 Notice
      if (!opts?.fromSettings) {
        this.panelLog(this.shortErr(result.combined) || "环境检查未通过", "error");
      }
      new Notice("环境检查有问题，请到设置中查看");
    }
    this.renderPanel();
  }

  /**
   * 自动安装 @zzclub/pipeline（需 bun 或 npm）。
   * 返回是否安装成功且 probe 通过。
   */
  async installCli(onLog?: (line: string) => void): Promise<boolean> {
    const log = onLog || ((line: string) => this.panelLog(line));
    log("开始安装发布工具…");
    const result = await installPipelineCli(this.settings, log);
    if (!result.ok) {
      log(result.output || "安装失败");
      new Notice("自动安装失败");
      this.cliProbe = await probeCli(this.settings);
      this.renderPanel();
      return false;
    }
    log("安装命令完成，正在检测…");
    // 安装后常见路径
    if (!this.settings.cliPath) {
      // 不强制写死，probe 会扫 ~/.bun/bin
    }
    this.cliProbe = await probeCli(this.settings);
    if (this.cliProbe.ok) {
      // 若检测到绝对路径，写入设置方便下次
      if (this.cliProbe.path.includes("/")) {
        this.settings.cliPath = this.cliProbe.path;
        await this.saveSettings();
      }
      log(`安装成功：${this.cliProbe.path}`);
      this.renderPanel();
      return true;
    }
    log("安装后仍检测不到，请在设置中填写「发布工具路径」");
    this.renderPanel();
    return false;
  }
}
