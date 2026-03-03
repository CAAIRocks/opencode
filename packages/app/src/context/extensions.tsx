import { createMemo, createSignal, onCleanup, type Accessor, type JSX } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { useSync } from "./sync"
import { useSDK } from "./sdk"
import { useCommand, type CommandOption } from "./command"
import type {
  WebTabContribution,
  WebToolbarContribution,
  WebStatusBarContribution,
  WebSearchProviderContribution,
  WebSidebarWidgetContribution,
  WebContributions,
  WebExtensionContext,
} from "@opencode-ai/plugin"

export type {
  WebTabContribution,
  WebToolbarContribution,
  WebStatusBarContribution,
  WebSearchProviderContribution,
  WebSidebarWidgetContribution,
}

export const { use: useExtensions, provider: ExtensionProvider } = createSimpleContext({
  name: "Extensions",
  init: () => {
    const sync = useSync()
    const sdk = useSDK()
    const command = useCommand()

    const [tabs, setTabs] = createStore<WebTabContribution[]>([])
    const [toolbarButtons, setToolbarButtons] = createStore<WebToolbarContribution[]>([])
    const [statusBarItems, setStatusBarItems] = createStore<WebStatusBarContribution[]>([])
    const [searchProviders, setSearchProviders] = createStore<WebSearchProviderContribution[]>([])
    const [sidebarWidgets, setSidebarWidgets] = createStore<WebSidebarWidgetContribution[]>([])

    const eventListeners = new Map<string, Set<(event: any) => void>>()

    const sortedTabs = createMemo(() =>
      [...tabs].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    )
    const sortedToolbarButtons = createMemo(() =>
      [...toolbarButtons].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    )
    const sortedStatusBarItems = createMemo(() =>
      [...statusBarItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    )
    const sortedSidebarWidgets = createMemo(() =>
      [...sidebarWidgets].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    )

    // Build the WebExtensionContext that extension components receive
    const extensionContext: WebExtensionContext = {
      directory: () => sync.data.path?.directory ?? "",
      session: () => {
        const sessions = sync.data.session
        return sessions.length > 0 ? sessions[0] : undefined
      },
      messages: () => {
        const sessions = sync.data.session
        if (sessions.length === 0) return []
        const id = sessions[0].id
        return sync.data.message[id] ?? []
      },
      diffs: () => {
        const sessions = sync.data.session
        if (sessions.length === 0) return []
        const id = sessions[0].id
        return sync.data.session_diff[id] ?? []
      },
      config: () => sync.data.config,
      providers: () => sync.data.provider.all,
      onEvent(type: string, handler: (event: any) => void) {
        if (!eventListeners.has(type)) {
          eventListeners.set(type, new Set())
        }
        eventListeners.get(type)!.add(handler)
        return () => {
          eventListeners.get(type)?.delete(handler)
        }
      },
      command: {
        trigger(id: string) {
          command.trigger(id)
        },
        register(options: CommandOption[]) {
          command.register(() => options)
          // Return a no-op dispose since command.register handles cleanup via onCleanup
          return () => {}
        },
      },
      sdk: {
        session: {
          prompt: (input) =>
            sdk.client.session.prompt({
              sessionID: input.sessionID,
              parts: [{ type: "text", text: input.content }],
            }),
          command: (input) => sdk.client.session.command(input),
          fork: (input) => sdk.client.session.fork(input),
          delete: (input) => sdk.client.session.delete(input),
        },
      },
    }

    function registerContributions(contributions: WebContributions) {
      if (contributions.tabs) {
        setTabs(produce((arr) => {
          arr.push(...contributions.tabs!)
        }))
      }
      if (contributions.toolbarButtons) {
        setToolbarButtons(produce((arr) => {
          arr.push(...contributions.toolbarButtons!)
        }))
      }
      if (contributions.statusBarItems) {
        setStatusBarItems(produce((arr) => {
          arr.push(...contributions.statusBarItems!)
        }))
      }
      if (contributions.searchProviders) {
        setSearchProviders(produce((arr) => {
          arr.push(...contributions.searchProviders!)
        }))
      }
      if (contributions.sidebarWidgets) {
        setSidebarWidgets(produce((arr) => {
          arr.push(...contributions.sidebarWidgets!)
        }))
      }
    }

    // --- POC: Register hardcoded example extensions for visual testing ---
    registerContributions({
      tabs: [
        {
          id: "metrics",
          label: "Metrics",
          order: 10,
          component: () => {
            const msgs = extensionContext.messages()
            const totalTokens = msgs.reduce((sum: number, msg: any) => {
              if (msg.role === "assistant" && msg.tokens) {
                return sum + (msg.tokens.input || 0) + (msg.tokens.output || 0)
              }
              return sum
            }, 0)
            const diffs = extensionContext.diffs()
            return (
              <div class="p-4 space-y-4">
                <h3 class="text-14-medium text-text-strong">Session Metrics</h3>
                <div class="space-y-2">
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Total Messages</span>
                    <span class="text-text-base">{msgs.length}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Total Tokens</span>
                    <span class="text-text-base">{totalTokens.toLocaleString()}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">File Changes</span>
                    <span class="text-text-base">{diffs.length}</span>
                  </div>
                  <div class="flex justify-between text-12-regular">
                    <span class="text-text-weak">Directory</span>
                    <span class="text-text-base font-mono text-11-regular truncate max-w-48">{extensionContext.directory()}</span>
                  </div>
                </div>
              </div>
            )
          },
        },
      ],
      toolbarButtons: [
        {
          id: "ext-deploy",
          label: "Deploy",
          icon: "rocket",
          order: 10,
          onClick: () => {
            extensionContext.command.trigger("session.new")
          },
        },
      ],
      statusBarItems: [
        {
          id: "ci-status",
          label: "CI",
          order: 10,
          healthy: () => true,
          component: () => (
            <div class="flex items-center gap-2 w-full px-2 py-1">
              <div class="size-1.5 rounded-full shrink-0 bg-icon-success-base" />
              <span class="text-14-regular text-text-base">CI Pipeline: Passing</span>
            </div>
          ),
        },
      ],
      sidebarWidgets: [
        {
          id: "bookmarks",
          label: "Bookmarks",
          order: 10,
          component: () => {
            const diffs = extensionContext.diffs()
            return (
              <div class="px-2 py-2 space-y-1">
                {diffs.length === 0 ? (
                  <span class="text-12-regular text-text-weak">No file changes yet</span>
                ) : (
                  <>
                    <div class="text-12-medium text-text-base mb-1">Recently Changed</div>
                    {diffs.slice(0, 5).map((d: any) => (
                      <div class="flex items-center gap-1 text-12-regular text-text-weak truncate">
                        <span>{d.status === "added" ? "+" : d.status === "deleted" ? "-" : "~"}</span>
                        <span class="truncate">{d.file}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          },
        },
      ],
    })

    return {
      tabs: sortedTabs,
      toolbarButtons: sortedToolbarButtons,
      statusBarItems: sortedStatusBarItems,
      searchProviders: () => searchProviders,
      sidebarWidgets: sortedSidebarWidgets,
      extensionContext,
      registerContributions,
      overallHealthy: createMemo(() =>
        statusBarItems.every((item) => !item.healthy || item.healthy()),
      ),
    }
  },
})
