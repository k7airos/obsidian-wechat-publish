/**
 * 面向最终用户的中文文案（隐藏 pipeline 内部术语）。
 */

import type { AgentTaskShape, TaskNextAction } from "./types";

/** 阶段：prepare / render / publish */
export function phaseLabel(phase?: string | null): string {
  switch (phase) {
    case "prepare":
      return "准备文章";
    case "render":
      return "生成封面/配图";
    case "publish":
      return "提交发布";
    case "idle":
    case "done":
      return "已完成";
    default:
      return phase ? `处理中（${phase}）` : "未知";
  }
}

export function phaseStatusLabel(status?: string | null): string {
  switch (status) {
    case "pending":
      return "等待中";
    case "running":
    case "in_progress":
      return "进行中";
    case "done":
    case "completed":
      return "已完成";
    case "failed":
    case "error":
      return "失败";
    case "skipped":
      return "已跳过";
    default:
      return status || "-";
  }
}

export function modeLabel(mode?: string | null): string {
  switch (mode) {
    case "active":
    case "handoff":
      return "进行中";
    case "done":
      return "已完成";
    case "abandoned":
      return "已取消";
    case "blocked":
      return "已卡住";
    default:
      return mode || "-";
  }
}

/** 兜底：无 pipeline 缓存时只显示配置键 */
export function accountLabel(account?: string | null): string {
  if (!account) return "未选择账号";
  return account;
}

export function routeLabel(route?: string | null): string {
  switch (route) {
    case "wechat":
    case "wechat-article":
      return "微信公众号";
    case "wechat-newspic":
      return "公众号图片消息";
    case "blog":
      return "博客";
    default:
      return route || "未指定";
  }
}

export function reviewLabel(status?: string | null): string {
  switch (status) {
    case "passed":
      return "已通过";
    case "needs_revision":
      return "需修改";
    case "pending":
    case null:
    case undefined:
    case "":
      return "待确认";
    default:
      return status;
  }
}

/** next_action.action → 人话 */
export function actionLabel(action?: string | null): string {
  switch (action) {
    case "prepare":
      return "整理正文与元数据";
    case "prepare-finalize":
      return "生成封面关键词等";
    case "render":
      return "渲染封面/配图";
    case "publish":
      return "提交到公众号草稿箱";
    case "review-content":
      return "内容审核";
    case "revise-content":
      return "根据意见修改正文";
    case "attach-body":
      return "补充正文";
    case "attach-body-images":
      return "补充正文配图";
    case "complete":
      return "全部完成";
    case "reset-or-repair":
      return "修复任务";
    case "await-render-client":
      return "等待远程渲染";
    default:
      return action ? `执行：${action}` : "等待中";
  }
}

export function actionProgressLine(action?: string | null): string {
  switch (action) {
    case "prepare":
    case "prepare-finalize":
      return "① 准备文章";
    case "render":
    case "await-render-client":
      return "② 生成封面";
    case "publish":
      return "③ 提交公众号";
    case "complete":
      return "✓ 已完成";
    case "review-content":
      return "内容确认";
    default:
      return actionLabel(action);
  }
}

export function executorHint(executor?: string | null): string {
  switch (executor) {
    case "cli":
      return "可自动执行";
    case "worker":
      return "需要写作/审核助手";
    case "await-input":
      return "需要你补充材料";
    case "repair":
      return "需要修复";
    case "complete":
    case "none":
      return "";
    default:
      return executor || "";
  }
}

export function publishResultsLabel(
  results?: Array<{ route?: string; status?: string }> | null,
): string {
  if (!results || results.length === 0) return "尚未提交";
  return results
    .map((r) => {
      const name = routeLabel(r.route);
      const st =
        r.status === "success" || r.status === "ok" || r.status === "done"
          ? "成功"
          : r.status === "failed" || r.status === "error"
            ? "失败"
            : r.status || "未知";
      return `${name}：${st}`;
    })
    .join("；");
}

export function isTaskComplete(task: AgentTaskShape | null | undefined): boolean {
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

/** 是否插件可自动处理（含自动点「审核通过」） */
export function canAutoAdvance(
  next: TaskNextAction | undefined,
  opts: { autoReviewPass: boolean },
): "cli" | "auto-review" | "stop" {
  if (!next) return "stop";
  if (next.action === "complete" || next.executor === "complete") return "stop";
  if (next.executor === "cli" && next.command) return "cli";
  if (
    opts.autoReviewPass &&
    (next.action === "review-content" || next.action === "review")
  ) {
    return "auto-review";
  }
  return "stop";
}

export function friendlyStopMessage(next: TaskNextAction): string {
  const name = actionLabel(next.action);
  switch (next.executor) {
    case "await-input":
      return `需要你补充材料后才能继续：${name}。${next.reason || ""}`.trim();
    case "worker":
      if (next.action === "revise-content") {
        return `正文需要修改：${next.params?.feedback || next.reason || "请按审核意见改稿后再发"}`;
      }
      if (next.action === "attach-body") {
        return "还没有正文，请在笔记里写好内容后再点一键发布。";
      }
      return `当前步骤「${name}」需要人工处理。${next.reason || ""}`.trim();
    case "repair":
      return `任务异常，需要修复：${next.reason || name}`;
    default:
      return `无法自动完成「${name}」。${next.reason || ""}`.trim();
  }
}

/** 简化后的状态摘要，给面板用 */
export function buildUserSummary(task: AgentTaskShape): {
  title: string;
  statusLine: string;
  progress: string;
  account: string;
  target: string;
  nextLine: string;
  resultLine: string;
  issues: string[];
} {
  const s = task.summary;
  const next = task.next_action;
  const complete = isTaskComplete(task);

  const progressParts = [
    `准备 ${phaseStatusLabel(s?.phase?.prepare)}`,
    `封面 ${phaseStatusLabel(s?.phase?.render)}`,
    `发布 ${phaseStatusLabel(s?.phase?.publish)}`,
  ];

  let nextLine = "—";
  if (complete) nextLine = "已完成，可到公众号后台草稿箱查看";
  else if (next) nextLine = `${actionLabel(next.action)}${executorHint(next.executor) ? `（${executorHint(next.executor)}）` : ""}`;

  const issues: string[] = [];
  for (const b of task.blockers ?? []) {
    if (b.message) issues.push(b.message);
  }
  for (const g of task.gaps ?? []) {
    if (g.message) issues.push(g.message);
  }

  return {
    title: s?.metadata?.title || "未命名文章",
    statusLine: complete ? "已完成" : modeLabel(s?.mode),
    progress: progressParts.join("  ·  "),
    account: accountLabel(s?.route?.account),
    target: routeLabel(s?.route?.primary),
    nextLine,
    resultLine: publishResultsLabel(s?.publish?.results),
    issues,
  };
}
