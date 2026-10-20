import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ReviewHistory, layoutHistory } from "../src/renderer/components/ReviewHistory.js";
const commits = [
  {
    hash: "merge",
    parents: ["main", "feature"],
    subject: "Merge feature",
    author: "Test",
    date: "2026-10-20",
    refs: ["HEAD -> main"],
  },
  {
    hash: "feature",
    parents: ["root"],
    subject: "Feature work",
    author: "Test",
    date: "2026-10-20",
    refs: ["feature"],
  },
  {
    hash: "main",
    parents: ["root"],
    subject: "Main work",
    author: "Test",
    date: "2026-10-20",
    refs: [],
  },
  { hash: "root", parents: [], subject: "Initial", author: "Test", date: "2026-10-20", refs: [] },
];
it("connects both merge parents and rejoins the shared ancestor", () => {
  const rows = layoutHistory(commits);
  expect(rows[0]?.edges).toHaveLength(2);
  expect(rows[1]?.before).toEqual(["main", "feature"]);
  expect(rows[2]?.edges.map(({ to }) => to)).toEqual([0, 0]);
  expect(rows[3]?.edges).toEqual([]);
});
it("shows refs and lets the graph collapse", () => {
  render(<ReviewHistory commits={commits} currentBranch="main" />);
  expect(screen.getByText("HEAD -> main")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { expanded: true }));
  expect(screen.queryByText("Merge feature")).not.toBeInTheDocument();
});
