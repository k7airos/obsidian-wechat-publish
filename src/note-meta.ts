/**
 * 发布记录存在插件 data.json 的 notes 映射里，不写进笔记 frontmatter。
 * key = vault 相对路径（TFile.path）
 */

export interface NotePublishRecord {
  runId: string;
  statePath?: string;
  published: boolean;
  platform: string;
  publishedAt?: string;
  /** 当前笔记标题（发布时缓存，仅作展示） */
  title?: string;
  account?: string;
  draftId?: string;
  /**
   * 创建任务时的笔记路径。用于校验：禁止 A 笔记挂上 B 笔记的任务。
   * 必须与 map key 一致才可信。
   */
  sourceNotePath?: string;
}

export type NotesIndex = Record<string, NotePublishRecord>;

export function getNoteRecord(
  notes: NotesIndex | undefined,
  path: string,
): NotePublishRecord | null {
  if (!notes || !path) return null;
  const rec = notes[path];
  if (!rec) return null;
  // 路径对不上 → 当作无效脏数据
  if (rec.sourceNotePath && rec.sourceNotePath !== path) return null;
  return rec;
}

/** 从 pipeline statePath 抽出帖子目录名 */
export function folderFromStatePath(statePath?: string): string | null {
  if (!statePath) return null;
  const m = statePath.match(/[/\\]posts[/\\][^/\\]+[/\\]([^/\\]+)[/\\]/);
  return m?.[1] ?? null;
}

/**
 * 记录是否与笔记路径一致。
 * 避免「测试文章」的 state 被挂到别的 md 上。
 */
export function isRecordBelongsToNote(path: string, rec: NotePublishRecord): boolean {
  if (rec.sourceNotePath && rec.sourceNotePath !== path) return false;

  const base = path.replace(/\.md$/i, "").split("/").pop() || "";
  if (!base) return false;

  const folder = folderFromStatePath(rec.statePath);
  if (folder) {
    const norm = (s: string) => s.toLowerCase().replace(/-v\d+$/i, "");
    const f = norm(folder);
    const b = norm(base);
    // 目录名与文件名毫无包含关系 → 脏数据
    if (!f.includes(b) && !b.includes(f) && f !== b) {
      return false;
    }
  }

  // 若缓存了 title 且是别的测试文，也剔除（弱校验）
  if (rec.title && rec.title !== base) {
    const t = rec.title.toLowerCase();
    const b = base.toLowerCase();
    if (!t.includes(b) && !b.includes(t) && rec.statePath?.includes("test-ob-zzhub")) {
      return false;
    }
  }

  return true;
}

/** 清洗 notes 索引，去掉串台/脏数据 */
export function sanitizeNotesIndex(notes: NotesIndex | undefined): {
  notes: NotesIndex;
  removed: string[];
} {
  const input = notes || {};
  const out: NotesIndex = {};
  const removed: string[] = [];

  // 同一 runId 只保留 sourceNotePath 匹配且 belongs 的一条；优先 key 与 source 一致
  const byRun = new Map<string, string[]>();
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
    // 多条挂同一 runId：只留最像「源笔记」的一条
    let keep = valid.find((p) => input[p].sourceNotePath === p) || valid[0];
    if (valid.length > 1) {
      // 优先 statePath 目录名贴近文件名
      keep =
        valid.find((p) => {
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

export function migrateFromFrontmatter(
  frontmatter: Record<string, unknown> | undefined | null,
): NotePublishRecord | null {
  if (!frontmatter) return null;
  const runId =
    typeof frontmatter.zzhub_run_id === "string" ? frontmatter.zzhub_run_id.trim() : "";
  const publishedRaw = frontmatter.zzhub_published;
  const published =
    publishedRaw === true ||
    publishedRaw === "true" ||
    publishedRaw === 1 ||
    publishedRaw === "1";
  if (!runId && !published) return null;

  return {
    runId,
    statePath:
      typeof frontmatter.zzhub_state_path === "string"
        ? frontmatter.zzhub_state_path.trim()
        : undefined,
    published,
    platform: "wechat",
    publishedAt:
      typeof frontmatter.zzhub_published_at === "string"
        ? frontmatter.zzhub_published_at
        : undefined,
    account:
      typeof frontmatter.zzhub_account === "string"
        ? frontmatter.zzhub_account
        : undefined,
    draftId:
      typeof frontmatter.zzhub_draft_id === "string"
        ? frontmatter.zzhub_draft_id
        : undefined,
  };
}

export function stripLegacyFrontmatterKeys(fm: Record<string, unknown>): boolean {
  const keys = [
    "zzhub_run_id",
    "zzhub_state_path",
    "zzhub_published",
    "zzhub_published_at",
    "zzhub_draft_id",
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
