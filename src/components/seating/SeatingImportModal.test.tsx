import { App as AntApp } from "antd";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SeatingImportModal } from "./SeatingImportModal";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

describe("SeatingImportModal", () => {
  it("starts with import confirmation disabled until a file is previewed", () => {
    render(
      <AntApp>
        <SeatingImportModal open onCancel={vi.fn()} onApply={vi.fn()} />
      </AntApp>,
    );

    expect(screen.getByText("导入座位图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "载入编辑画布" })).toBeDisabled();
    expect(screen.getByText("支持 CSV、XLSX、XLS，单文件不超过 5 MB")).toBeInTheDocument();
  });
});
