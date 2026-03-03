import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type {
  WebContributions,
  WebSearchProviderContribution,
  WebSidebarWidgetContribution,
  WebStatusBarContribution,
  WebTabContribution,
  WebToolbarContribution,
} from "@opencode-ai/plugin"

function withRoot(run: () => void) {
  createRoot((dispose) => {
    try {
      run()
    } finally {
      dispose()
    }
  })
}

function createTabRegistry() {
  const [tabs, setTabs] = createStore<WebTabContribution[]>([])
  const sorted = () => [...tabs].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

  return {
    add: (items: WebTabContribution[]) =>
      setTabs(
        produce((arr) => {
          arr.push(...items)
        }),
      ),
    sorted,
    all: () => tabs,
  }
}

function createToolbarRegistry() {
  const [items, setItems] = createStore<WebToolbarContribution[]>([])
  const sorted = () => [...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

  return {
    add: (items_: WebToolbarContribution[]) =>
      setItems(
        produce((arr) => {
          arr.push(...items_)
        }),
      ),
    sorted,
    all: () => items,
  }
}

function createStatusBarRegistry() {
  const [items, setItems] = createStore<WebStatusBarContribution[]>([])
  const sorted = () => [...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  const overallHealthy = () => items.every((item) => !item.healthy || item.healthy())

  return {
    add: (items_: WebStatusBarContribution[]) =>
      setItems(
        produce((arr) => {
          arr.push(...items_)
        }),
      ),
    sorted,
    all: () => items,
    overallHealthy,
  }
}

function createSidebarRegistry() {
  const [items, setItems] = createStore<WebSidebarWidgetContribution[]>([])
  const sorted = () => [...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

  return {
    add: (items_: WebSidebarWidgetContribution[]) =>
      setItems(
        produce((arr) => {
          arr.push(...items_)
        }),
      ),
    sorted,
    all: () => items,
  }
}

function createSearchProviderRegistry() {
  const [providers, setProviders] = createStore<WebSearchProviderContribution[]>([])

  return {
    add: (items: WebSearchProviderContribution[]) =>
      setProviders(
        produce((arr) => {
          arr.push(...items)
        }),
      ),
    all: () => providers,
    search: (query: string) => {
      if (!query.trim()) return []
      return providers.flatMap((provider) => provider.search(query))
    },
  }
}

function createContributionsRegistry() {
  const tabReg = createTabRegistry()
  const toolbarReg = createToolbarRegistry()
  const statusReg = createStatusBarRegistry()
  const sidebarReg = createSidebarRegistry()
  const searchReg = createSearchProviderRegistry()

  function registerContributions(contributions: WebContributions) {
    if (contributions.tabs) tabReg.add(contributions.tabs)
    if (contributions.toolbarButtons) toolbarReg.add(contributions.toolbarButtons)
    if (contributions.statusBarItems) statusReg.add(contributions.statusBarItems)
    if (contributions.sidebarWidgets) sidebarReg.add(contributions.sidebarWidgets)
    if (contributions.searchProviders) searchReg.add(contributions.searchProviders)
  }

  return {
    tabReg,
    toolbarReg,
    statusReg,
    sidebarReg,
    searchReg,
    registerContributions,
  }
}

type EventHandler = (event: unknown) => void

function createEventSystem() {
  const listeners = new Map<string, Set<EventHandler>>()

  return {
    on(type: string, handler: EventHandler) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
      return () => {
        listeners.get(type)?.delete(handler)
      }
    },
    dispatch(type: string, event: unknown) {
      const specific = listeners.get(type)
      if (specific) for (const handler of specific) handler(event)

      const wildcard = listeners.get("*")
      if (wildcard) for (const handler of wildcard) handler(event)
    },
  }
}

type TestSession = { id: string; label?: string }
type TestSyncData = {
  path?: { directory?: string }
  session: TestSession[]
  message: Record<string, Array<{ id: string; text: string }>>
  session_diff: Record<string, Array<{ id: string; summary: string }>>
  config: { mode: string }
  provider: { all: string[] }
}

function createExtensionContext(data: TestSyncData) {
  const events = createEventSystem()

  return {
    directory: () => data.path?.directory ?? "",
    session: () => {
      const sessions = data.session
      return sessions.length > 0 ? sessions[0] : undefined
    },
    messages: () => {
      const sessions = data.session
      if (sessions.length === 0) return []
      const id = sessions[0]!.id
      return data.message[id] ?? []
    },
    diffs: () => {
      const sessions = data.session
      if (sessions.length === 0) return []
      const id = sessions[0]!.id
      return data.session_diff[id] ?? []
    },
    config: () => data.config,
    providers: () => data.provider.all,
    onEvent: events.on,
    dispatch: events.dispatch,
  }
}

describe("web extension tab registry", () => {
  test("registers tabs", () => {
    withRoot(() => {
      const reg = createTabRegistry()

      reg.add([
        { id: "t1", label: "Tab 1", component: () => null },
        { id: "t2", label: "Tab 2", component: () => null },
      ])

      expect(reg.all().map((tab) => tab.id)).toEqual(["t1", "t2"])
    })
  })

  test("sorts tabs by order", () => {
    withRoot(() => {
      const reg = createTabRegistry()

      reg.add([
        { id: "t2", label: "Tab 2", order: 20, component: () => null },
        { id: "t1", label: "Tab 1", order: 10, component: () => null },
      ])

      expect(reg.sorted().map((tab) => tab.id)).toEqual(["t1", "t2"])
    })
  })

  test("uses default order 100 when order is missing", () => {
    withRoot(() => {
      const reg = createTabRegistry()

      reg.add([
        { id: "t-default", label: "Default", component: () => null },
        { id: "t-priority", label: "Priority", order: 5, component: () => null },
      ])

      expect(reg.sorted().map((tab) => tab.id)).toEqual(["t-priority", "t-default"])
    })
  })

  test("keeps add calls additive", () => {
    withRoot(() => {
      const reg = createTabRegistry()

      reg.add([{ id: "t2", label: "Tab 2", order: 20, component: () => null }])
      reg.add([{ id: "t1", label: "Tab 1", order: 10, component: () => null }])

      expect(reg.sorted().map((tab) => tab.id)).toEqual(["t1", "t2"])
    })
  })
})

describe("web extension toolbar registry", () => {
  test("registers toolbar buttons", () => {
    withRoot(() => {
      const reg = createToolbarRegistry()

      reg.add([
        { id: "b1", label: "One", icon: "icon-1" },
        { id: "b2", label: "Two", icon: "icon-2" },
      ])

      expect(reg.all().map((item) => item.id)).toEqual(["b1", "b2"])
    })
  })

  test("sorts toolbar buttons by order", () => {
    withRoot(() => {
      const reg = createToolbarRegistry()

      reg.add([
        { id: "late", label: "Late", icon: "icon-l", order: 20 },
        { id: "early", label: "Early", icon: "icon-e", order: 10 },
      ])

      expect(reg.sorted().map((item) => item.id)).toEqual(["early", "late"])
    })
  })

  test("applies default order 100 for toolbar buttons", () => {
    withRoot(() => {
      const reg = createToolbarRegistry()

      reg.add([
        { id: "default", label: "Default", icon: "icon-d" },
        { id: "priority", label: "Priority", icon: "icon-p", order: 1 },
      ])

      expect(reg.sorted().map((item) => item.id)).toEqual(["priority", "default"])
    })
  })
})

describe("web extension status bar registry", () => {
  test("registers status bar items", () => {
    withRoot(() => {
      const reg = createStatusBarRegistry()

      reg.add([
        { id: "s1", label: "One", component: () => null },
        { id: "s2", label: "Two", component: () => null },
      ])

      expect(reg.all().map((item) => item.id)).toEqual(["s1", "s2"])
    })
  })

  test("sorts status bar items by order", () => {
    withRoot(() => {
      const reg = createStatusBarRegistry()

      reg.add([
        { id: "late", label: "Late", order: 20, component: () => null },
        { id: "early", label: "Early", order: 10, component: () => null },
      ])

      expect(reg.sorted().map((item) => item.id)).toEqual(["early", "late"])
    })
  })

  test("overallHealthy is true when all items are healthy", () => {
    withRoot(() => {
      const reg = createStatusBarRegistry()

      reg.add([
        { id: "a", label: "A", healthy: () => true, component: () => null },
        { id: "b", label: "B", healthy: () => true, component: () => null },
      ])

      expect(reg.overallHealthy()).toBe(true)
    })
  })

  test("overallHealthy is false when any item is unhealthy", () => {
    withRoot(() => {
      const reg = createStatusBarRegistry()

      reg.add([
        { id: "ok", label: "OK", healthy: () => true, component: () => null },
        { id: "bad", label: "Bad", healthy: () => false, component: () => null },
      ])

      expect(reg.overallHealthy()).toBe(false)
    })
  })

  test("overallHealthy treats items without healthy function as healthy", () => {
    withRoot(() => {
      const reg = createStatusBarRegistry()

      reg.add([
        { id: "implicit", label: "Implicit", component: () => null },
        { id: "explicit", label: "Explicit", healthy: () => true, component: () => null },
      ])

      expect(reg.overallHealthy()).toBe(true)
    })
  })

  test("overallHealthy is true when no items are registered", () => {
    withRoot(() => {
      const reg = createStatusBarRegistry()
      expect(reg.overallHealthy()).toBe(true)
    })
  })
})

describe("web extension sidebar registry", () => {
  test("registers sidebar widgets", () => {
    withRoot(() => {
      const reg = createSidebarRegistry()

      reg.add([
        { id: "w1", label: "Widget 1", component: () => null },
        { id: "w2", label: "Widget 2", component: () => null },
      ])

      expect(reg.all().map((item) => item.id)).toEqual(["w1", "w2"])
    })
  })

  test("sorts sidebar widgets by order", () => {
    withRoot(() => {
      const reg = createSidebarRegistry()

      reg.add([
        { id: "second", label: "Second", order: 20, component: () => null },
        { id: "first", label: "First", order: 10, component: () => null },
      ])

      expect(reg.sorted().map((item) => item.id)).toEqual(["first", "second"])
    })
  })

  test("uses default order 100 for sidebar widgets", () => {
    withRoot(() => {
      const reg = createSidebarRegistry()

      reg.add([
        { id: "default", label: "Default", component: () => null },
        { id: "priority", label: "Priority", order: 2, component: () => null },
      ])

      expect(reg.sorted().map((item) => item.id)).toEqual(["priority", "default"])
    })
  })
})

describe("web extension search providers", () => {
  test("registers search providers", () => {
    withRoot(() => {
      const reg = createSearchProviderRegistry()

      reg.add([
        {
          id: "files",
          category: "Files",
          search: () => [],
        },
        {
          id: "commands",
          category: "Commands",
          search: () => [],
        },
      ])

      expect(reg.all().map((provider) => provider.id)).toEqual(["files", "commands"])
    })
  })

  test("returns aggregated search results from all providers", () => {
    withRoot(() => {
      const reg = createSearchProviderRegistry()

      reg.add([
        {
          id: "files",
          category: "Files",
          search: (query) => [
            {
              id: `file-${query}`,
              title: `File ${query}`,
              onSelect: () => {},
            },
          ],
        },
        {
          id: "commands",
          category: "Commands",
          search: (query) => [
            {
              id: `cmd-${query}`,
              title: `Command ${query}`,
              onSelect: () => {},
            },
          ],
        },
      ])

      const results = reg.search("build")
      expect(results.map((result) => result.id)).toEqual(["file-build", "cmd-build"])
    })
  })

  test("empty query returns no search results", () => {
    withRoot(() => {
      const reg = createSearchProviderRegistry()
      let callCount = 0

      reg.add([
        {
          id: "files",
          category: "Files",
          search: () => {
            callCount += 1
            return []
          },
        },
      ])

      expect(reg.search("")).toEqual([])
      expect(reg.search("   ")).toEqual([])
      expect(callCount).toBe(0)
    })
  })

  test("search returns empty array when no providers are registered", () => {
    withRoot(() => {
      const reg = createSearchProviderRegistry()
      expect(reg.search("anything")).toEqual([])
    })
  })
})

describe("web extension bulk contribution registration", () => {
  test("registers multiple contribution types at once", () => {
    withRoot(() => {
      const reg = createContributionsRegistry()

      reg.registerContributions({
        tabs: [{ id: "t1", label: "Tab", component: () => null }],
        toolbarButtons: [{ id: "b1", label: "Button", icon: "icon" }],
        statusBarItems: [{ id: "s1", label: "Status", component: () => null }],
        sidebarWidgets: [{ id: "w1", label: "Widget", component: () => null }],
        searchProviders: [
          {
            id: "p1",
            category: "General",
            search: () => [],
          },
        ],
      })

      expect(reg.tabReg.all()).toHaveLength(1)
      expect(reg.toolbarReg.all()).toHaveLength(1)
      expect(reg.statusReg.all()).toHaveLength(1)
      expect(reg.sidebarReg.all()).toHaveLength(1)
      expect(reg.searchReg.all()).toHaveLength(1)
    })
  })

  test("supports partial contributions", () => {
    withRoot(() => {
      const reg = createContributionsRegistry()

      reg.registerContributions({
        tabs: [{ id: "tab-only", label: "Tab", component: () => null }],
      })

      expect(reg.tabReg.all()).toHaveLength(1)
      expect(reg.toolbarReg.all()).toHaveLength(0)
      expect(reg.statusReg.all()).toHaveLength(0)
      expect(reg.sidebarReg.all()).toHaveLength(0)
      expect(reg.searchReg.all()).toHaveLength(0)
    })
  })

  test("handles empty contributions object", () => {
    withRoot(() => {
      const reg = createContributionsRegistry()

      reg.registerContributions({})

      expect(reg.tabReg.all()).toHaveLength(0)
      expect(reg.toolbarReg.all()).toHaveLength(0)
      expect(reg.statusReg.all()).toHaveLength(0)
      expect(reg.sidebarReg.all()).toHaveLength(0)
      expect(reg.searchReg.all()).toHaveLength(0)
    })
  })

  test("supports repeated registerContributions calls", () => {
    withRoot(() => {
      const reg = createContributionsRegistry()

      reg.registerContributions({
        tabs: [{ id: "t2", label: "Tab 2", order: 20, component: () => null }],
      })
      reg.registerContributions({
        tabs: [{ id: "t1", label: "Tab 1", order: 10, component: () => null }],
      })

      expect(reg.tabReg.sorted().map((tab) => tab.id)).toEqual(["t1", "t2"])
    })
  })
})

describe("web extension event listener system", () => {
  test("dispatches event to matching listener", () => {
    const events = createEventSystem()
    const received: string[] = []

    events.on("sync.updated", (event) => {
      received.push((event as { id: string }).id)
    })

    events.dispatch("sync.updated", { id: "evt-1" })

    expect(received).toEqual(["evt-1"])
  })

  test("dispatches events to wildcard listeners", () => {
    const events = createEventSystem()
    const payloads: string[] = []

    events.on("*", (event) => {
      payloads.push((event as { payload: string }).payload)
    })

    events.dispatch("alpha", { payload: "a" })
    events.dispatch("beta", { payload: "b" })

    expect(payloads).toEqual(["a", "b"])
  })

  test("disposing listener stops future event delivery", () => {
    const events = createEventSystem()
    let calls = 0

    const dispose = events.on("sync.updated", () => {
      calls += 1
    })

    events.dispatch("sync.updated", { id: "first" })
    dispose()
    events.dispatch("sync.updated", { id: "second" })

    expect(calls).toBe(1)
  })

  test("supports multiple listeners for same event", () => {
    const events = createEventSystem()
    const calls: string[] = []

    events.on("sync.updated", () => calls.push("one"))
    events.on("sync.updated", () => calls.push("two"))

    events.dispatch("sync.updated", { id: "evt" })

    expect(calls).toEqual(["one", "two"])
  })

  test("dispatches to specific and wildcard listeners", () => {
    const events = createEventSystem()
    const calls: string[] = []

    events.on("sync.updated", () => calls.push("specific"))
    events.on("*", () => calls.push("wildcard"))

    events.dispatch("sync.updated", { id: "evt" })

    expect(calls).toEqual(["specific", "wildcard"])
  })
})

describe("web extension context accessors", () => {
  test("directory accessor returns empty string when directory is unavailable", () => {
    const context = createExtensionContext({
      session: [],
      message: {},
      session_diff: {},
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.directory()).toBe("")
  })

  test("directory accessor returns current directory", () => {
    const context = createExtensionContext({
      path: { directory: "/tmp/project" },
      session: [],
      message: {},
      session_diff: {},
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.directory()).toBe("/tmp/project")
  })

  test("session accessor returns undefined when no sessions exist", () => {
    const context = createExtensionContext({
      session: [],
      message: {},
      session_diff: {},
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.session()).toBeUndefined()
  })

  test("session accessor returns first session when sessions exist", () => {
    const first = { id: "s1", label: "first" }
    const second = { id: "s2", label: "second" }
    const context = createExtensionContext({
      session: [first, second],
      message: {},
      session_diff: {},
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.session()).toEqual(first)
  })

  test("messages accessor returns empty array when there is no active session", () => {
    const context = createExtensionContext({
      session: [],
      message: { s1: [{ id: "m1", text: "message" }] },
      session_diff: {},
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.messages()).toEqual([])
  })

  test("messages accessor returns messages for first session", () => {
    const context = createExtensionContext({
      session: [{ id: "s1" }, { id: "s2" }],
      message: {
        s1: [{ id: "m1", text: "first" }],
        s2: [{ id: "m2", text: "second" }],
      },
      session_diff: {},
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.messages()).toEqual([{ id: "m1", text: "first" }])
  })

  test("diffs accessor returns empty array when there is no active session", () => {
    const context = createExtensionContext({
      session: [],
      message: {},
      session_diff: { s1: [{ id: "d1", summary: "diff" }] },
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.diffs()).toEqual([])
  })

  test("diffs accessor returns diffs for first session", () => {
    const context = createExtensionContext({
      session: [{ id: "s1" }, { id: "s2" }],
      message: {},
      session_diff: {
        s1: [{ id: "d1", summary: "first" }],
        s2: [{ id: "d2", summary: "second" }],
      },
      config: { mode: "test" },
      provider: { all: [] },
    })

    expect(context.diffs()).toEqual([{ id: "d1", summary: "first" }])
  })
})
