import { spawn } from "child_process";
import { accessSync, constants } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";

import type { CliResult, ZzhubSettings } from "./types";

function existsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    try {
      accessSync(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/** Build PATH so Electron-launched Obsidian can see bun global bins. */
export function buildPath(settings: ZzhubSettings): string {
  const home = homedir();
  const extras = [
    settings.extraPath,
    join(home, ".bun", "bin"),
    join(home, ".local", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ]
    .filter(Boolean)
    .flatMap((p) => String(p).split(delimiter).filter(Boolean));

  const current = process.env.PATH ?? "";
  return [...extras, current].join(delimiter);
}

export function resolveCliPath(settings: ZzhubSettings): string {
  if (settings.cliPath.trim()) {
    return settings.cliPath.trim();
  }
  const home = homedir();
  const candidates = [
    join(home, ".bun", "bin", "zzhub-pipeline"),
    join(home, ".bun", "bin", "zzp"),
    join(home, ".local", "bin", "zzhub-pipeline"),
    "zzhub-pipeline",
    "zzp",
  ];
  for (const c of candidates) {
    if (c.includes("/") && existsExecutable(c)) {
      return c;
    }
  }
  return "zzhub-pipeline";
}

export interface CliProbe {
  ok: boolean;
  path: string;
  versionLine: string;
  error: string;
}

/** 探测 CLI 是否可用（能执行 --help）。 */
export async function probeCli(settings: ZzhubSettings): Promise<CliProbe> {
  const path = resolveCliPath(settings);
  if (path.includes("/") && !existsExecutable(path)) {
    return {
      ok: false,
      path,
      versionLine: "",
      error: "路径不存在或不可执行",
    };
  }
  const result = await runCli(settings, ["--help"], { timeoutMs: 15_000 });
  if (!result.ok && !/Usage:|Commands:/i.test(result.combined)) {
    return {
      ok: false,
      path,
      versionLine: "",
      error: result.stderr || result.combined || "无法启动发布工具",
    };
  }
  const ver = await runCli(settings, ["--version"], { timeoutMs: 10_000 });
  return {
    ok: true,
    path,
    versionLine: (ver.stdout || ver.combined || "").trim().slice(0, 120),
    error: "",
  };
}

/** 推荐的本机安装命令（优先 bun，与当前环境一致）。 */
export const INSTALL_COMMANDS = {
  bun: "bun add -g @zzclub/pipeline",
  npm: "npm install -g @zzclub/pipeline",
  note: "安装后请确保 ~/.bun/bin 或全局 npm bin 在 PATH 中，或在插件设置里填写绝对路径。",
  /** 先装 bun（无 bun/npm 时） */
  bunRuntimeMac: "curl -fsSL https://bun.sh/install | bash",
  bunRuntimeWin: 'powershell -c "irm bun.sh/install.ps1 | iex"',
} as const;

export type PackageManager = "bun" | "npm" | null;

/** 检测本机可用的包管理器（用于自动安装 CLI）。 */
export async function detectPackageManager(settings: ZzhubSettings): Promise<{
  manager: PackageManager;
  path: string;
}> {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildPath(settings) };
  const home = homedir();
  const bunCandidates = [join(home, ".bun", "bin", "bun"), "bun"];
  for (const b of bunCandidates) {
    if (b.includes("/") && !existsExecutable(b)) continue;
    const ok = await runShell(b, ["--version"], env, 8_000);
    if (ok.ok || /\d+\.\d+/.test(ok.combined)) {
      return { manager: "bun", path: b.includes("/") ? b : "bun" };
    }
  }
  const npmCandidates = ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "npm"];
  for (const n of npmCandidates) {
    if (n.includes("/") && !existsExecutable(n)) continue;
    const ok = await runShell(n, ["--version"], env, 8_000);
    if (ok.ok || /\d+\.\d+/.test(ok.combined)) {
      return { manager: "npm", path: n.includes("/") ? n : "npm" };
    }
  }
  return { manager: null, path: "" };
}

/**
 * 自动安装 @zzclub/pipeline 到全局。
 * 优先 bun，其次 npm。需要本机已装对应包管理器与网络。
 */
export async function installPipelineCli(
  settings: ZzhubSettings,
  onLog?: (line: string) => void,
): Promise<{ ok: boolean; command: string; output: string }> {
  const { manager, path } = await detectPackageManager(settings);
  if (!manager) {
    return {
      ok: false,
      command: "",
      output: "未检测到 bun 或 npm，无法自动安装。请先安装 bun（https://bun.sh）或 Node.js。",
    };
  }

  const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildPath(settings) };
  const args =
    manager === "bun"
      ? ["add", "-g", "@zzclub/pipeline"]
      : ["install", "-g", "@zzclub/pipeline"];
  const command = `${path} ${args.join(" ")}`;
  onLog?.(`执行：${command}`);

  const result = await runShell(path, args, env, 300_000, onLog);
  return {
    ok: result.ok || /zzhub-pipeline|@zzclub\/pipeline/.test(result.combined),
    command,
    output: result.combined.slice(0, 4000),
  };
}

