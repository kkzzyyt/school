import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LedgerSheet } from "./LedgerSheet";

describe("LedgerSheet", () => {
  it("renders the editorial header, actions, metrics, content, and colophon", () => {
    render(
      <LedgerSheet
        kicker="STUDENT REGISTRY"
        title="学生花名册"
        description="统一维护学生基本信息。"
        actions={<button type="button">新增学生</button>}
        metrics={[
          { label: "REGISTRY // 在册", value: "36", unit: "人", detail: "当前班级" },
          { label: "AUDIT // 状态", value: "已同步", detail: "最近更新" },
        ]}
        footer={<span>SEC. A-01</span>}
      >
        <p>学生名录内容</p>
      </LedgerSheet>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "学生花名册" })).toBeInTheDocument();
    expect(screen.getByText(/ACADEMIC LEDGER · STUDENT REGISTRY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增学生" })).toBeInTheDocument();
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.getByText("人")).toBeInTheDocument();
    expect(screen.getByText("学生名录内容")).toBeInTheDocument();
    expect(screen.getByText("SEC. A-01")).toBeInTheDocument();
  });
});
