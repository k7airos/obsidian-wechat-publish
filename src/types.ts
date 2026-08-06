import type { NotesIndex } from "./note-meta";

export interface ZzhubSettings {
  /** Absolute path to zzhub-pipeline / zzp executable. Empty = resolve from PATH. */
  cliPath: string;
  /** Pipeline workspace root. Empty = CLI config default. */
  workspaceRoot: string;
  /** Default wx account key, e.g. default | ancientone */
  defaultAccount: string;
  /** Comma-separated targets for new tasks, e.g. wechat */
  defaultTargets: string;
  /**
   * workflow_handoff.authoring_policy for current-note enqueue.
   * format_only is correct when the note body is already final.
   */
  authoringPolicy: "format_only" | "write" | "revise";
  /**
   * workflow_handoff.review_policy.
   * trust_user skips human/AI review gate for self-authored notes.
   */
  reviewPolicy: "trust_user" | "required";
  /** Extra PATH prefixes (colon-separated) so GUI Obsidian finds bun/node. */
  extraPath: string;
  /**
   * 按笔记路径记录发布状态（不写 frontmatter）。
   * key = TFile.path
   */
  notes: NotesIndex;
  /**
   * 打开笔记时若发现旧 zzhub_* frontmatter，导入后删除这些键。
   */
  stripLegacyFrontmatter: boolean;
  /**
   * 可选：本地覆盖显示名。正常应使用 pipeline 的 accounts.<id>.name。
   */
  accountLabels: Record<string, string>;
}

export const DEFAULT_SETTINGS: ZzhubSettings = {
  cliPath: "",
  workspaceRoot: "",
  defaultAccount: "default",
  defaultTargets: "wechat",
  authoringPolicy: "format_only",
  reviewPolicy: "trust_user",
  extraPath: "",
  notes: {},
  stripLegacyFrontmatter: true,
  accountLabels: {},
};

export interface TaskNextAction {
  action: string;
  reason: string;
  executor: "cli" | "worker" | "await-input" | "repair" | "complete" | "none" | string;
  command: string | null;
  params?: {
    state_path?: string;
    spawn?: boolean;
    feedback?: string | null;
    required_inputs?: string[];
    on_complete?: string;
    handoff_alt?: string;
    [key: string]: unknown;
  };
}

export interface AgentTaskShape {
  summary?: {
    run_id?: string;
    mode?: string;
    phase?: {
      current?: string;
      prepare?: string;
      render?: string;
      publish?: string;
    };
    state_path?: string;
    asset_path?: string | null;
    route?: {
      primary?: string;
      account?: string;
    };
    metadata?: {
      title?: string | null;
      slug?: string | null;
    };
    content_review?: {
      status?: string;
      feedback?: string | null;
    };
    publish?: {
      results?: Array<{
        route?: string;
        status?: string;
        account?: string;
        external_id?: string | null;
        detail?: string | null;
        published_at?: string | null;
      }>;
    };
  };
  gaps?: Array<{ code?: string; field?: string; message?: string }>;
  blockers?: Array<{ code?: string; field?: string; message?: string }>;
  next_action?: TaskNextAction;
}

export interface CliResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}
