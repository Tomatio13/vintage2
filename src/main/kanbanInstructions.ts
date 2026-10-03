import { dirname, join } from "node:path";
import type { KanbanCard } from "../shared/kanban.js";

export function kanbanInstructions(
  directory: string,
  workspace: string,
  card?: KanbanCard,
): string {
  const command = `python3 ${quote(join(dirname(directory), "update-card.py"))} --board ${quote(join(directory, "kanban.json"))}`;
  return `作業場所: ${JSON.stringify(workspace)}
Board: ${JSON.stringify(join(directory, "kanban.json"))}
${card ? `カードID ${JSON.stringify(card.id)}（${JSON.stringify(card.title)}）のnotesをプロンプトとして実行してください。` : "todoの全カードを順に処理し、各カードのnotesをプロンプトとして実行してください。"}
最新のnotesを読み、開始時はdoing、完了・検証後はdoneにして、結果をnotesに追記してください。他のカードと既存メモは保持してください。
参照:
${command} --read${card ? ` --card ${quote(card.id)}` : ""}
更新（--statusと--noteを適宜変更、ロック処理は自動）:
${command} --card ${quote(card?.id ?? "CARD_ID")} --status doing --note '進捗'
`;
}

function quote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
