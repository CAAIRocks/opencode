import { describe, expect, test } from "bun:test"
import type {
  Hooks,
  TuiCommandOption,
  TuiExtensionInput,
  TuiSidebarWidget,
  TuiStatusWidget,
  WebContributions,
  WebExtensionContext,
  WebSearchProviderContribution,
  WebSidebarWidgetContribution,
  WebStatusBarContribution,
  WebTabContribution,
  WebToolbarContribution,
} from "@opencode-ai/plugin"

type TuiEventHandler = (event: unknown) => void
type WebEventHandler = (event: unknown) => void

interface TuiMockState {
  widgets: TuiSidebarWidget[]
  commands: TuiCommandOption[]
  statusWidgets: TuiStatusWidget[]
  dialogs: Map<string, (props?: Record<string, unknown>) => unknown>
  shownDialogs: Array<{ id: string; props?: Record<string, unknown> }>
  events: Map<string, Set<TuiEventHandler>>
}

interface WebMockState {
  events: Map<string, Set<WebEventHandler>>
  commandHandlers: Map<string, () => void>
  registeredCommandGroups: unknown[][]
  triggeredCommands: string[]
  sdkCalls: {
    prompt: Array<{ sessionID: string; content: string }>
    command: Array<{ sessionID: string; command: string }>
    fork: Array<{ sessionID: string }>
    delete: Array<{ sessionID: string }>
  }
}

function createTuiMockState(): TuiMockState {
  return {
    widgets: [],
    commands: [],
    statusWidgets: [],
    dialogs: new Map(),
    shownDialogs: [],
    events: new Map(),
  }
}

function createWebMockState(): WebMockState {
  return {
    events: new Map(),
    commandHandlers: new Map(),
    registeredCommandGroups: [],
    triggeredCommands: [],
    sdkCalls: {
      prompt: [],
      command: [],
      fork: [],
      delete: [],
    },
  }
}

function createMockTuiInput(state: TuiMockState = createTuiMockState()): TuiExtensionInput {
  return {
    sidebar: {
      register(widget) {
        state.widgets.push(widget)
        return () => {
          const index = state.widgets.indexOf(widget)
          if (index !== -1) state.widgets.splice(index, 1)
        }
      },
    },
    command: {
      register(options) {
        state.commands.push(...options)
        return () => {
          for (const option of options) {
            const index = state.commands.indexOf(option)
            if (index !== -1) state.commands.splice(index, 1)
          }
        }
      },
    },
    dialog: {
      register(id, factory) {
        state.dialogs.set(id, factory)
      },
      show(id, props) {
        state.shownDialogs.push({ id, props })
        state.dialogs.get(id)?.(props)
      },
    },
    status: {
      register(widget) {
        state.statusWidgets.push(widget)
        return () => {
          const index = state.statusWidgets.indexOf(widget)
          if (index !== -1) state.statusWidgets.splice(index, 1)
        }
      },
    },
    context: {
      directory: "/test/dir",
      session: () => undefined,
      messages: () => [],
      diffs: () => [],
      config: () => ({}),
      onEvent(type, handler) {
        if (!state.events.has(type)) state.events.set(type, new Set())
        state.events.get(type)?.add(handler)
        return () => {
          state.events.get(type)?.delete(handler)
        }
      },
    },
  }
}

function createMockWebContext(state: WebMockState = createWebMockState()): WebExtensionContext {
  return {
    directory: () => "/test/dir",
    session: () => undefined,
    messages: () => [],
    diffs: () => [],
    config: () => ({}),
    providers: () => [],
    onEvent(type, handler) {
      if (!state.events.has(type)) state.events.set(type, new Set())
      state.events.get(type)?.add(handler)
      return () => {
        state.events.get(type)?.delete(handler)
      }
    },
    command: {
      trigger(id) {
        state.triggeredCommands.push(id)
        state.commandHandlers.get(id)?.()
      },
      register(options) {
        state.registeredCommandGroups.push(options)
        for (const option of options as Array<{ value?: string; onSelect?: () => void }>) {
          if (option.value && option.onSelect) {
            state.commandHandlers.set(option.value, option.onSelect)
          }
        }
        return () => {
          for (const option of options as Array<{ value?: string }>) {
            if (option.value) state.commandHandlers.delete(option.value)
          }
          const index = state.registeredCommandGroups.indexOf(options)
          if (index !== -1) state.registeredCommandGroups.splice(index, 1)
        }
      },
    },
    sdk: {
      session: {
        prompt: async (input) => {
          state.sdkCalls.prompt.push(input)
          return { ok: true, type: "prompt", input }
        },
        command: async (input) => {
          state.sdkCalls.command.push(input)
          return { ok: true, type: "command", input }
        },
        fork: async (input) => {
          state.sdkCalls.fork.push(input)
          return { ok: true, type: "fork", input }
        },
        delete: async (input) => {
          state.sdkCalls.delete.push(input)
          return { ok: true, type: "delete", input }
        },
      },
    },
  }
}

