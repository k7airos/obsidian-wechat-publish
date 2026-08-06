var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ZzhubPipelinePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");
var import_path4 = require("path");

// src/cli.ts
var import_child_process = require("child_process");
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");
function existsExecutable(path) {
  try {
    (0, import_fs.accessSync)(path, import_fs.constants.X_OK);
    return true;
  } catch {
    try {
      (0, import_fs.accessSync)(path, import_fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
function buildPath(settings) {
  const home = (0, import_os.homedir)();
  const extras = [
    settings.extraPath,
    (0, import_path.join)(home, ".bun", "bin"),
    (0, import_path.join)(home, ".local", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin"
  ].filter(Boolean).flatMap((p) => String(p).split(import_path.delimiter).filter(Boolean));
  const current = process.env.PATH ?? "";
  return [...extras, current].join(import_path.delimiter);
}
function resolveCliPath(settings) {
  if (settings.cliPath.trim()) {
    return settings.cliPath.trim();
  }
  const home = (0, import_os.homedir)();
  const candidates = [
    (0, import_path.join)(home, ".bun", "bin", "zzhub-pipeline"),
    (0, import_path.join)(home, ".bun", "bin", "zzp"),
    (0, import_path.join)(home, ".local", "bin", "zzhub-pipeline"),
    "zzhub-pipeline",
    "zzp"
  ];
  for (const c of candidates) {
    if (c.includes("/") && existsExecutable(c)) {
      return c;
    }
  }
  return "zzhub-pipeline";
}
async function probeCli(settings) {
  const path = resolveCliPath(settings);
  if (path.includes("/") && !existsExecutable(path)) {
    return {
      ok: false,
      path,
      versionLine: "",
      error: "\u8DEF\u5F84\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u6267\u884C"
    };
  }
  const result = await runCli(settings, ["--help"], { timeoutMs: 15e3 });
  if (!result.ok && !/Usage:|Commands:/i.test(result.combined)) {
    return {
      ok: false,
      path,
      versionLine: "",
      error: result.stderr || result.combined || "\u65E0\u6CD5\u542F\u52A8\u53D1\u5E03\u5DE5\u5177"
    };
  }
  const ver = await runCli(settings, ["--version"], { timeoutMs: 1e4 });
  return {
    ok: true,
    path,
    versionLine: (ver.stdout || ver.combined || "").trim().slice(0, 120),
    error: ""
  };
}
var INSTALL_COMMANDS = {
  bun: "bun add -g @zzclub/pipeline",
  npm: "npm install -g @zzclub/pipeline",
  note: "\u5B89\u88C5\u540E\u8BF7\u786E\u4FDD ~/.bun/bin \u6216\u5168\u5C40 npm bin \u5728 PATH \u4E2D\uFF0C\u6216\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u586B\u5199\u7EDD\u5BF9\u8DEF\u5F84\u3002",
  /** 先装 bun（无 bun/npm 时） */
  bunRuntimeMac: "curl -fsSL https://bun.sh/install | bash",
  bunRuntimeWin: 'powershell -c "irm bun.sh/install.ps1 | iex"'
};
async function detectPackageManager(settings) {
  const env = { ...process.env, PATH: buildPath(settings) };
  const home = (0, import_os.homedir)();
  const bunCandidates = [(0, import_path.join)(home, ".bun", "bin", "bun"), "bun"];
  for (const b of bunCandidates) {
    if (b.includes("/") && !existsExecutable(b)) continue;
    const ok = await runShell(b, ["--version"], env, 8e3);
    if (ok.ok || /\d+\.\d+/.test(ok.combined)) {
      return { manager: "bun", path: b.includes("/") ? b : "bun" };
    }
  }
  const npmCandidates = ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "npm"];
  for (const n of npmCandidates) {
    if (n.includes("/") && !existsExecutable(n)) continue;
    const ok = await runShell(n, ["--version"], env, 8e3);
    if (ok.ok || /\d+\.\d+/.test(ok.combined)) {
      return { manager: "npm", path: n.includes("/") ? n : "npm" };
    }
  }
  return { manager: null, path: "" };
}
async function installPipelineCli(settings, onLog) {
  const { manager, path } = await detectPackageManager(settings);
  if (!manager) {
    return {
      ok: false,
      command: "",
      output: "\u672A\u68C0\u6D4B\u5230 bun \u6216 npm\uFF0C\u65E0\u6CD5\u81EA\u52A8\u5B89\u88C5\u3002\u8BF7\u5148\u5B89\u88C5 bun\uFF08https://bun.sh\uFF09\u6216 Node.js\u3002"
    };
  }
  const env = { ...process.env, PATH: buildPath(settings) };
  const args = manager === "bun" ? ["add", "-g", "@zzclub/pipeline"] : ["install", "-g", "@zzclub/pipeline"];
  const command = `${path} ${args.join(" ")}`;
  onLog?.(`\u6267\u884C\uFF1A${command}`);
  const result = await runShell(path, args, env, 3e5, onLog);
  return {
    ok: result.ok || /zzhub-pipeline|@zzclub\/pipeline/.test(result.combined),
    command,
    output: result.combined.slice(0, 4e3)
  };
}
function runShell(cmd, args, env, timeoutMs, onLog) {
  return new Promise((resolve) => {
    const child = (0, import_child_process.spawn)(cmd, args, { env, shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: stderr + `
[timeout ${timeoutMs}ms]`,
        combined: (stdout + "\n" + stderr).trim()
      });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      const s = chunk.toString();
      stdout += s;
      onLog?.(s.trimEnd());
    });
    child.stderr?.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      onLog?.(s.trimEnd());
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: err.message,
        combined: `${stdout}
${stderr}
${err.message}`.trim()
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        combined: [stdout, stderr].filter(Boolean).join("\n").trim()
      });
    });
  });
}
function runCli(settings, args, options) {
  const cli = resolveCliPath(settings);
  const env = {
    ...process.env,
    PATH: buildPath(settings)
  };
  if (settings.workspaceRoot.trim()) {
    env.ZZHUB_PIPELINE_WORKSPACE_ROOT = settings.workspaceRoot.trim();
  }
  return new Promise((resolve) => {
    const child = (0, import_child_process.spawn)(cli, args, {
      env,
      cwd: options?.cwd || settings.workspaceRoot.trim() || void 0,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = options?.timeoutMs && options.timeoutMs > 0 ? setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
        settled = true;
        resolve({
          ok: false,
          code: null,
          stdout,
          stderr: stderr + `
[timeout after ${options.timeoutMs}ms]`,
          combined: (stdout + "\n" + stderr).trim()
        });
      }
    }, options.timeoutMs) : null;
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}
${err.message}`.trim(),
        combined: `${stdout}
${stderr}
${err.message}`.trim()
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        combined: [stdout, stderr].filter(Boolean).join("\n").trim()
      });
    });
  });
}
function runSuggestedCommand(settings, command, options) {
  const cli = resolveCliPath(settings);
  const trimmed = command.trim();
  const rewritten = trimmed.replace(/^(zzhub-pipeline|zzp)\b/, shellQuote(cli));
  const env = {
    ...process.env,
    PATH: buildPath(settings)
  };
  if (settings.workspaceRoot.trim()) {
    env.ZZHUB_PIPELINE_WORKSPACE_ROOT = settings.workspaceRoot.trim();
  }
  return new Promise((resolve) => {
    const child = (0, import_child_process.spawn)(rewritten, {
      env,
      cwd: settings.workspaceRoot.trim() || void 0,
      shell: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = options?.timeoutMs && options.timeoutMs > 0 ? setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
        settled = true;
        resolve({
          ok: false,
          code: null,
          stdout,
          stderr: stderr + `
[timeout after ${options.timeoutMs}ms]`,
          combined: (stdout + "\n" + stderr).trim()
        });
      }
    }, options.timeoutMs) : null;
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}
${err.message}`.trim(),
        combined: `${stdout}
${stderr}
${err.message}`.trim()
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        combined: [stdout, stderr].filter(Boolean).join("\n").trim()
      });
    });
  });
}
function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function workspaceArgs(settings) {
  const ws = settings.workspaceRoot.trim();
  return ws ? ["--workspace", ws] : [];
}
function parseJsonFromOutput(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const startArr = trimmed.indexOf("[");
    let i = -1;
    if (start >= 0 && (startArr < 0 || start < startArr)) i = start;
    else if (startArr >= 0) i = startArr;
    if (i < 0) throw new Error("CLI output is not JSON");
    const slice = trimmed.slice(i);
    return JSON.parse(slice);
  }
}

