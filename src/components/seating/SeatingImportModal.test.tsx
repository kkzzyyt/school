import { App as AntApp } from "antd";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api";
import { SeatingImportModal } from "./SeatingImportModal";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

describe("SeatingImportModal", () => {
  it("starts with import confirmation disabled until a file is previewed", () => {
    render(
      <AntApp>
        <SeatingImportModal open onCancel={vi.fn()} onApply={vi.fn()} students={[]} />
      </AntApp>,
    );

    expect(screen.getByText("导入座位图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "载入编辑画布" })).toBeDisabled();
    expect(screen.getByText("支持 CSV、XLSX、PNG、JPEG、WebP，单文件不超过 5 MB")).toBeInTheDocument();
  });

  it("requires teacher review before loading recognized image seats", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      fileName: "seat.png",
      sourceType: "IMAGE",
      draft: {
        rows: 1,
        columns: 1,
        assignments: [{ studentId: "s-1", row: 1, column: 1 }],
        environment: {
          aisleAfterColumns: [],
          left: { windows: [], doorRows: [] },
          right: { windows: [], doorRows: [] },
          rear: { waterDispenser: null, airConditioner: null },
        },
        orientation: "FRONT_BOTTOM",
        issues: [],
      },
      matches: [{ sourceText: "张三", row: 1, column: 1, studentId: "s-1", status: "EXACT" }],
      issues: [],
      stats: { matched: 1, unmatched: 0, duplicate: 0, empty: 0, totalCells: 1 },
    });
    const onApply = vi.fn();
    render(
      <AntApp>
        <SeatingImportModal
          open
          onCancel={vi.fn()}
          onApply={onApply}
          students={[{ id: "s-1", name: "张三", studentNo: "001" }]}
        />
      </AntApp>,
    );

    fireEvent.change(document.querySelector("input[type=file]")!, {
      target: { files: [new File(["image"], "seat.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "识别并预览" }));
    expect(await screen.findByText("第 1 排第 1 座 · 张三")).toBeInTheDocument();
    const applyButton = screen.getByRole("button", { name: "载入编辑画布" });
    expect(applyButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "我已对照原图核对姓名、座位和讲台方向" }));
    expect(applyButton).toBeEnabled();
    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      assignments: [{ studentId: "s-1", row: 1, column: 1 }],
    }));
  });
});