function runShell(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onLog?: (line: string) => void,
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, shell: false });
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
        stderr: stderr + `\n[timeout ${timeoutMs}ms]`,
        combined: (stdout + "\n" + stderr).trim(),
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const s = chunk.toString();
      stdout += s;
      onLog?.(s.trimEnd());
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
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
        combined: `${stdout}\n${stderr}\n${err.message}`.trim(),
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
        combined: [stdout, stderr].filter(Boolean).join("\n").trim(),
      });
    });
  });
}

export function runCli(
  settings: ZzhubSettings,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
): Promise<CliResult> {
  const cli = resolveCliPath(settings);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: buildPath(settings),
  };
  if (settings.workspaceRoot.trim()) {
    env.ZZHUB_PIPELINE_WORKSPACE_ROOT = settings.workspaceRoot.trim();
  }

  return new Promise((resolve) => {
    const child = spawn(cli, args, {
      env,
      cwd: options?.cwd || settings.workspaceRoot.trim() || undefined,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (!settled) {
              child.kill("SIGTERM");
              settled = true;
              resolve({
                ok: false,
                code: null,
                stdout,
                stderr: stderr + `\n[timeout after ${options.timeoutMs}ms]`,
                combined: (stdout + "\n" + stderr).trim(),
              });
            }
          }, options.timeoutMs)
        : null;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
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
        stderr: `${stderr}\n${err.message}`.trim(),
        combined: `${stdout}\n${stderr}\n${err.message}`.trim(),
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
        combined: [stdout, stderr].filter(Boolean).join("\n").trim(),
      });
    });
  });
}

/**
 * Run a suggested command string from next_action.command.
 * Replaces leading zzhub-pipeline / zzp with the configured binary.
 */
export function runSuggestedCommand(
  settings: ZzhubSettings,
  command: string,
  options?: { timeoutMs?: number },
): Promise<CliResult> {
  const cli = resolveCliPath(settings);
  const trimmed = command.trim();
  // Prefer argv-style rewrite to keep quoting from the CLI intact via shell.
  const rewritten = trimmed.replace(/^(zzhub-pipeline|zzp)\b/, shellQuote(cli));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: buildPath(settings),
  };
  if (settings.workspaceRoot.trim()) {
    env.ZZHUB_PIPELINE_WORKSPACE_ROOT = settings.workspaceRoot.trim();
  }

  return new Promise((resolve) => {
    const child = spawn(rewritten, {
      env,
      cwd: settings.workspaceRoot.trim() || undefined,
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (!settled) {
              child.kill("SIGTERM");
              settled = true;
              resolve({
                ok: false,
                code: null,
                stdout,
                stderr: stderr + `\n[timeout after ${options.timeoutMs}ms]`,
                combined: (stdout + "\n" + stderr).trim(),
              });
            }
          }, options.timeoutMs)
        : null;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
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
        stderr: `${stderr}\n${err.message}`.trim(),
        combined: `${stdout}\n${stderr}\n${err.message}`.trim(),
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
        combined: [stdout, stderr].filter(Boolean).join("\n").trim(),
      });
    });
  });
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function workspaceArgs(settings: ZzhubSettings): string[] {
  const ws = settings.workspaceRoot.trim();
  return ws ? ["--workspace", ws] : [];
}

/** Parse JSON from CLI stdout (tolerates leading/trailing noise). */
export function parseJsonFromOutput<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const startArr = trimmed.indexOf("[");
    let i = -1;
    if (start >= 0 && (startArr < 0 || start < startArr)) i = start;
    else if (startArr >= 0) i = startArr;
    if (i < 0) throw new Error("CLI output is not JSON");
    const slice = trimmed.slice(i);
    return JSON.parse(slice) as T;
  }
}