// src/handoff.ts
var import_promises = require("fs/promises");
var import_os2 = require("os");
var import_path2 = require("path");
function buildWorkflowHandoffPayload(settings, draft) {
  return {
    workflow_handoff: {
      mode: "new",
      content_form: draft.contentForm ?? "article",
      body_path: draft.bodyPath,
      target_account: draft.account || settings.defaultAccount || "default",
      title: draft.title,
      user_intent_text: draft.intentText,
      authoring_policy: draft.authoringPolicy ?? settings.authoringPolicy,
      review_policy: draft.reviewPolicy ?? settings.reviewPolicy,
      research_policy: "skip"
    }
  };
}
async function writeHandoffFile(payload) {
  const dir = await (0, import_promises.mkdtemp)((0, import_path2.join)((0, import_os2.tmpdir)(), "zzhub-ob-"));
  const file = (0, import_path2.join)(dir, "handoff.json");
  await (0, import_promises.writeFile)(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}
function resolveNoteTitle(frontmatter, _body, basename) {
  const fm = frontmatter ?? {};
  for (const key of ["title", "\u6807\u9898", "Title"]) {
    const v = fm[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return basename.replace(/\.md$/i, "");
}
function displayTitleFromCache(frontmatter, basename) {
  return resolveNoteTitle(frontmatter ?? void 0, "", basename);
}

// src/labels.ts
function phaseStatusLabel(status) {
  switch (status) {
    case "pending":
      return "\u7B49\u5F85\u4E2D";
    case "running":
    case "in_progress":
      return "\u8FDB\u884C\u4E2D";
    case "done":
    case "completed":
      return "\u5DF2\u5B8C\u6210";
    case "failed":
    case "error":
      return "\u5931\u8D25";
    case "skipped":
      return "\u5DF2\u8DF3\u8FC7";
    default:
      return status || "-";
  }
}
function actionLabel(action) {
  switch (action) {
    case "prepare":
      return "\u6574\u7406\u6B63\u6587\u4E0E\u5143\u6570\u636E";
    case "prepare-finalize":
      return "\u751F\u6210\u5C01\u9762\u5173\u952E\u8BCD\u7B49";
    case "render":
      return "\u6E32\u67D3\u5C01\u9762/\u914D\u56FE";
    case "publish":
      return "\u63D0\u4EA4\u5230\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1";
    case "review-content":
      return "\u5185\u5BB9\u5BA1\u6838";
    case "revise-content":
      return "\u6839\u636E\u610F\u89C1\u4FEE\u6539\u6B63\u6587";
    case "attach-body":
      return "\u8865\u5145\u6B63\u6587";
    case "attach-body-images":
      return "\u8865\u5145\u6B63\u6587\u914D\u56FE";
    case "complete":
      return "\u5168\u90E8\u5B8C\u6210";
    case "reset-or-repair":
      return "\u4FEE\u590D\u4EFB\u52A1";
    case "await-render-client":
      return "\u7B49\u5F85\u8FDC\u7A0B\u6E32\u67D3";
    default:
      return action ? `\u6267\u884C\uFF1A${action}` : "\u7B49\u5F85\u4E2D";
  }
}
function isTaskComplete(task) {
  if (!task?.summary) return false;
  if (task.next_action?.action === "complete" || task.next_action?.executor === "complete") {
    return true;
  }
  if (task.summary.mode === "done") return true;
  const pub = task.summary.phase?.publish;
  if (pub === "done" || pub === "completed") {
    const results = task.summary.publish?.results ?? [];
    if (results.some((r) => r.status === "success" || r.status === "ok" || r.status === "done")) {
      return true;
    }
  }
  return false;
}
function canAutoAdvance(next, opts) {
  if (!next) return "stop";
  if (next.action === "complete" || next.executor === "complete") return "stop";
  if (next.executor === "cli" && next.command) return "cli";
  if (opts.autoReviewPass && (next.action === "review-content" || next.action === "review")) {
    return "auto-review";
  }
  return "stop";
}
function friendlyStopMessage(next) {
  const name = actionLabel(next.action);
  switch (next.executor) {
    case "await-input":
      return `\u9700\u8981\u4F60\u8865\u5145\u6750\u6599\u540E\u624D\u80FD\u7EE7\u7EED\uFF1A${name}\u3002${next.reason || ""}`.trim();
    case "worker":
      if (next.action === "revise-content") {
        return `\u6B63\u6587\u9700\u8981\u4FEE\u6539\uFF1A${next.params?.feedback || next.reason || "\u8BF7\u6309\u5BA1\u6838\u610F\u89C1\u6539\u7A3F\u540E\u518D\u53D1"}`;
      }
      if (next.action === "attach-body") {
        return "\u8FD8\u6CA1\u6709\u6B63\u6587\uFF0C\u8BF7\u5728\u7B14\u8BB0\u91CC\u5199\u597D\u5185\u5BB9\u540E\u518D\u70B9\u4E00\u952E\u53D1\u5E03\u3002";
      }
      return `\u5F53\u524D\u6B65\u9AA4\u300C${name}\u300D\u9700\u8981\u4EBA\u5DE5\u5904\u7406\u3002${next.reason || ""}`.trim();
    case "repair":
      return `\u4EFB\u52A1\u5F02\u5E38\uFF0C\u9700\u8981\u4FEE\u590D\uFF1A${next.reason || name}`;
    default:
      return `\u65E0\u6CD5\u81EA\u52A8\u5B8C\u6210\u300C${name}\u300D\u3002${next.reason || ""}`.trim();
  }
}

// src/note-meta.ts
function getNoteRecord(notes, path) {
  if (!notes || !path) return null;
  const rec = notes[path];
  if (!rec) return null;
  if (rec.sourceNotePath && rec.sourceNotePath !== path) return null;
  return rec;
}
function folderFromStatePath(statePath) {
  if (!statePath) return null;
  const m = statePath.match(/[/\\]posts[/\\][^/\\]+[/\\]([^/\\]+)[/\\]/);
  return m?.[1] ?? null;
}
function isRecordBelongsToNote(path, rec) {
  if (rec.sourceNotePath && rec.sourceNotePath !== path) return false;
  const base = path.replace(/\.md$/i, "").split("/").pop() || "";
  if (!base) return false;
  const folder = folderFromStatePath(rec.statePath);
  if (folder) {
    const norm = (s) => s.toLowerCase().replace(/-v\d+$/i, "");
    const f = norm(folder);
    const b = norm(base);
    if (!f.includes(b) && !b.includes(f) && f !== b) {
      return false;
    }
  }
  if (rec.title && rec.title !== base) {
    const t = rec.title.toLowerCase();
    const b = base.toLowerCase();
    if (!t.includes(b) && !b.includes(t) && rec.statePath?.includes("test-ob-zzhub")) {
      return false;
    }
  }
  return true;
}
function sanitizeNotesIndex(notes) {
  const input = notes || {};
  const out = {};
  const removed = [];
  const byRun = /* @__PURE__ */ new Map();
  for (const [path, rec] of Object.entries(input)) {
    if (!rec?.runId) {
      if (rec && isRecordBelongsToNote(path, rec)) out[path] = { ...rec, sourceNotePath: path };
      else if (rec) removed.push(path);
      continue;
    }
    const list = byRun.get(rec.runId) || [];
    list.push(path);
    byRun.set(rec.runId, list);
  }
  for (const [runId, paths] of byRun) {
    const valid = paths.filter((p) => isRecordBelongsToNote(p, input[p]));
    if (valid.length === 0) {
      removed.push(...paths);
      continue;
    }
    let keep = valid.find((p) => input[p].sourceNotePath === p) || valid[0];
    if (valid.length > 1) {
      keep = valid.find((p) => {
        const folder = folderFromStatePath(input[p].statePath);
        const base = p.replace(/\.md$/i, "").split("/").pop() || "";
        return folder && (folder.includes(base) || base.includes(folder.replace(/-v\d+$/i, "")));
      }) || keep;
    }
    for (const p of paths) {
      if (p === keep) {
        out[p] = { ...input[p], sourceNotePath: p, runId };
      } else {
        removed.push(p);
      }
    }
  }
  return { notes: out, removed };
}
function migrateFromFrontmatter(frontmatter) {
  if (!frontmatter) return null;
  const runId = typeof frontmatter.zzhub_run_id === "string" ? frontmatter.zzhub_run_id.trim() : "";
  const publishedRaw = frontmatter.zzhub_published;
  const published = publishedRaw === true || publishedRaw === "true" || publishedRaw === 1 || publishedRaw === "1";
  if (!runId && !published) return null;
  return {
    runId,
    statePath: typeof frontmatter.zzhub_state_path === "string" ? frontmatter.zzhub_state_path.trim() : void 0,
    published,
    platform: "wechat",
    publishedAt: typeof frontmatter.zzhub_published_at === "string" ? frontmatter.zzhub_published_at : void 0,
    account: typeof frontmatter.zzhub_account === "string" ? frontmatter.zzhub_account : void 0,
    draftId: typeof frontmatter.zzhub_draft_id === "string" ? frontmatter.zzhub_draft_id : void 0
  };
}
function stripLegacyFrontmatterKeys(fm) {
  const keys = [
    "zzhub_run_id",
    "zzhub_state_path",
    "zzhub_published",
    "zzhub_published_at",
    "zzhub_draft_id"
  ];
  let changed = false;
  for (const k of keys) {
    if (k in fm) {
      delete fm[k];
      changed = true;
    }
  }
  return changed;
}

// src/pipeline-config.ts
var import_path3 = require("path");
var import_os3 = require("os");
function accountDisplayName(key, options) {
  if (!key) return "\u672A\u9009\u62E9\u8D26\u53F7";
  const o = options?.overrides?.[key]?.trim();
  if (o) return o;
  const fromList = options?.accounts?.find((a) => a.key === key)?.name?.trim();
  if (fromList) return fromList;
  const p = options?.pipelineName?.trim();
  if (p) return p;
  return key;
}
function maskAppId(appId) {
  if (!appId) return "\u672A\u586B\u5199";
  if (appId.length <= 8) return appId.slice(0, 2) + "***";
  return appId.slice(0, 6) + "\u2026" + appId.slice(-4);
}
async function loadPipelineWxSnapshot(settings) {
  const result = await runCli(settings, ["config", "--export"], { timeoutMs: 2e4 });
  if (!result.ok && !result.stdout.trim().startsWith("{")) {
    return {
      ok: false,
      error: result.stderr || result.combined || "\u65E0\u6CD5\u8BFB\u53D6 pipeline \u914D\u7F6E",
      defaultAccount: settings.defaultAccount || "default",
      accounts: [],
      workspaceRoot: settings.workspaceRoot || "",
      raw: null
    };
  }
  try {
    const raw = parseJsonFromOutput(result.stdout || result.combined);
    const wx = raw.wx || {};
    const defaultAccount = String(wx.defaultAccount || settings.defaultAccount || "default");
    const accountsObj = wx.accounts || {};
    const accounts = Object.keys(accountsObj).sort((a, b) => {
      if (a === defaultAccount) return -1;
      if (b === defaultAccount) return 1;
      return a.localeCompare(b);
    }).map((key) => {
      const acc = accountsObj[key] || {};
      const appId = String(acc.appId || "");
      const appSecret = String(acc.appSecret || "");
      const pat = String(acc.pat || "");
      const name = typeof acc.name === "string" ? acc.name.trim() : "";
      const hasSecret = Boolean(appSecret && appSecret !== "null");
      const hasPat = Boolean(pat && pat !== "null");
      return {
        key,
        name,
        appId,
        hasAppId: Boolean(appId),
        hasSecret,
        hasPat
      };
    });
    const paths = raw.paths || {};
    const workspaceRoot = String(paths.workspaceRoot || settings.workspaceRoot || "");
    return {
      ok: true,
      error: "",
      defaultAccount,
      accounts,
      workspaceRoot,
      raw
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      defaultAccount: settings.defaultAccount || "default",
      accounts: [],
      workspaceRoot: settings.workspaceRoot || "",
      raw: null
    };
  }
}
function guessConfigPath() {
  return (0, import_path3.join)((0, import_os3.homedir)(), "Library", "Application Support", "zzhub-pipeline", "config.json");
}

// src/settings-tab.ts
var import_obsidian = require("obsidian");
var ZzhubSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.envStatusEl = null;
    this.installLogEl = null;
    this.accountsEl = null;
    this.snapshot = null;
    this.loadingAccounts = false;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u516C\u4F17\u53F7\u4E00\u952E\u53D1\u5E03" });
    containerEl.createEl("p", {
      text: "\u628A\u5F53\u524D\u7B14\u8BB0\u63D0\u4EA4\u5230\u672C\u673A\u53D1\u5E03\u5DE5\u5177\uFF0C\u81EA\u52A8\u51C6\u5907\u6587\u7AE0\u5E76\u63A8\u5230\u5FAE\u4FE1\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1\u3002",
      cls: "zzhub-muted"
    });
    containerEl.createEl("h3", { text: "\u53D1\u5E03\u73AF\u5883" });
    this.envStatusEl = containerEl.createDiv({ cls: "zzhub-settings-env" });
    this.refreshEnvStatus();
    new import_obsidian.Setting(containerEl).setName("\u68C0\u6D4B\u73AF\u5883").setDesc("\u68C0\u67E5\u672C\u673A zzhub-pipeline \u662F\u5426\u53EF\u7528\u3002").addButton(
      (btn) => btn.setButtonText("\u68C0\u6D4B").onClick(async () => {
        btn.setDisabled(true);
        btn.setButtonText("\u68C0\u6D4B\u4E2D\u2026");
        try {
          await this.plugin.runDoctor({ fromSettings: true });
          this.refreshEnvStatus();
          await this.reloadAccounts();
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("\u68C0\u6D4B");
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u5B89\u88C5\u53D1\u5E03\u5DE5\u5177").setDesc(
      `\u4F7F\u7528\u672C\u673A bun \u6216 npm \u5168\u5C40\u5B89\u88C5 @zzclub/pipeline\u3002\u7B49\u4EF7\u4E8E\uFF1A${INSTALL_COMMANDS.bun}`
    ).addButton(
      (btn) => btn.setButtonText("\u4E00\u952E\u5B89\u88C5").setCta().onClick(async () => {
        btn.setDisabled(true);
        btn.setButtonText("\u5B89\u88C5\u4E2D\u2026");
        this.ensureInstallLog();
        try {
          const ok = await this.plugin.installCli((line) => {
            this.appendInstallLog(line);
          });
          this.refreshEnvStatus();
          if (ok) {
            new import_obsidian.Notice("\u53D1\u5E03\u5DE5\u5177\u5B89\u88C5\u6210\u529F");
            await this.reloadAccounts();
          } else new import_obsidian.Notice("\u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u4E0B\u65B9\u65E5\u5FD7");
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("\u4E00\u952E\u5B89\u88C5");
        }
      })
    );
    this.installLogEl = containerEl.createEl("pre", { cls: "zzhub-install-log" });
    this.installLogEl.hide();
    containerEl.createEl("p", {
      text: "\u82E5\u8FD8\u6CA1\u6709 bun\uFF0C\u8BF7\u5148\u5728\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\u4E0B\u9762\u547D\u4EE4\uFF0C\u88C5\u597D\u540E\u56DE\u5230\u8FD9\u91CC\u70B9\u300C\u4E00\u952E\u5B89\u88C5\u300D\u53D1\u5E03\u5DE5\u5177\u3002",
      cls: "zzhub-muted"
    });
    this.addCopyCommandSetting(
      containerEl,
      "\u5B89\u88C5 bun\uFF08macOS / Linux\uFF09",
      INSTALL_COMMANDS.bunRuntimeMac
    );
    this.addCopyCommandSetting(
      containerEl,
      "\u5B89\u88C5 bun\uFF08Windows\uFF09",
      INSTALL_COMMANDS.bunRuntimeWin
    );
    this.addCopyCommandSetting(
      containerEl,
      "\u624B\u52A8\u5B89\u88C5\u53D1\u5E03\u5DE5\u5177\uFF08\u5DF2\u6709 bun\uFF09",
      INSTALL_COMMANDS.bun
    );
    this.addCopyCommandSetting(
      containerEl,
      "\u624B\u52A8\u5B89\u88C5\u53D1\u5E03\u5DE5\u5177\uFF08\u5DF2\u6709 npm\uFF09",
      INSTALL_COMMANDS.npm
    );
    containerEl.createEl("h3", { text: "\u516C\u4F17\u53F7\u8D26\u53F7" });
    containerEl.createEl("p", {
      text: `\u53EA\u8BFB\u5C55\u793A\uFF0C\u6570\u636E\u6765\u81EA pipeline\uFF08${guessConfigPath()}\uFF09\u3002\u663E\u793A\u540D\u7528\u914D\u7F6E\u91CC\u7684 name\uFF1B\u8D26\u53F7\u589E\u6539\u8BF7\u7528 zzp/config\uFF0C\u672C\u63D2\u4EF6\u6682\u4E0D\u6539\u914D\u7F6E\u6587\u4EF6\u3002`,
      cls: "zzhub-muted"
    });
    this.accountsEl = containerEl.createDiv({ cls: "zzhub-accounts" });
    void this.reloadAccounts();
    new import_obsidian.Setting(containerEl).setName("\u5237\u65B0\u8D26\u53F7\u5217\u8868").setDesc("\u4ECE pipeline \u91CD\u65B0\u8BFB\u53D6\u5DF2\u914D\u7F6E\u7684\u516C\u4F17\u53F7\u3002").addButton(
      (btn) => btn.setButtonText("\u5237\u65B0").onClick(async () => {
        btn.setDisabled(true);
        try {
          await this.reloadAccounts();
          new import_obsidian.Notice("\u8D26\u53F7\u5217\u8868\u5DF2\u5237\u65B0");
        } finally {
          btn.setDisabled(false);
        }
      })
    );
    containerEl.createEl("h3", { text: "\u53D1\u5E03\u9ED8\u8BA4" });
    new import_obsidian.Setting(containerEl).setName("\u53D1\u5E03\u76EE\u6807").setDesc("\u4E00\u822C\u586B wechat\uFF08\u5FAE\u4FE1\u516C\u4F17\u53F7\uFF09\u3002").addText(
      (text) => text.setPlaceholder("wechat").setValue(this.plugin.settings.defaultTargets).onChange(async (value) => {
        this.plugin.settings.defaultTargets = value.trim() || "wechat";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6B63\u6587\u600E\u4E48\u5904\u7406").setDesc("\u63A8\u8350\u300C\u76F4\u63A5\u7528\u7B14\u8BB0\u6B63\u6587\u300D\u3002").addDropdown(
      (dd) => dd.addOption("format_only", "\u76F4\u63A5\u7528\u7B14\u8BB0\u6B63\u6587\uFF08\u63A8\u8350\uFF09").addOption("write", "\u9700\u8981\u91CD\u65B0\u5199\u7A3F").addOption("revise", "\u5728\u539F\u6587\u4E0A\u4FEE\u6539").setValue(this.plugin.settings.authoringPolicy).onChange(async (value) => {
        this.plugin.settings.authoringPolicy = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u53D1\u5E03\u524D\u662F\u5426\u8981\u4EBA\u5DE5\u5BA1\u6838").setDesc("\u81EA\u5DF1\u5199\u81EA\u5DF1\u53D1\uFF1A\u9009\u300C\u4E0D\u7528\u5BA1\u6838\uFF0C\u76F4\u63A5\u53D1\u300D\u3002").addDropdown(
      (dd) => dd.addOption("trust_user", "\u4E0D\u7528\u5BA1\u6838\uFF0C\u76F4\u63A5\u53D1\uFF08\u63A8\u8350\uFF09").addOption("required", "\u9700\u8981\u5BA1\u6838\u901A\u8FC7\u540E\u518D\u53D1").setValue(this.plugin.settings.reviewPolicy).onChange(async (value) => {
        this.plugin.settings.reviewPolicy = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u9AD8\u7EA7" });
    new import_obsidian.Setting(containerEl).setName("\u53D1\u5E03\u5DE5\u5177\u8DEF\u5F84").setDesc("\u672C\u673A zzhub-pipeline \u53EF\u6267\u884C\u6587\u4EF6\u3002\u7559\u7A7A\u5219\u81EA\u52A8\u67E5\u627E\u3002").addText(
      (text) => text.setPlaceholder("/Users/\u4F60/.bun/bin/zzhub-pipeline").setValue(this.plugin.settings.cliPath).onChange(async (value) => {
        this.plugin.settings.cliPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5DE5\u4F5C\u533A\u76EE\u5F55").setDesc("\u53D1\u5E03\u4EFB\u52A1\u5B58\u653E\u76EE\u5F55\u3002\u7559\u7A7A\u7528\u53D1\u5E03\u5DE5\u5177\u81EA\u5DF1\u7684\u914D\u7F6E\u3002").addText(
      (text) => text.setPlaceholder("/Users/\u4F60/.oh-my-zzhub").setValue(this.plugin.settings.workspaceRoot).onChange(async (value) => {
        this.plugin.settings.workspaceRoot = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u989D\u5916 PATH").setDesc("\u82E5\u63D0\u793A\u627E\u4E0D\u5230\u547D\u4EE4\uFF0C\u53EF\u586B bun \u6240\u5728\u76EE\u5F55\u3002").addText(
      (text) => text.setPlaceholder("/Users/\u4F60/.bun/bin").setValue(this.plugin.settings.extraPath).onChange(async (value) => {
        this.plugin.settings.extraPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6E05\u7406\u7B14\u8BB0\u91CC\u65E7\u7684\u53D1\u5E03\u5B57\u6BB5").setDesc("\u6253\u5F00\u7B14\u8BB0\u65F6\u81EA\u52A8\u5220\u9664\u65E7\u7684 zzhub_* frontmatter\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.stripLegacyFrontmatter).onChange(async (v) => {
        this.plugin.settings.stripLegacyFrontmatter = v;
        await this.plugin.saveSettings();
      })
    );
  }
  async reloadAccounts() {
    if (!this.accountsEl || this.loadingAccounts) return;
    this.loadingAccounts = true;
    this.accountsEl.empty();
    this.accountsEl.createEl("p", { text: "\u6B63\u5728\u8BFB\u53D6\u8D26\u53F7\u2026", cls: "zzhub-muted" });
    try {
      this.snapshot = await loadPipelineWxSnapshot(this.plugin.settings);
      if (this.snapshot.ok) {
        await this.plugin.refreshPipelineAccounts();
      }
      this.renderAccounts();
    } catch (e) {
      this.accountsEl.empty();
      this.accountsEl.createEl("p", {
        text: e instanceof Error ? e.message : String(e),
        cls: "zzhub-error"
      });
    } finally {
      this.loadingAccounts = false;
    }
  }
  renderAccounts() {
    if (!this.accountsEl) return;
    this.accountsEl.empty();
    const snap = this.snapshot;
    if (!snap) {
      this.accountsEl.createEl("p", { text: "\u5C1A\u672A\u52A0\u8F7D", cls: "zzhub-muted" });
      return;
    }
    if (!snap.ok) {
      this.accountsEl.createEl("p", {
        text: `\u65E0\u6CD5\u8BFB\u53D6\u8D26\u53F7\uFF1A${snap.error || "\u73AF\u5883\u672A\u5C31\u7EEA"}`,
        cls: "zzhub-error"
      });
      this.accountsEl.createEl("p", {
        text: "\u8BF7\u5148\u5B8C\u6210\u4E0A\u65B9\u300C\u68C0\u6D4B\u73AF\u5883 / \u4E00\u952E\u5B89\u88C5\u300D\u3002",
        cls: "zzhub-muted"
      });
      return;
    }
    if (snap.accounts.length === 0) {
      this.accountsEl.createEl("p", {
        text: "pipeline \u914D\u7F6E\u91CC\u8FD8\u6CA1\u6709\u516C\u4F17\u53F7\u8D26\u53F7\u3002",
        cls: "zzhub-muted"
      });
      return;
    }
    void this.plugin.refreshPipelineAccounts();
    const nameOpts = { accounts: snap.accounts };
    const defaultSetting = new import_obsidian.Setting(this.accountsEl).setName("\u53D1\u5E03\u65F6\u9ED8\u8BA4\u4F7F\u7528").setDesc("\u4EC5\u5F71\u54CD\u672C\u63D2\u4EF6\u4E00\u952E\u53D1\u5E03\uFF0C\u4E0D\u4F1A\u6539 pipeline \u914D\u7F6E\u6587\u4EF6\u3002");
    defaultSetting.addDropdown((dd) => {
      for (const acc of snap.accounts) {
        dd.addOption(acc.key, accountDisplayName(acc.key, nameOpts));
      }
      const current = this.plugin.settings.defaultAccount || snap.defaultAccount || snap.accounts[0]?.key || "default";
      dd.setValue(current);
      dd.onChange(async (value) => {
        this.plugin.settings.defaultAccount = value;
        await this.plugin.saveSettings();
        new import_obsidian.Notice(
          `\u9ED8\u8BA4\u516C\u4F17\u53F7\uFF1A${accountDisplayName(value, { accounts: this.snapshot?.accounts })}`
        );
        this.renderAccounts();
      });
    });
    for (const acc of snap.accounts) {
      const isDefault = acc.key === (this.plugin.settings.defaultAccount || snap.defaultAccount);
      const card = this.accountsEl.createDiv({
        cls: isDefault ? "zzhub-account-card zzhub-account-card-default" : "zzhub-account-card"
      });
      const header = card.createDiv({ cls: "zzhub-account-card-header" });
      header.createEl("strong", {
        text: accountDisplayName(acc.key, nameOpts)
      });
      if (isDefault) {
        header.createEl("span", { text: "\u9ED8\u8BA4", cls: "zzhub-account-badge" });
      }
      const meta = card.createDiv({ cls: "zzhub-account-meta" });
      meta.createEl("div", {
        text: `\u914D\u7F6E\u952E\uFF1A${acc.key}`,
        cls: "zzhub-muted"
      });
      meta.createEl("div", {
        text: `AppID\uFF1A${maskAppId(acc.appId)}`
      });
      const statusParts = [];
      statusParts.push(acc.hasAppId ? "AppID \u5DF2\u586B" : "AppID \u672A\u586B");
      statusParts.push(acc.hasSecret ? "\u5BC6\u94A5\u5DF2\u914D\u7F6E" : "\u5BC6\u94A5\u672A\u914D\u7F6E");
      if (acc.hasPat) statusParts.push("PAT \u5DF2\u914D\u7F6E");
      meta.createEl("div", {
        text: statusParts.join(" \xB7 "),
        cls: acc.hasAppId && acc.hasSecret ? "zzhub-ok" : "zzhub-error"
      });
    }
  }
  addCopyCommandSetting(containerEl, name, command) {
    new import_obsidian.Setting(containerEl).setName(name).setDesc(command).addButton(
      (btn) => btn.setButtonText("\u590D\u5236").onClick(async () => {
        await navigator.clipboard.writeText(command);
        new import_obsidian.Notice("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
      })
    );
  }
  refreshEnvStatus() {
    if (!this.envStatusEl) return;
    this.envStatusEl.empty();
    const probe = this.plugin.getCliProbe();
    if (!probe) {
      this.envStatusEl.createEl("p", {
        text: "\u5C1A\u672A\u68C0\u6D4B\u3002\u8BF7\u70B9\u300C\u68C0\u6D4B\u300D\u3002",
        cls: "zzhub-muted"
      });
      return;
    }
    if (probe.ok) {
      this.envStatusEl.createEl("p", {
        text: `\u2713 \u73AF\u5883\u6B63\u5E38${probe.versionLine ? ` \xB7 ${probe.versionLine}` : ""} \xB7 ${probe.path}`,
        cls: "zzhub-ok"
      });
    } else {
      this.envStatusEl.createEl("p", {
        text: `\u73AF\u5883\u672A\u5C31\u7EEA \xB7 ${probe.path}${probe.error ? `\uFF08${probe.error}\uFF09` : ""}`,
        cls: "zzhub-error"
      });
      this.envStatusEl.createEl("p", {
        text: "\u53EF\u70B9\u300C\u4E00\u952E\u5B89\u88C5\u300D\uFF1B\u82E5\u65E0 bun\uFF0C\u8BF7\u5148\u590D\u5236\u4E0B\u65B9\u547D\u4EE4\u5B89\u88C5 bun\u3002",
        cls: "zzhub-muted"
      });
    }
  }
  ensureInstallLog() {
    if (!this.installLogEl) return;
    this.installLogEl.show();
    this.installLogEl.setText("");
  }
  appendInstallLog(line) {
    if (!this.installLogEl || !line) return;
    this.installLogEl.show();
    const prev = this.installLogEl.getText();
    this.installLogEl.setText((prev ? prev + "\n" : "") + line);
    this.installLogEl.scrollTop = this.installLogEl.scrollHeight;
  }
};

// src/types.ts
var DEFAULT_SETTINGS = {
  cliPath: "",
  workspaceRoot: "",
  defaultAccount: "default",
  defaultTargets: "wechat",
  authoringPolicy: "format_only",
  reviewPolicy: "trust_user",
  extraPath: "",
  notes: {},
  stripLegacyFrontmatter: true,
  accountLabels: {}
};

// src/view.ts
var import_obsidian2 = require("obsidian");
var VIEW_TYPE_ZZHUB = "wechat-publish-panel";
var ZzhubPanelView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.root = null;
    this.envBanner = null;
    this.heroCard = null;
    this.actionsEl = null;
    this.primaryBtn = null;
    this.refreshBtn = null;
    this.logEl = null;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_ZZHUB;
  }
  getDisplayText() {
    return "\u516C\u4F17\u53F7\u53D1\u5E03";
  }
  getIcon() {
    return "send";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("zzhub-panel");
    this.root = container;
    const header = container.createDiv({ cls: "zzhub-panel-header" });
    header.createEl("h4", { text: "\u516C\u4F17\u53F7\u53D1\u5E03", cls: "zzhub-panel-title" });
    this.envBanner = container.createDiv({ cls: "zzhub-env-banner" });
    this.envBanner.hide();
    this.heroCard = container.createDiv({ cls: "zzhub-hero" });
    this.actionsEl = container.createDiv({ cls: "zzhub-actions" });
    this.primaryBtn = this.actionsEl.createEl("button", {
      text: "\u4E00\u952E\u53D1\u5E03",
      cls: "zzhub-btn-primary mod-cta"
    });
    this.primaryBtn.addEventListener("click", () => {
      void this.plugin.publishCurrentNote();
    });
    this.refreshBtn = this.actionsEl.createEl("button", {
      text: "\u5237\u65B0",
      cls: "zzhub-btn-secondary"
    });
    this.refreshBtn.addEventListener("click", () => {
      void this.plugin.onPanelRefresh();
    });
    this.logEl = container.createDiv({ cls: "zzhub-log" });
    this.logEl.hide();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.plugin.onActiveNoteChange();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        void this.plugin.onActiveNoteChange();
      })
    );
    await this.plugin.onPanelOpen();
  }
  async onClose() {
    this.root = null;
    this.envBanner = null;
    this.heroCard = null;
    this.actionsEl = null;
    this.primaryBtn = null;
    this.refreshBtn = null;
    this.logEl = null;
  }
  setLog(message, kind = "info") {
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
      kind === "error" ? "zzhub-log-error" : kind === "ok" ? "zzhub-log-ok" : "zzhub-log-info"
    );
    this.logEl.setText(message);
  }
  setBusy(busy, text) {
    if (this.primaryBtn) this.primaryBtn.disabled = busy;
    if (this.refreshBtn) this.refreshBtn.disabled = busy;
    if (busy && text) this.setLog(text, "info");
  }
  showEnvNotReady() {
    if (!this.envBanner) return;
    this.envBanner.show();
    this.envBanner.empty();
    this.envBanner.setText("\u73AF\u5883\u672A\u5C31\u7EEA");
  }
  hideEnvNotReady() {
    if (!this.envBanner) return;
    this.envBanner.hide();
    this.envBanner.empty();
  }
  showCliMissing() {
    this.showEnvNotReady();
  }
  hideCliMissing() {
    this.hideEnvNotReady();
  }
  render(opts) {
    const { fileName, noteTitle, noteState, record, task, running, cliOk } = opts;
    const displayTitle = noteTitle && noteTitle.trim() || fileName || "\u2014";
    const nameOpts = {
      accounts: this.plugin.getPipelineAccounts(),
      overrides: this.plugin.settings.accountLabels
    };
    if (!cliOk) this.showEnvNotReady();
    else this.hideEnvNotReady();
    if (this.primaryBtn) {
      this.primaryBtn.disabled = running || !fileName || !cliOk;
      this.primaryBtn.removeClass("zzhub-btn-publish");
      this.primaryBtn.removeClass("zzhub-btn-republish");
      if (!cliOk) {
        this.primaryBtn.setText("\u73AF\u5883\u672A\u5C31\u7EEA");
      } else if (running) {
        this.primaryBtn.setText("\u53D1\u5E03\u4E2D\u2026");
      } else if (noteState === "published") {
        this.primaryBtn.setText("\u91CD\u65B0\u53D1\u5E03");
        this.primaryBtn.addClass("zzhub-btn-republish");
      } else {
        this.primaryBtn.setText("\u4E00\u952E\u53D1\u5E03");
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
      this.heroCard.createDiv({ cls: "zzhub-hero-empty-msg", text: "\u8BF7\u5230\u8BBE\u7F6E\u4E2D\u68C0\u6D4B\u6216\u5B89\u88C5\u53D1\u5E03\u5DE5\u5177" });
      return;
    }
    if (!fileName) {
      this.heroCard.addClass("zzhub-hero-empty");
      this.heroCard.createDiv({
        cls: "zzhub-hero-empty-msg",
        text: "\u6253\u5F00\u4E00\u7BC7 Markdown \u6587\u7AE0\u540E\u5373\u53EF\u53D1\u5E03"
      });
      return;
    }
    let stateKey = "draft";
    let stateLabel = "\u672A\u53D1\u5E03";
    if (running) {
      stateKey = "running";
      const step = task?.next_action?.action ? actionLabel(task.next_action.action) : "\u5904\u7406\u4E2D";
      stateLabel = `\u53D1\u5E03\u4E2D \xB7 ${step}`;
    } else if (noteState === "published") {
      stateKey = "published";
      stateLabel = "\u5DF2\u53D1\u5E03";
    } else if (task?.summary && !isTaskComplete(task) && isTaskForCurrentRecord(task, record)) {
      stateKey = "running";
      stateLabel = `\u8FDB\u884C\u4E2D \xB7 ${actionLabel(task.next_action?.action)}`;
    }
    this.heroCard.addClass(`zzhub-hero-${stateKey === "draft" ? "draft" : stateKey}`);
    const top = this.heroCard.createDiv({ cls: "zzhub-hero-top" });
    const badge = top.createDiv({
      cls: `zzhub-badge zzhub-badge-${stateKey}`,
      text: stateLabel
    });
    void badge;
    this.heroCard.createDiv({ cls: "zzhub-hero-title", text: displayTitle });
    const meta = this.heroCard.createDiv({ cls: "zzhub-hero-meta" });
    if (stateKey === "published" && record) {
      this.metaChip(meta, "\u516C\u4F17\u53F7", accountDisplayName(record.account, nameOpts));
      this.metaChip(meta, "\u5E73\u53F0", platformLabel(record.platform || "wechat"));
      if (record.publishedAt) {
        this.metaChip(meta, "\u65F6\u95F4", formatTime(record.publishedAt));
      }
    } else if (running || task?.summary && !isTaskComplete(task)) {
      const account = task?.summary?.route?.account || record?.account || this.plugin.settings.defaultAccount;
      this.metaChip(meta, "\u516C\u4F17\u53F7", accountDisplayName(account, nameOpts));
      if (task?.summary?.phase) {
        this.metaChip(
          meta,
          "\u8FDB\u5EA6",
          `${shortPhase(task.summary.phase.prepare)} \xB7 ${shortPhase(task.summary.phase.render)} \xB7 ${shortPhase(task.summary.phase.publish)}`
        );
      }
    } else {
      this.metaChip(
        meta,
        "\u5C06\u53D1\u5F80",
        accountDisplayName(this.plugin.settings.defaultAccount, nameOpts)
      );
      this.metaChip(meta, "\u5E73\u53F0", "\u5FAE\u4FE1\u516C\u4F17\u53F7");
    }
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
  metaChip(parent, label, value) {
    const chip = parent.createDiv({ cls: "zzhub-chip" });
    chip.createSpan({ cls: "zzhub-chip-label", text: label });
    chip.createSpan({ cls: "zzhub-chip-value", text: value || "\u2014" });
  }
};
function platformLabel(platform) {
  if (platform === "wechat" || platform === "wechat-article") return "\u5FAE\u4FE1\u516C\u4F17\u53F7";
  if (platform === "blog") return "\u535A\u5BA2";
  return platform || "\u5FAE\u4FE1\u516C\u4F17\u53F7";
}
function shortPhase(status) {
  const s = phaseStatusLabel(status);
  if (s === "\u5DF2\u5B8C\u6210") return "\u2713";
  if (s === "\u8FDB\u884C\u4E2D") return "\u2026";
  if (s === "\u7B49\u5F85\u4E2D") return "\xB7";
  if (s === "\u5931\u8D25") return "\u2715";
  return s.slice(0, 1);
}
function formatTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function isTaskForCurrentRecord(task, record) {
  if (!record?.runId) return false;
  return task.summary?.run_id === record.runId;
}

// src/main.ts
var ZzhubPipelinePlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    /** 仅缓存「当前笔记」对应的任务，切笔记必须清空 */
    this.currentTask = null;
    /** currentTask 所属笔记路径，不一致则丢弃 */
    this.currentTaskNotePath = null;
    this.running = false;
    this.cliProbe = null;
    this.boundFile = null;
    /** 防止快速切换笔记时旧请求覆盖新状态 */
    this.refreshSeq = 0;
    /** pipeline 账号列表（含 name），面板/设置共用 */
    this.pipelineAccounts = [];
  }
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_ZZHUB, (leaf) => new ZzhubPanelView(leaf, this));
    this.addRibbonIcon("send", "\u6253\u5F00\u516C\u4F17\u53F7\u53D1\u5E03\u9762\u677F", () => {
      void this.activatePanel();
    });
    this.addCommand({
      id: "open-panel",
      name: "\u6253\u5F00\u516C\u4F17\u53F7\u53D1\u5E03\u9762\u677F",
      callback: () => {
        void this.activatePanel();
      }
    });
    this.addCommand({
      id: "publish-current-note",
      name: "\u4E00\u952E\u53D1\u5E03 / \u91CD\u65B0\u53D1\u5E03\u5F53\u524D\u6587\u7AE0",
      callback: () => {
        void this.activatePanel().then(() => this.publishCurrentNote());
      }
    });
    this.addCommand({
      id: "continue-publish",
      name: "\u7EE7\u7EED\u53D1\u5E03\uFF08\u81EA\u52A8\u63A8\u8FDB\u5230\u7ED3\u675F\uFF09",
      callback: () => {
        void this.continuePublish();
      }
    });
    this.addCommand({
      id: "refresh-status",
      name: "\u5237\u65B0\u53D1\u5E03\u72B6\u6001",
      callback: () => {
        void this.onPanelRefresh();
      }
    });
    this.addCommand({
      id: "doctor",
      name: "\u68C0\u67E5\u53D1\u5E03\u73AF\u5883",
      callback: () => {
        void this.runDoctor({ fromSettings: false });
      }
    });
    this.addCommand({
      id: "install-cli",
      name: "\u5B89\u88C5\u53D1\u5E03\u5DE5\u5177 CLI",
      callback: () => {
        void this.installCli();
      }
    });
    this.addSettingTab(new ZzhubSettingTab(this.app, this));
  }
  getCliProbe() {
    return this.cliProbe;
  }
  getPipelineAccounts() {
    return this.pipelineAccounts;
  }
  /** 从 pipeline 刷新账号列表（含 name） */
  async refreshPipelineAccounts() {
    const snap = await loadPipelineWxSnapshot(this.settings);
    if (snap.ok) {
      this.pipelineAccounts = snap.accounts;
      if (snap.defaultAccount) {
        this.settings.defaultAccount = snap.defaultAccount;
      }
    }
    return this.pipelineAccounts;
  }
  onunload() {
  }
  async loadSettings() {
    const raw = await this.loadData() || {};
    const { notes, removed } = sanitizeNotesIndex(raw.notes || {});
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw, {
      notes,
      accountLabels: { ...raw.accountLabels || {} }
    });
    delete this.settings.lastStatePath;
    delete this.settings.lastRunId;
    if (removed.length > 0) {
      console.info("[zzhub] \u5DF2\u6E05\u7406\u4E32\u53F0\u53D1\u5E03\u8BB0\u5F55:", removed);
      await this.saveSettings();
    }
  }
  async saveSettings() {
    const { notes } = sanitizeNotesIndex(this.settings.notes);
    this.settings.notes = notes;
    const payload = { ...this.settings };
    delete payload.lastStatePath;
    delete payload.lastRunId;
    await this.saveData(payload);
  }
  async activatePanel() {
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
  getPanel() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ZZHUB)[0];
    return leaf?.view instanceof ZzhubPanelView ? leaf.view : null;
  }
  panelLog(msg, kind = "info") {
    this.getPanel()?.setLog(msg, kind);
  }
  setBusy(busy, text) {
    this.running = busy;
    this.getPanel()?.setBusy(busy, text);
    this.renderPanel();
  }
  activeMdFile() {
    const file = this.app.workspace.getActiveFile();
    return file && file.extension === "md" ? file : null;
  }
  getRecordFor(file) {
    if (!file) return null;
    const rec = getNoteRecord(this.settings.notes, file.path);
    if (!rec) return null;
    if (!isRecordBelongsToNote(file.path, rec)) {
      delete this.settings.notes[file.path];
      void this.saveSettings();
      return null;
    }
    return rec;
  }
  upsertRecord(path, patch) {
    const prev = this.settings.notes[path] || {
      runId: "",
      published: false,
      platform: "wechat",
      sourceNotePath: path
    };
    const next = {
      ...prev,
      ...patch,
      sourceNotePath: path
    };
    if (!isRecordBelongsToNote(path, next) && next.published && next.statePath) {
      console.warn("[zzhub] \u62D2\u7EDD\u5199\u5165\u4E0D\u4E00\u81F4\u7684\u53D1\u5E03\u8BB0\u5F55", path, next);
      return;
    }
    this.settings.notes[path] = next;
  }
  setCurrentTask(task, notePath) {
    this.currentTask = task;
    this.currentTaskNotePath = task ? notePath : null;
  }
  taskForNote(notePath) {
    if (!notePath || !this.currentTask) return null;
    if (this.currentTaskNotePath !== notePath) return null;
    return this.currentTask;
  }
  noteState(record, task) {
    if (this.running) return "running";
    if (record?.published) return "published";
    if (task && record?.runId && task.summary?.run_id === record.runId && !isTaskComplete(task)) {
      return "draft";
    }
    return "draft";
  }
  renderPanel() {
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
    const noteTitle = file ? displayTitleFromCache(
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      file.basename
    ) : null;
    panel.render({
      fileName,
      noteTitle,
      notePath,
      noteState: fileName ? this.noteState(record, task) : "none",
      record,
      task,
      running: this.running && this.boundFile?.path === notePath,
      cliOk: this.cliProbe ? this.cliProbe.ok : true
    });
  }
  async onPanelOpen() {
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
  async onPanelRefresh() {
    await this.ensureCliProbed(true);
    await this.refreshStatusForActiveNote({ quiet: false });
  }
  async onActiveNoteChange() {
    const file = this.activeMdFile();
    this.boundFile = file;
    this.refreshSeq++;
    this.setCurrentTask(null, null);
    this.panelLog("");
    this.renderPanel();
    if (!file) return;
    await this.maybeMigrateLegacyFrontmatter(file);
    await this.refreshStatusForActiveNote({ quiet: true });
  }
  async maybeMigrateLegacyFrontmatter(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
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
  async ensureCliProbed(force = false) {
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
  vaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    if (typeof adapter.basePath === "string") return adapter.basePath;
    return null;
  }
  absolutePathForFile(file) {
    const base = this.vaultBasePath();
    if (!base) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u7B14\u8BB0\u8DEF\u5F84\uFF0C\u8BF7\u5728\u7535\u8111\u7248 Obsidian \u4E2D\u4F7F\u7528\u3002");
    return (0, import_path4.join)(base, (0, import_obsidian3.normalizePath)(file.path));
  }
  async publishCurrentNote() {
    if (this.running) {
      new import_obsidian3.Notice("\u6B63\u5728\u53D1\u5E03\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u2026");
      return;
    }
    await this.activatePanel();
    const okCli = await this.ensureCliProbed(true);
    if (!okCli) {
      new import_obsidian3.Notice("\u73AF\u5883\u672A\u5C31\u7EEA\uFF0C\u8BF7\u5230\u8BBE\u7F6E \u2192 \u516C\u4F17\u53F7\u4E00\u952E\u53D1\u5E03 \u4E2D\u68C0\u6D4B/\u5B89\u88C5");
      return;
    }
    const file = this.activeMdFile();
    if (!file) {
      new import_obsidian3.Notice("\u8BF7\u5148\u6253\u5F00\u8981\u53D1\u5E03\u7684 Markdown \u6587\u7AE0");
      this.renderPanel();
      return;
    }
    this.boundFile = file;
    this.setBusy(true, "\u6B63\u5728\u63D0\u4EA4\u5F53\u524D\u6587\u7AE0\u2026");
    try {
      const ok = await this.enqueueCurrentNote({ quietNotice: true, file });
      if (!ok) return;
      new import_obsidian3.Notice("\u5DF2\u5F00\u59CB\u53D1\u5E03\uFF0C\u6B63\u5728\u81EA\u52A8\u5904\u7406\u2026");
      await this.advanceUntilDone({ maxSteps: 24, file });
    } finally {
      this.setBusy(false);
      await this.refreshStatusForActiveNote({ quiet: true });
    }
  }
  async continuePublish() {
    if (this.running) {
      new import_obsidian3.Notice("\u6B63\u5728\u53D1\u5E03\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u2026");
      return;
    }
    await this.activatePanel();
    const okCli = await this.ensureCliProbed(true);
    if (!okCli) {
      new import_obsidian3.Notice("\u73AF\u5883\u672A\u5C31\u7EEA\uFF0C\u8BF7\u5230\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u68C0\u6D4B/\u5B89\u88C5");
      return;
    }
    const file = this.activeMdFile() || this.boundFile;
    this.setBusy(true, "\u7EE7\u7EED\u81EA\u52A8\u53D1\u5E03\u2026");
    try {
      await this.refreshStatusForActiveNote({ quiet: true });
      const rec = file ? this.getRecordFor(file) : null;
      if (!rec?.runId && !this.currentTask) {
        new import_obsidian3.Notice("\u5F53\u524D\u6587\u7AE0\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\uFF0C\u8BF7\u5148\u53D1\u5E03");
        return;
      }
      await this.advanceUntilDone({ maxSteps: 24, file });
    } finally {
      this.setBusy(false);
      await this.refreshStatusForActiveNote({ quiet: true });
    }
  }
  async advanceUntilDone(opts) {
    const maxSteps = opts?.maxSteps ?? 24;
    const file = opts?.file ?? this.boundFile;
    const autoReviewPass = this.settings.reviewPolicy === "trust_user";
    for (let i = 0; i < maxSteps; i++) {
      await this.refreshStatusForActiveNote({ quiet: true });
      const task = this.currentTask;
      if (!task) {
        this.panelLog("\u8BFB\u4E0D\u5230\u4EFB\u52A1\u72B6\u6001\u3002", "error");
        new import_obsidian3.Notice("\u8BFB\u4E0D\u5230\u4EFB\u52A1\u72B6\u6001");
        return;
      }
      if (isTaskComplete(task)) {
        if (file) await this.savePublishedRecord(file, task);
        this.panelLog("");
        new import_obsidian3.Notice("\u53D1\u5E03\u5B8C\u6210\uFF01\u8BF7\u5230\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1\u786E\u8BA4");
        this.renderPanel();
        return;
      }
      const next = task.next_action;
      if (!next) {
        this.panelLog("\u6CA1\u6709\u4E0B\u4E00\u6B65\u4E86\uFF0C\u4F46\u4EFB\u52A1\u672A\u5B8C\u6210\u3002", "error");
        return;
      }
      const mode = canAutoAdvance(next, { autoReviewPass });
      if (mode === "stop") {
        if (next.action === "complete" || next.executor === "complete") {
          if (file) await this.savePublishedRecord(file, task);
          this.panelLog("");
          new import_obsidian3.Notice("\u53D1\u5E03\u5B8C\u6210\uFF01\u8BF7\u5230\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1\u786E\u8BA4");
          this.renderPanel();
          return;
        }
        const msg = friendlyStopMessage(next);
        this.panelLog(msg, "error");
        new import_obsidian3.Notice(msg.slice(0, 80));
        return;
      }
      if (mode === "auto-review") {
        this.panelLog("\u81EA\u52A8\u786E\u8BA4\u5185\u5BB9\u2026");
        const statePath = this.getRecordFor(file)?.statePath || task.summary?.state_path || next.params?.state_path;
        if (!statePath) {
          this.panelLog("\u65E0\u6CD5\u81EA\u52A8\u5BA1\u6838\uFF1A\u7F3A\u5C11\u4EFB\u52A1\u8DEF\u5F84\u3002", "error");
          return;
        }
        const result2 = await runCli(
          this.settings,
          ["review", "--state", statePath, "--status", "passed", ...workspaceArgs(this.settings)],
          { timeoutMs: 6e4 }
        );
        if (!result2.ok) {
          this.panelLog(this.shortErr(result2.combined) || "\u81EA\u52A8\u5BA1\u6838\u5931\u8D25", "error");
          return;
        }
        continue;
      }
      const stepName = actionLabel(next.action);
      this.panelLog(`\u6B63\u5728${stepName}\u2026`);
      this.renderPanel();
      const result = await runSuggestedCommand(this.settings, next.command, {
        timeoutMs: 3e5
      });
      if (!result.ok) {
        this.panelLog(this.shortErr(result.combined) || `${stepName}\u5931\u8D25`, "error");
        new import_obsidian3.Notice(`${stepName}\u5931\u8D25`);
        await this.refreshStatusForActiveNote({ quiet: true });
        return;
      }
    }
    await this.refreshStatusForActiveNote({ quiet: true });
    if (isTaskComplete(this.currentTask) && file && this.currentTask) {
      await this.savePublishedRecord(file, this.currentTask);
      this.panelLog("");
      new import_obsidian3.Notice("\u53D1\u5E03\u5B8C\u6210\uFF01\u8BF7\u5230\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1\u786E\u8BA4");
    } else {
      this.panelLog("\u6B65\u9AA4\u8F83\u591A\u5DF2\u6682\u505C\uFF0C\u8BF7\u518D\u70B9\u4E00\u6B21\u53D1\u5E03\u6309\u94AE\u7EE7\u7EED\u3002", "error");
      new import_obsidian3.Notice("\u8BF7\u518D\u70B9\u4E00\u6B21\u53D1\u5E03\u6309\u94AE\u7EE7\u7EED");
    }
    this.renderPanel();
  }
  async savePublishedRecord(file, task) {
    if (this.boundFile && this.boundFile.path !== file.path) {
      console.warn("[zzhub] skip savePublishedRecord: bound file mismatch");
      return;
    }
    const runId = task.summary?.run_id || this.getRecordFor(file)?.runId || "";
    const statePath = task.summary?.state_path || this.getRecordFor(file)?.statePath;
    const account = task.summary?.route?.account || this.settings.defaultAccount;
    const platform = task.summary?.route?.primary?.startsWith("wechat") ? "wechat" : task.summary?.route?.primary || "wechat";
    const results = task.summary?.publish?.results ?? [];
    const ok = results.find(
      (r) => r.status === "success" || r.status === "ok" || r.status === "done"
    );
    const draftId = (ok?.external_id || "").trim();
    const title = displayTitleFromCache(
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      file.basename
    );
    this.upsertRecord(file.path, {
      runId,
      statePath,
      published: true,
      publishedAt: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
      platform,
      account,
      title,
      draftId: draftId || this.getRecordFor(file)?.draftId,
      sourceNotePath: file.path
    });
    await this.saveSettings();
  }
  shortErr(raw) {
    const t = raw.trim();
    if (!t) return "";
    if (/40164|IP|whitelist/i.test(t)) {
      return "\u516C\u4F17\u53F7 IP \u767D\u540D\u5355\u672A\u914D\u7F6E\u6216\u5DF2\u5931\u6548\uFF0C\u8BF7\u5728\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u66F4\u65B0\u672C\u673A IP\u3002";
    }
    if (/invalid credential|40001|40125|appsecret/i.test(t)) {
      return "\u516C\u4F17\u53F7 AppID/AppSecret \u6709\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u53D1\u5E03\u5DE5\u5177\u914D\u7F6E\u3002";
    }
    if (/ENOENT|not found|spawn/i.test(t)) {
      return "\u627E\u4E0D\u5230\u53D1\u5E03\u5DE5\u5177\uFF0C\u8BF7\u5B89\u88C5\u6216\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u8DEF\u5F84\u3002";
    }
    const lines = t.split("\n").filter((l) => l.trim());
    return lines.slice(-4).join("\n").slice(0, 600);
  }
  async enqueueCurrentNote(opts) {
    const file = opts?.file || this.activeMdFile();
    if (!file) {
      new import_obsidian3.Notice("\u8BF7\u5148\u6253\u5F00\u8981\u53D1\u5E03\u7684 Markdown \u6587\u7AE0");
      this.panelLog("\u8BF7\u5148\u6253\u5F00\u4E00\u7BC7 .md \u6587\u7AE0\u3002", "error");
      return false;
    }
    try {
      this.panelLog(`\u51C6\u5907\u53D1\u5E03\u300A${file.basename}\u300B\u2026`);
      const raw = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter ?? {};
      const rec = this.getRecordFor(file);
      const title = resolveNoteTitle(frontmatter, raw, file.basename);
      const bodyPath = this.absolutePathForFile(file);
      let account = this.settings.defaultAccount;
      if (rec?.account) account = rec.account;
      else if (typeof frontmatter.zzhub_account === "string") account = frontmatter.zzhub_account;
      else if (typeof frontmatter.account === "string") account = frontmatter.account;
      const isRepublish = !!rec?.published;
      const intentText = typeof frontmatter.zzhub_intent === "string" && frontmatter.zzhub_intent || (isRepublish ? `\u91CD\u65B0\u53D1\u5E03\u5230\u5FAE\u4FE1\u516C\u4F17\u53F7\uFF08\u8D26\u53F7 ${account}\uFF09\uFF1A${title}` : `\u53D1\u5E03\u5230\u5FAE\u4FE1\u516C\u4F17\u53F7\uFF08\u8D26\u53F7 ${account}\uFF09\uFF1A${title}`);
      const payload = buildWorkflowHandoffPayload(this.settings, {
        bodyPath,
        title,
        account,
        intentText
      });
      if (rec?.draftId) {
        const wh = payload.workflow_handoff;
        wh.explicit_constraints = [
          ...wh.explicit_constraints || [],
          `existing_draft_media_id=${rec.draftId}`
        ];
      }
      const handoffPath = await writeHandoffFile(payload);
      const args = ["ingest-handoff", "--file", handoffPath, ...workspaceArgs(this.settings)];
      this.panelLog(isRepublish ? "\u6B63\u5728\u521B\u5EFA\u91CD\u65B0\u53D1\u5E03\u4EFB\u52A1\u2026" : "\u6B63\u5728\u521B\u5EFA\u53D1\u5E03\u4EFB\u52A1\u2026");
      const result = await runCli(this.settings, args, { timeoutMs: 12e4 });
      if (!result.ok) {
        this.panelLog(this.shortErr(result.combined) || "\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25", "error");
        new import_obsidian3.Notice("\u521B\u5EFA\u53D1\u5E03\u4EFB\u52A1\u5931\u8D25");
        return false;
      }
      let statePath = "";
      let runId = "";
      try {
        const parsed = parseJsonFromOutput(result.stdout || result.combined);
        const accepted = parsed.accepted_handoff;
        const summary = parsed.summary;
        statePath = String(
          accepted?.state_path || summary?.state_path || parsed.state_path || ""
        );
        runId = String(accepted?.run_id || summary?.run_id || parsed.run_id || "");
        if (summary && parsed.next_action) {
          this.setCurrentTask(parsed, file.path);
        }
      } catch {
        const mState = result.combined.match(/"state_path"\s*:\s*"([^"]+)"/);
        const mRun = result.combined.match(/"run_id"\s*:\s*"([^"]+)"/);
        if (mState) statePath = mState[1];
        if (mRun) runId = mRun[1];
      }
      this.upsertRecord(file.path, {
        runId: runId || "",
        statePath: statePath || void 0,
        published: false,
        platform: "wechat",
        account,
        title,
        draftId: rec?.draftId,
        sourceNotePath: file.path
      });
      await this.saveSettings();
      if (!opts?.quietNotice) {
        new import_obsidian3.Notice(`\u5DF2\u521B\u5EFA\u53D1\u5E03\u4EFB\u52A1\uFF1A${title}`);
      }
      this.panelLog(`\u4EFB\u52A1\u5DF2\u521B\u5EFA\uFF1A${title}`);
      await this.refreshStatusForActiveNote({ quiet: true });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.panelLog(msg, "error");
      new import_obsidian3.Notice(msg);
      return false;
    }
  }
  /**
   * 只查询「当前打开笔记」绑定的任务；无绑定则清空。
   * 注意：刷新时绝不给当前笔记「自动盖已发布章」（那是串台元凶）。
   */
  async refreshStatusForActiveNote(opts) {
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
      const result = await runCli(this.settings, args, { timeoutMs: 6e4 });
      if (seq !== this.refreshSeq) return;
      if (this.activeMdFile()?.path !== notePath) return;
      if (!result.ok) {
        this.setCurrentTask(null, null);
        this.renderPanel();
        if (!opts?.quiet && !rec.published) {
          this.panelLog(this.shortErr(result.combined) || "\u8BFB\u53D6\u4EFB\u52A1\u5931\u8D25", "error");
        } else {
          this.panelLog("");
        }
        return;
      }
      const task = parseJsonFromOutput(result.stdout || result.combined);
      if (seq !== this.refreshSeq) return;
      if (this.activeMdFile()?.path !== notePath) return;
      if (rec.runId && task.summary?.run_id && task.summary.run_id !== rec.runId) {
        this.setCurrentTask(null, null);
        this.renderPanel();
        return;
      }
      const taskTitle = task.summary?.metadata?.title || "";
      const base = file.basename;
      if (taskTitle && taskTitle !== base && !taskTitle.includes(base) && !base.includes(taskTitle) && rec.statePath?.includes("test-ob-zzhub") && !notePath.includes("test-ob-zzhub")) {
        delete this.settings.notes[notePath];
        await this.saveSettings();
        this.setCurrentTask(null, null);
        this.renderPanel();
        if (!opts?.quiet) this.panelLog("\u5DF2\u6E05\u9664\u4E0E\u5F53\u524D\u7B14\u8BB0\u4E0D\u5339\u914D\u7684\u65E7\u53D1\u5E03\u8BB0\u5F55", "ok");
        return;
      }
      this.setCurrentTask(task, notePath);
      if (task.summary?.state_path && task.summary.state_path !== rec.statePath) {
        this.upsertRecord(notePath, {
          statePath: task.summary.state_path,
          sourceNotePath: notePath
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
  async runDoctor(opts) {
    if (!opts?.fromSettings) {
      this.panelLog("\u6B63\u5728\u68C0\u67E5\u73AF\u5883\u2026");
    }
    this.cliProbe = await probeCli(this.settings);
    if (!this.cliProbe.ok) {
      this.getPanel()?.showEnvNotReady();
      if (!opts?.fromSettings) {
        this.panelLog("\u73AF\u5883\u672A\u5C31\u7EEA", "error");
        new import_obsidian3.Notice("\u73AF\u5883\u672A\u5C31\u7EEA\uFF0C\u8BF7\u5230\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u68C0\u6D4B/\u5B89\u88C5");
      }
      this.renderPanel();
      return;
    }
    this.getPanel()?.hideEnvNotReady();
    try {
      await this.refreshPipelineAccounts();
    } catch {
    }
    const result = await runCli(
      this.settings,
      ["doctor", ...workspaceArgs(this.settings)],
      { timeoutMs: 6e4 }
    );
    if (result.ok) {
      if (!opts?.fromSettings) {
        this.panelLog("\u73AF\u5883\u6B63\u5E38", "ok");
      }
      new import_obsidian3.Notice("\u73AF\u5883\u6B63\u5E38\uFF0C\u53EF\u4EE5\u53D1\u5E03");
    } else {
      if (!opts?.fromSettings) {
        this.panelLog(this.shortErr(result.combined) || "\u73AF\u5883\u68C0\u67E5\u672A\u901A\u8FC7", "error");
      }
      new import_obsidian3.Notice("\u73AF\u5883\u68C0\u67E5\u6709\u95EE\u9898\uFF0C\u8BF7\u5230\u8BBE\u7F6E\u4E2D\u67E5\u770B");
    }
    this.renderPanel();
  }
  /**
   * 自动安装 @zzclub/pipeline（需 bun 或 npm）。
   * 返回是否安装成功且 probe 通过。
   */
  async installCli(onLog) {
    const log = onLog || ((line) => this.panelLog(line));
    log("\u5F00\u59CB\u5B89\u88C5\u53D1\u5E03\u5DE5\u5177\u2026");
    const result = await installPipelineCli(this.settings, log);
    if (!result.ok) {
      log(result.output || "\u5B89\u88C5\u5931\u8D25");
      new import_obsidian3.Notice("\u81EA\u52A8\u5B89\u88C5\u5931\u8D25");
      this.cliProbe = await probeCli(this.settings);
      this.renderPanel();
      return false;
    }
    log("\u5B89\u88C5\u547D\u4EE4\u5B8C\u6210\uFF0C\u6B63\u5728\u68C0\u6D4B\u2026");
    if (!this.settings.cliPath) {
    }
    this.cliProbe = await probeCli(this.settings);
    if (this.cliProbe.ok) {
      if (this.cliProbe.path.includes("/")) {
        this.settings.cliPath = this.cliProbe.path;
        await this.saveSettings();
      }
      log(`\u5B89\u88C5\u6210\u529F\uFF1A${this.cliProbe.path}`);
      this.renderPanel();
      return true;
    }
    log("\u5B89\u88C5\u540E\u4ECD\u68C0\u6D4B\u4E0D\u5230\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u300C\u53D1\u5E03\u5DE5\u5177\u8DEF\u5F84\u300D");
    this.renderPanel();
    return false;
  }
};
