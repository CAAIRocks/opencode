import type { Plugin, WebContributions, WebExtensionContext } from "@opencode-ai/plugin"

type Bookmark = {
  path: string
  label: string
}

type MessageLike = {
  role?: string
  tokens?: {
    input?: number
    output?: number
  }
}

type DiffLike = {
  file?: string
  status?: string
}

const toMessage = (value: unknown): MessageLike => {
  if (typeof value !== "object" || value === null) return {}
  return value as MessageLike
}

const toDiff = (value: unknown): DiffLike => {
  if (typeof value !== "object" || value === null) return {}
  return value as DiffLike
}

const fileName = (path: string) => path.split("/").pop() || path

const statusPrefix = (status?: string) => {
  if (status === "added") return "+"
  if (status === "deleted") return "-"
  return "~"
}

const ExampleWebExtension: Plugin = async () => {
  const bookmarks: Bookmark[] = []

  return {
    "web.init": async (ctx: WebExtensionContext): Promise<WebContributions> => {
      ctx.onEvent("file.changed", (event: unknown) => {
        if (typeof event !== "object" || event === null) return
        const path = (event as { properties?: { path?: unknown } }).properties?.path
        if (typeof path !== "string") return
        if (bookmarks.some((bookmark) => bookmark.path === path)) return
        bookmarks.push({ path, label: fileName(path) })
      })

      return {
        tabs: [
          {
            id: "metrics",
            label: "Metrics",
            icon: "chart",
            order: 10,
            component: () => {
              const messages = ctx.messages().map(toMessage)
              const totalTokens = messages.reduce((sum, message) => {
                if (message.role !== "assistant" || !message.tokens) return sum
                return sum + (message.tokens.input ?? 0) + (message.tokens.output ?? 0)
              }, 0)

              const div = document.createElement("div")
              div.className = "p-4 space-y-4"
              div.innerHTML = `
                <h3 class="text-14-medium text-text-strong">Session Metrics</h3>
                <div class="space-y-2">
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Total Messages</span>
                    <span class="text-text-base">${messages.length}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Total Tokens</span>
                    <span class="text-text-base">${totalTokens.toLocaleString()}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Working Directory</span>
                    <span class="text-text-base font-mono text-11-regular">${ctx.directory()}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">File Changes</span>
                    <span class="text-text-base">${ctx.diffs().length}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Providers</span>
                    <span class="text-text-base">${ctx.providers().length}</span>
                  </div>
                </div>
              `
              return div
            },
          },
        ],

        toolbarButtons: [
          {
            id: "deploy",
            label: "Deploy",
            icon: "rocket",
            order: 10,
            onClick: () => {
              if (!ctx.session()) return
              ctx.command.trigger("session.new")
            },
          },
        ],

        statusBarItems: [
          {
            id: "ci-status",
            label: "CI Status",
            order: 10,
            healthy: () => true,
            component: () => {
              const div = document.createElement("div")
              div.className = "flex items-center gap-2 w-full px-2 py-1"
              div.innerHTML = `
                <div class="size-1.5 rounded-full shrink-0 bg-icon-success-base"></div>
                <span class="text-14-regular text-text-base">CI Pipeline: Passing</span>
              `
              return div
            },
          },
        ],

        sidebarWidgets: [
          {
            id: "bookmarks",
            label: "Bookmarks",
            order: 10,
            component: () => {
              const diffs = ctx.diffs().map(toDiff)
              const div = document.createElement("div")
              div.className = "px-2 py-2 space-y-1"

              if (diffs.length === 0) {
                div.innerHTML = `<span class="text-12-regular text-text-weak">No file changes yet</span>`
                return div
              }

              div.innerHTML = `
                <div class="text-12-medium text-text-base mb-1">Recently Changed</div>
                ${diffs
                  .slice(0, 5)
                  .map((diff) => {
                    const file = diff.file ?? "(unknown file)"
                    return `
                      <div class="flex items-center gap-1 text-12-regular text-text-weak truncate">
                        <span>${statusPrefix(diff.status)}</span>
                        <span class="truncate">${file}</span>
                      </div>
                    `
                  })
                  .join("")}
              `
              return div
            },
          },
        ],

        searchProviders: [
          {
            id: "bookmarks",
            category: "Bookmarks",
            search: (query: string) => {
              const normalized = query.toLowerCase()
              return bookmarks
                .filter((bookmark) => bookmark.label.toLowerCase().includes(normalized))
                .map((bookmark) => ({
                  id: bookmark.path,
                  title: bookmark.label,
                  description: bookmark.path,
                  onSelect: () => {
                    ctx.command.trigger("file.open")
                  },
                }))
            },
          },
        ],
      }
    },
  }
}

export default ExampleWebExtension
