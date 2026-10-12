import { dirname, join } from "node:path";
import type { KanbanCard } from "../shared/kanban.js";

export function kanbanInstructions(
  directory: string,
  workspace: string,
  card?: KanbanCard,
): string {
  return `作業場所: ${JSON.stringify(workspace)}
Board: ${JSON.stringify(join(directory, "kanban.json"))}
Agent Skill: ${JSON.stringify(join(dirname(directory), "skills", "vintage-board", "SKILL.md"))}（最初に読み、同梱PythonのSubtask操作を使用）
${card ? `カードID ${JSON.stringify(card.id)}（${JSON.stringify(card.title)}）のnotesをプロンプトとして実行してください。` : "todoの全カードを順に処理し、各カードのnotesをプロンプトとして実行してください。"}
最新のnotesを読み、開始時はdoing、完了・検証後はdoneにして、結果をnotesに追記してください。Subtaskは作業・検証後に完了更新してください。他のカード・既存メモ・優先度・期限・ラベル・無関係なSubtasksは保持してください。
`;
}
