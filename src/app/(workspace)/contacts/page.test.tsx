import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "antd";

import ContactsPage from "./page";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("@/hooks/useApiData", () => ({
  useApiData: vi.fn().mockReturnValue({
    data: {
      items: [
        {
          id: "student-1",
          studentNo: "1001",
          name: "陈小明",
          guardians: [
            {
              id: "g-1",
              name: "陈先生",
              relationship: "父亲",
              phone: "13800138000",
              wechat: "chen_parent",
              workplace: "科技公司",
              isPrimary: true,
            },
          ],
        },
      ],
      meta: { total: 1 },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe("ContactsPage", () => {
  it("renders contact card with mobile call button and wechat copy button", () => {
    render(
      <App>
        <ContactsPage />
      </App>
    );

    // 1. Verify contact info
    expect(screen.getByText("陈先生")).toBeInTheDocument();
    expect(screen.getByText(/13800138000/)).toBeInTheDocument();

    // 2. Verify mobile-friendly call button with tel: protocol
    const callBtn = screen.getByRole("link", { name: "拨打陈先生的电话" });
    expect(callBtn).toBeInTheDocument();
    expect(callBtn).toHaveAttribute("href", "tel:13800138000");

    // 3. Verify copy wechat button
    const copyBtn = screen.getByRole("button", { name: /复制/ });
    expect(copyBtn).toBeInTheDocument();
  });
});