function createTuiHarness() {
  const state = createTuiMockState()
  return { input: createMockTuiInput(state), state }
}

function createWebHarness() {
  const state = createWebMockState()
  return { context: createMockWebContext(state), state }
}

describe("plugin extension hook types", () => {
  test("Hooks interface accepts tui.init hook", () => {
    const hooks: Hooks = {
      "tui.init": async (input: TuiExtensionInput) => {
        expect(typeof input.sidebar.register).toBe("function")
        expect(typeof input.command.register).toBe("function")
        expect(typeof input.dialog.register).toBe("function")
        expect(typeof input.dialog.show).toBe("function")
        expect(typeof input.status.register).toBe("function")
        expect(typeof input.context.session).toBe("function")
        expect(typeof input.context.messages).toBe("function")
        expect(typeof input.context.diffs).toBe("function")
        expect(typeof input.context.onEvent).toBe("function")
      },
    }

    expect(hooks["tui.init"]).toBeDefined()
  })

  test("Hooks interface accepts web.init hook", () => {
    const hooks: Hooks = {
      "web.init": async (ctx: WebExtensionContext) => {
        expect(typeof ctx.directory).toBe("function")
        expect(typeof ctx.session).toBe("function")
        expect(typeof ctx.messages).toBe("function")
        expect(typeof ctx.diffs).toBe("function")
        expect(typeof ctx.config).toBe("function")
        expect(typeof ctx.providers).toBe("function")
        expect(typeof ctx.onEvent).toBe("function")
        expect(typeof ctx.command.trigger).toBe("function")
        expect(typeof ctx.command.register).toBe("function")
        expect(typeof ctx.sdk.session.prompt).toBe("function")
        expect(typeof ctx.sdk.session.command).toBe("function")
        expect(typeof ctx.sdk.session.fork).toBe("function")
        expect(typeof ctx.sdk.session.delete).toBe("function")

        return {
          tabs: [{ id: "test", label: "Test", component: () => null }],
        }
      },
    }

    expect(hooks["web.init"]).toBeDefined()
  })

  test("TuiExtensionInput shape type-checks", () => {
    const input: TuiExtensionInput = createMockTuiInput()

    expect(input.context.directory).toBe("/test/dir")
    expect(Array.isArray(input.context.messages())).toBe(true)
  })

  test("WebExtensionContext shape type-checks", () => {
    const context: WebExtensionContext = createMockWebContext()

    expect(context.directory()).toBe("/test/dir")
    expect(Array.isArray(context.providers())).toBe(true)
  })

  test("WebContributions supports all contribution collections", () => {
    const tab: WebTabContribution = { id: "tab", label: "Tab", icon: "tab", component: () => null }
    const toolbar: WebToolbarContribution = { id: "deploy", label: "Deploy", icon: "rocket" }
    const status: WebStatusBarContribution = { id: "health", label: "Health", component: () => null }
    const searchProvider: WebSearchProviderContribution = {
      id: "files",
      category: "code",
      search: (query) => [{ id: query, title: `Result ${query}`, onSelect: () => {} }],
    }
    const sidebar: WebSidebarWidgetContribution = { id: "side", label: "Side", component: () => null }

    const contributions: WebContributions = {
      tabs: [tab],
      toolbarButtons: [toolbar],
      statusBarItems: [status],
      searchProviders: [searchProvider],
      sidebarWidgets: [sidebar],
    }

    expect(contributions.tabs?.[0].id).toBe("tab")
    expect(contributions.toolbarButtons?.[0].icon).toBe("rocket")
    expect(contributions.statusBarItems?.[0].id).toBe("health")
    expect(contributions.searchProviders?.[0].search("x")).toHaveLength(1)
    expect(contributions.sidebarWidgets?.[0].label).toBe("Side")
  })

  test("WebContributions supports partial objects", () => {
    const tabsOnly: WebContributions = {
      tabs: [{ id: "metrics", label: "Metrics", component: () => null }],
    }

    expect(tabsOnly.tabs).toHaveLength(1)
    expect(tabsOnly.toolbarButtons).toBeUndefined()
    expect(tabsOnly.statusBarItems).toBeUndefined()
  })
})

