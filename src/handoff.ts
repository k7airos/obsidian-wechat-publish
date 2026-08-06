import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { ZzhubSettings } from "./types";

export interface HandoffDraft {
  bodyPath: string;
  title: string;
  account: string;
  intentText: string;
  contentForm?: "article" | "newspic";
  authoringPolicy?: ZzhubSettings["authoringPolicy"];
  reviewPolicy?: ZzhubSettings["reviewPolicy"];
}

/**
 * Build workflow_handoff for an already-written Obsidian note.
 * Aligns with main-branch ingest-handoff schema.
 */
export function buildWorkflowHandoffPayload(
  settings: ZzhubSettings,
  draft: HandoffDraft,
): Record<string, unknown> {
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
      research_policy: "skip",
    },
  };
}

export async function writeHandoffFile(payload: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "zzhub-ob-"));
  const file = join(dir, "handoff.json");
  await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

/**
 * 展示/发布用标题：
 * 1. frontmatter 的 title / 标题
 * 2. 文件名（不含 .md）
 * （不再用正文 H1，避免和文件意图不一致）
 */
export function resolveNoteTitle(
  frontmatter: Record<string, unknown> | undefined,
  _body: string,
  basename: string,
): string {
  const fm = frontmatter ?? {};
  for (const key of ["title", "标题", "Title"]) {
    const v = fm[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return basename.replace(/\.md$/i, "");
}

/** 仅从 metadata cache 取展示标题（面板用） */
export function displayTitleFromCache(
  frontmatter: Record<string, unknown> | undefined | null,
  basename: string,
): string {
  return resolveNoteTitle(frontmatter ?? undefined, "", basename);
}
