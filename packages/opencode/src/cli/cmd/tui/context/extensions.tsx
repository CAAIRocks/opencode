import { createSignal, createMemo } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { useSync } from "./sync"
import { useSDK } from "./sdk"
import type {
  TuiSidebarWidget,
  TuiCommandOption,
  TuiDialogFactory,
  TuiStatusWidget,
  TuiExtensionInput,
} from "@opencode-ai/plugin"

interface DialogRegistration {
  id: string
  factory: TuiDialogFactory
}

export const { use: useExtensions, provider: ExtensionProvider } = createSimpleContext({
  name: "Extensions",
  init: () => {
    const sync = useSync()
    const sdk = useSDK()

    const [sidebarWidgets, setSidebarWidgets] = createStore<TuiSidebarWidget[]>([])
    const [commands, setCommands] = createStore<TuiCommandOption[]>([])
    const [dialogs, setDialogs] = createStore<DialogRegistration[]>([])
    const [statusWidgets, setStatusWidgets] = createStore<TuiStatusWidget[]>([])

    const eventListeners = new Map<string, Set<(event: any) => void>>()

    // Subscribe to SDK events and dispatch to registered listeners
    ;(sdk.event as { on: (type: string, handler: (event: any) => void) => void }).on("*", (evt: any) => {
      const type = evt?.type ?? ""
      const listeners = eventListeners.get(type)
      if (listeners) {
        for (const handler of listeners) {
          try {
            handler(evt)
          } catch (e) {
            console.error("[extensions] event handler error:", e)
          }
        }
      }
      // Also dispatch to wildcard listeners
      const wildcardListeners = eventListeners.get("*")
      if (wildcardListeners) {
        for (const handler of wildcardListeners) {
          try {
            handler(evt)
          } catch (e) {
            console.error("[extensions] event handler error:", e)
          }
        }
      }
    })

    const sortedSidebarWidgets = createMemo(() => [...sidebarWidgets].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)))

    const sortedStatusWidgets = createMemo(() => [...statusWidgets].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)))

    const [dialogRequest, setDialogRequest] = createSignal<{ id: string; props?: Record<string, any> } | null>(null)

    // Build the TuiExtensionInput API that plugins receive
    const api: TuiExtensionInput = {
      sidebar: {
        register(widget: TuiSidebarWidget) {
          setSidebarWidgets(
            produce((arr) => {
              arr.push(widget)
            }),
          )
          return () => {
            setSidebarWidgets(
              produce((arr) => {
                const idx = arr.findIndex((w) => w.id === widget.id)
                if (idx !== -1) arr.splice(idx, 1)
              }),
            )
          }
        },
      },
      command: {
        register(options: TuiCommandOption[]) {
          setCommands(
            produce((arr) => {
              arr.push(...options)
            }),
          )
          return () => {
            const ids = new Set(options.map((o) => o.value))
            setCommands(
              produce((arr) => {
                for (let i = arr.length - 1; i >= 0; i--) {
                  if (ids.has(arr[i].value)) arr.splice(i, 1)
                }
              }),
            )
          }
        },
      },
      dialog: {
        register(id: string, factory: TuiDialogFactory) {
          setDialogs(
            produce((arr) => {
              arr.push({ id, factory })
            }),
          )
        },
        show(id: string, props?: Record<string, any>) {
          const reg = dialogs.find((d) => d.id === id)
          if (reg) {
            // This will be called from command handlers which have dialog access
            // Store the request for the consumer to pick up
            setDialogRequest({ id, props })
          }
        },
      },
      status: {
        register(widget: TuiStatusWidget) {
          setStatusWidgets(
            produce((arr) => {
              arr.push(widget)
            }),
          )
          return () => {
            setStatusWidgets(
              produce((arr) => {
                const idx = arr.findIndex((w) => w.id === widget.id)
                if (idx !== -1) arr.splice(idx, 1)
              }),
            )
          }
        },
      },
      context: {
        get directory() {
          return sync.data.path?.directory ?? ""
        },
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
        onEvent(type: string, handler: (event: any) => void) {
          if (!eventListeners.has(type)) {
            eventListeners.set(type, new Set())
          }
          eventListeners.get(type)!.add(handler)
          return () => {
            eventListeners.get(type)?.delete(handler)
          }
        },
      },
    }

    return {
      api,
      sidebarWidgets: sortedSidebarWidgets,
      commands: () => commands,
      dialogs: () => dialogs,
      statusWidgets: sortedStatusWidgets,
      dialogRequest,
      clearDialogRequest: () => setDialogRequest(null),
      showDialog(id: string, props?: Record<string, any>) {
        setDialogRequest({ id, props })
      },
    }
  },
})