describe("hook invocation simulation", () => {
  test("tui.init hook is called with extension API", async () => {
    let called = false
    const hooks: Hooks[] = [
      {
        "tui.init": async (input) => {
          called = true
          input.sidebar.register({
            id: "test",
            label: "Test",
            render: () => "test",
          })
        },
      },
    ]

    const { input } = createTuiHarness()
    for (const hook of hooks) {
      const fn = hook["tui.init"]
      if (fn) await fn(input)
    }

    expect(called).toBe(true)
  })

  test("web.init hook receives context and returns contributions", async () => {
    const hooks: Hooks[] = [
      {
        "web.init": async (ctx) => ({
          tabs: [{ id: ctx.directory(), label: "Directory", component: () => null }],
          toolbarButtons: [{ id: "deploy", label: "Deploy", icon: "rocket" }],
        }),
      },
    ]

    const { context } = createWebHarness()
    let contributions: WebContributions | void = undefined
    for (const hook of hooks) {
      const fn = hook["web.init"]
      if (fn) contributions = await fn(context)
    }

    expect(contributions).toBeDefined()
    expect(contributions?.tabs).toHaveLength(1)
    expect(contributions?.tabs?.[0].id).toBe("/test/dir")
    expect(contributions?.toolbarButtons).toHaveLength(1)
  })

  test("multiple hooks are called sequentially", async () => {
    const order: number[] = []
    const hooks: Hooks[] = [
      {
        "tui.init": async () => {
          order.push(1)
        },
      },
      {
        "tui.init": async () => {
          order.push(2)
        },
      },
      {
        "tui.init": async () => {
          order.push(3)
        },
      },
    ]

    const { input } = createTuiHarness()
    for (const hook of hooks) {
      const fn = hook["tui.init"]
      if (fn) await fn(input)
    }

    expect(order).toEqual([1, 2, 3])
  })

  test("asynchronous hooks are awaited sequentially", async () => {
    const order: string[] = []
    const hooks: Hooks[] = [
      {
        "tui.init": async () => {
          order.push("first:start")
          await new Promise((resolve) => setTimeout(resolve, 10))
          order.push("first:end")
        },
      },
      {
        "tui.init": async () => {
          order.push("second:start")
          order.push("second:end")
        },
      },
    ]

    const { input } = createTuiHarness()
    for (const hook of hooks) {
      const fn = hook["tui.init"]
      if (fn) await fn(input)
    }

    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"])
  })

  test("hooks without tui.init are skipped", async () => {
    let called = false
    const hooks: Hooks[] = [
      { "chat.message": async () => {} },
      { "tui.init": async () => {
        called = true
      } },
      { tool: {} },
    ]

    const { input } = createTuiHarness()
    for (const hook of hooks) {
      const fn = hook["tui.init"]
      if (fn) await fn(input)
    }

    expect(called).toBe(true)
  })
})

describe("TuiExtensionInput API contract", () => {
  test("sidebar.register returns dispose function", () => {
    const { input, state } = createTuiHarness()
    const widget: TuiSidebarWidget = {
      id: "sidebar",
      label: "Sidebar",
      render: () => null,
    }

    const dispose = input.sidebar.register(widget)
    expect(typeof dispose).toBe("function")
    expect(state.widgets).toHaveLength(1)

    dispose()
    expect(state.widgets).toHaveLength(0)
  })

  test("command.register returns dispose function", () => {
    const { input, state } = createTuiHarness()
    const options: TuiCommandOption[] = [
      { title: "Open", value: "open" },
      { title: "Close", value: "close" },
    ]

    const dispose = input.command.register(options)
    expect(typeof dispose).toBe("function")
    expect(state.commands).toHaveLength(2)

    dispose()
    expect(state.commands).toHaveLength(0)
  })

  test("dialog.register and dialog.show exist and invoke dialog factory", () => {
    const { input, state } = createTuiHarness()
    let capturedProps: Record<string, unknown> | undefined

    input.dialog.register("settings", (props) => {
      capturedProps = props
      return null
    })
    input.dialog.show("settings", { theme: "dark" })

    expect(typeof input.dialog.register).toBe("function")
    expect(typeof input.dialog.show).toBe("function")
    expect(state.dialogs.has("settings")).toBe(true)
    expect(state.shownDialogs).toHaveLength(1)
    expect(capturedProps).toEqual({ theme: "dark" })
  })

  test("status.register returns dispose function", () => {
    const { input, state } = createTuiHarness()
    const widget: TuiStatusWidget = {
      id: "status",
      label: "Status",
      render: () => null,
    }

    const dispose = input.status.register(widget)
    expect(typeof dispose).toBe("function")
    expect(state.statusWidgets).toHaveLength(1)

    dispose()
    expect(state.statusWidgets).toHaveLength(0)
  })

  test("context exposes required fields and onEvent disposer", () => {
    const { input, state } = createTuiHarness()
    const handler = () => {}

    expect(input.context.directory).toBe("/test/dir")
    expect(input.context.session()).toBeUndefined()
    expect(input.context.messages()).toEqual([])
    expect(input.context.diffs()).toEqual([])
    expect(input.context.config()).toEqual({})

    const dispose = input.context.onEvent("message", handler)
    expect(typeof dispose).toBe("function")
    expect(state.events.get("message")?.size).toBe(1)

    dispose()
    expect(state.events.get("message")?.size).toBe(0)
  })
})

