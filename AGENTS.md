<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 默认协作模式

本仓库默认使用根目录 [RTK.md](RTK.md) 定义的 Codex 八角色协作协议。涉及代码修改时优先使用 Git worktree 隔离；只读检查或用户明确指定时可以使用当前工作区。保留本文件上方的 Next.js 规则。

@RTK.md
