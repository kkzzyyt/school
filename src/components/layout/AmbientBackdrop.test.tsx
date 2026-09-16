import { render, cleanup, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AmbientBackdrop } from "./AmbientBackdrop";

describe("AmbientBackdrop Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders poster picture immediately for login variant", () => {
    const { container } = render(<AmbientBackdrop variant="login" />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/films/signal-poster.jpg");
    expect(img).toHaveClass("login-poster-backdrop");

    // 初始渲染时不应挂载 video
    const video = container.querySelector("video");
    expect(video).toBeNull();
  });

  it("renders poster picture immediately for workspace variant", () => {
    const { container } = render(<AmbientBackdrop variant="workspace" />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/films/colossus-poster.jpg");
    expect(img).toHaveClass("global-poster-backdrop");

    const video = container.querySelector("video");
    expect(video).toBeNull();
  });

  it("mounts video element after defer timer expires", () => {
    const { container } = render(<AmbientBackdrop variant="workspace" />);

    // 快进定时器
    act(() => {
      vi.advanceTimersByTime(700);
    });

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveClass("global-video-backdrop");
    const source = video?.querySelector("source");
    expect(source).toHaveAttribute("src", "/films/colossus.mp4");
  });
});