describe("WebContributions shape", () => {
  test("all contribution types can be created with required fields", () => {
    const tab: WebTabContribution = { id: "home", label: "Home", component: () => null }
    const toolbar: WebToolbarContribution = { id: "save", label: "Save", icon: "disk" }
    const status: WebStatusBarContribution = { id: "status", label: "Status", component: () => null }
    const search: WebSearchProviderContribution = {
      id: "search",
      category: "general",
      search: () => [{ id: "result", title: "Result", onSelect: () => {} }],
    }
    const sidebar: WebSidebarWidgetContribution = { id: "files", label: "Files", component: () => null }

    expect(tab.id).toBe("home")
    expect(toolbar.icon).toBe("disk")
    expect(status.label).toBe("Status")
    expect(search.search("query")).toHaveLength(1)
    expect(sidebar.label).toBe("Files")
  })

  test("partial WebContributions can include only tabs", () => {
    const contributions: WebContributions = {
      tabs: [{ id: "a", label: "A", component: () => null }],
    }

    expect(contributions.tabs).toHaveLength(1)
    expect(contributions.toolbarButtons).toBeUndefined()
  })
})

describe("WebExtensionContext API contract", () => {
  test("read accessors are present", () => {
    const { context } = createWebHarness()

    expect(context.directory()).toBe("/test/dir")
    expect(context.session()).toBeUndefined()
    expect(context.messages()).toEqual([])
    expect(context.diffs()).toEqual([])
    expect(context.config()).toEqual({})
    expect(context.providers()).toEqual([])
  })

  test("onEvent returns disposer", () => {
    const { context, state } = createWebHarness()
    const handler = () => {}

    const dispose = context.onEvent("provider.changed", handler)
    expect(typeof dispose).toBe("function")
    expect(state.events.get("provider.changed")?.size).toBe(1)

    dispose()
    expect(state.events.get("provider.changed")?.size).toBe(0)
  })

  test("command.trigger and command.register exist and work", () => {
    const { context, state } = createWebHarness()
    let selected = false

    const dispose = context.command.register([
      {
        value: "open",
        title: "Open",
        onSelect: () => {
          selected = true
        },
      },
    ])

    expect(typeof context.command.trigger).toBe("function")
    expect(typeof context.command.register).toBe("function")
    expect(typeof dispose).toBe("function")
    expect(state.registeredCommandGroups).toHaveLength(1)

    context.command.trigger("open")
    expect(selected).toBe(true)
    expect(state.triggeredCommands).toEqual(["open"])

    dispose()
    expect(state.registeredCommandGroups).toHaveLength(0)
  })

  test("sdk.session methods exist and can be called", async () => {
    const { context, state } = createWebHarness()

    const promptResult = await context.sdk.session.prompt({ sessionID: "s1", content: "hello" })
    const commandResult = await context.sdk.session.command({ sessionID: "s1", command: "summarize" })
    const forkResult = await context.sdk.session.fork({ sessionID: "s1" })
    const deleteResult = await context.sdk.session.delete({ sessionID: "s1" })

    expect(promptResult.ok).toBe(true)
    expect(commandResult.ok).toBe(true)
    expect(forkResult.ok).toBe(true)
    expect(deleteResult.ok).toBe(true)
    expect(state.sdkCalls.prompt).toHaveLength(1)
    expect(state.sdkCalls.command).toHaveLength(1)
    expect(state.sdkCalls.fork).toHaveLength(1)
    expect(state.sdkCalls.delete).toHaveLength(1)
  })
})
