/**
 * 读取 / 更新 zzhub-pipeline 配置（多账号等），供设置页与面板展示。
 * 显示名优先用 config 里的 accounts.<id>.name。
 */

import { join } from "path";
import { homedir } from "os";

import { parseJsonFromOutput, runCli, type CliResult } from "./cli";
import type { ZzhubSettings } from "./types";

export interface PipelineWxAccount {
  /** 配置键，如 default / ancientone（稳定 id） */
  key: string;
  /** pipeline 配置中的显示名 name，可能为空 */
  name: string;
  appId: string;
  hasAppId: boolean;
  hasSecret: boolean;
  hasPat: boolean;
}

export interface PipelineWxSnapshot {
  ok: boolean;
  error: string;
  defaultAccount: string;
  accounts: PipelineWxAccount[];
  workspaceRoot: string;
  raw: Record<string, unknown> | null;
}

/**
 * 解析账号展示名。
 * 优先级：pipeline 的 name → 插件本地覆盖 → 配置键本身
 */
export function accountDisplayName(
  key: string | null | undefined,
  options?: {
    /** 来自 pipeline 的 name */
    pipelineName?: string | null;
    /** 插件本地覆盖（少用；改 name 应写回 pipeline） */
    overrides?: Record<string, string> | null;
    /** 账号列表（含 name），用于按 key 查找 */
    accounts?: PipelineWxAccount[] | null;
  },
): string {
  if (!key) return "未选择账号";
  const o = options?.overrides?.[key]?.trim();
  if (o) return o;
  const fromList = options?.accounts?.find((a) => a.key === key)?.name?.trim();
  if (fromList) return fromList;
  const p = options?.pipelineName?.trim();
  if (p) return p;
  return key;
}

export function maskAppId(appId: string): string {
  if (!appId) return "未填写";
  if (appId.length <= 8) return appId.slice(0, 2) + "***";
  return appId.slice(0, 6) + "…" + appId.slice(-4);
}

export async function loadPipelineWxSnapshot(
  settings: ZzhubSettings,
): Promise<PipelineWxSnapshot> {
  const result = await runCli(settings, ["config", "--export"], { timeoutMs: 20_000 });
  if (!result.ok && !result.stdout.trim().startsWith("{")) {
    return {
      ok: false,
      error: result.stderr || result.combined || "无法读取 pipeline 配置",
      defaultAccount: settings.defaultAccount || "default",
      accounts: [],
      workspaceRoot: settings.workspaceRoot || "",
      raw: null,
    };
  }

  try {
    const raw = parseJsonFromOutput<Record<string, unknown>>(result.stdout || result.combined);
    const wx = (raw.wx || {}) as Record<string, unknown>;
    const defaultAccount = String(wx.defaultAccount || settings.defaultAccount || "default");
    const accountsObj = (wx.accounts || {}) as Record<string, Record<string, unknown>>;
    const accounts: PipelineWxAccount[] = Object.keys(accountsObj)
      .sort((a, b) => {
        if (a === defaultAccount) return -1;
        if (b === defaultAccount) return 1;
        return a.localeCompare(b);
      })
      .map((key) => {
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
          hasPat,
        };
      });

    const paths = (raw.paths || {}) as Record<string, unknown>;
    const workspaceRoot = String(paths.workspaceRoot || settings.workspaceRoot || "");

    return {
      ok: true,
      error: "",
      defaultAccount,
      accounts,
      workspaceRoot,
      raw,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      defaultAccount: settings.defaultAccount || "default",
      accounts: [],
      workspaceRoot: settings.workspaceRoot || "",
      raw: null,
    };
  }
}

/** 将插件默认账号写回 pipeline 配置 */
export async function setPipelineDefaultAccount(
  settings: ZzhubSettings,
  accountKey: string,
): Promise<CliResult> {
  return runCli(
    settings,
    ["config", "--key", "wx.defaultAccount", "--value", accountKey],
    { timeoutMs: 15_000 },
  );
}

/** 写回账号显示名到 pipeline */
export async function setPipelineAccountName(
  settings: ZzhubSettings,
  accountKey: string,
  displayName: string,
): Promise<CliResult> {
  return runCli(
    settings,
    ["config", "--key", `wx.accounts.${accountKey}.name`, "--value", displayName],
    { timeoutMs: 15_000 },
  );
}

/** 配置文件可能路径（仅展示用） */
export function guessConfigPath(): string {
  return join(homedir(), "Library", "Application Support", "zzhub-pipeline", "config.json");
}
