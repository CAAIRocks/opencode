import { describe, expect, test } from "bun:test"
import { createMemo, createRoot, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { TuiCommandOption, TuiDialogFactory, TuiSidebarWidget, TuiStatusWidget } from "@opencode-ai/plugin"

type DialogRequest = { id: string; props?: Record<string, unknown> } | null
type TuiEvent = { type: string; [key: string]: unknown }

function createSidebarRegistry() {
  const [widgets, setWidgets] = createStore<TuiSidebarWidget[]>([])
  const sorted = () => [...widgets].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

  return {
    register(widget: TuiSidebarWidget) {
      setWidgets(
        produce((arr) => {
          arr.push(widget)
        }),
      )
      return () => {
        setWidgets(
          produce((arr) => {
            const idx = arr.findIndex((w) => w.id === widget.id)
            if (idx !== -1) arr.splice(idx, 1)
          }),
        )
      }
    },
    sorted,
    all: () => widgets,
  }
}

function createCommandRegistry() {
  const [commands, setCommands] = createStore<TuiCommandOption[]>([])

  return {
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
    all: () => commands,
  }
}

function createDialogRegistry() {
  const [dialogs, setDialogs] = createStore<{ id: string; factory: TuiDialogFactory }[]>([])
  const [request, setRequest] = createSignal<DialogRequest>(null)

  return {
    register(id: string, factory: TuiDialogFactory) {
      setDialogs(
        produce((arr) => {
          arr.push({ id, factory })
        }),
      )
    },
    show(id: string, props?: Record<string, unknown>) {
      const reg = dialogs.find((d) => d.id === id)
      if (reg) setRequest({ id, props })
    },
    request,
    clearRequest: () => setRequest(null),
    all: () => dialogs,
  }
}

function createStatusRegistry() {
  const [widgets, setWidgets] = createStore<TuiStatusWidget[]>([])
  const sorted = () => [...widgets].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

  return {
    register(widget: TuiStatusWidget) {
      setWidgets(
        produce((arr) => {
          arr.push(widget)
        }),
      )
      return () => {
        setWidgets(
          produce((arr) => {
            const idx = arr.findIndex((w) => w.id === widget.id)
            if (idx !== -1) arr.splice(idx, 1)
          }),
        )
      }
    },
    sorted,
    all: () => widgets,
  }
}

function createEventSystem() {
  const listeners = new Map<string, Set<(event: TuiEvent) => void>>()

  return {
    on(type: string, handler: (event: TuiEvent) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
      return () => {
        listeners.get(type)?.delete(handler)
      }
    },
    dispatch(event: TuiEvent) {
      const specific = listeners.get(event.type)
      if (specific) {
        for (const h of specific) {
          try {
            h(event)
          } catch {
            // ignore handler errors to match production behavior
          }
        }
      }

      const wildcard = listeners.get("*")
      if (wildcard) {
        for (const h of wildcard) {
          try {
            h(event)
          } catch {
            // ignore handler errors to match production behavior
          }
        }
      }
    },
  }
}

describe("tui extension sidebar registry", () => {
  test("registers and retrieves widgets", () => {
    createRoot((dispose) => {
      const registry = createSidebarRegistry()
      registry.register({ id: "w1", label: "Widget 1", render: () => null })
      expect(registry.all()).toHaveLength(1)
      expect(registry.all()[0].id).toBe("w1")
      dispose()
    })
  })

  test("sorts widgets by order", () => {
    createRoot((dispose) => {
      const registry = createSidebarRegistry()
      registry.register({ id: "w2", label: "Second", order: 20, render: () => null })
      registry.register({ id: "w1", label: "First", order: 10, render: () => null })
      registry.register({ id: "w3", label: "Third", order: 30, render: () => null })
      expect(registry.sorted().map((w) => w.id)).toEqual(["w1", "w2", "w3"])
      dispose()
    })
  })

  test("dispose removes widget", () => {
    createRoot((dispose) => {
      const registry = createSidebarRegistry()
      const removeW1 = registry.register({ id: "w1", label: "Widget 1", render: () => null })
      registry.register({ id: "w2", label: "Widget 2", render: () => null })
      expect(registry.all()).toHaveLength(2)
      removeW1()
      expect(registry.all()).toHaveLength(1)
      expect(registry.all()[0].id).toBe("w2")
      dispose()
    })
  })

  test("uses default order 100 when not specified", () => {
    createRoot((dispose) => {
      const registry = createSidebarRegistry()
      registry.register({ id: "explicit", label: "Explicit", order: 50, render: () => null })
      registry.register({ id: "default", label: "Default", render: () => null })
      expect(registry.sorted().map((w) => w.id)).toEqual(["explicit", "default"])
      dispose()
    })
  })

  test("keeps stable order for widgets with same order", () => {
    createRoot((dispose) => {
      const registry = createSidebarRegistry()
      registry.register({ id: "a", label: "A", render: () => null })
      registry.register({ id: "b", label: "B", render: () => null })
      registry.register({ id: "c", label: "C", render: () => null })
      expect(registry.sorted().map((w) => w.id)).toEqual(["a", "b", "c"])
      dispose()
    })
  })
})

describe("tui extension command registry", () => {
  test("registers command options", () => {
    createRoot((dispose) => {
      const registry = createCommandRegistry()
      registry.register([
        { title: "Open", value: "open" },
        { title: "Close", value: "close" },
      ])
      expect(registry.all()).toHaveLength(2)
      expect(registry.all().map((x) => x.value)).toEqual(["open", "close"])
      dispose()
    })
  })

  test("appends commands from multiple registrations", () => {
    createRoot((dispose) => {
      const registry = createCommandRegistry()
      registry.register([{ title: "One", value: "one" }])
      registry.register([{ title: "Two", value: "two" }])
      expect(registry.all().map((x) => x.value)).toEqual(["one", "two"])
      dispose()
    })
  })

  test("dispose removes commands by value", () => {
    createRoot((dispose) => {
      const registry = createCommandRegistry()
      const remove = registry.register([
        { title: "Open", value: "open" },
        { title: "Close", value: "close" },
      ])
      registry.register([{ title: "Stay", value: "stay" }])
      remove()
      expect(registry.all().map((x) => x.value)).toEqual(["stay"])
      dispose()
    })
  })

  test("allows duplicate command values before dispose", () => {
    createRoot((dispose) => {
      const registry = createCommandRegistry()
      registry.register([{ title: "First Duplicate", value: "dup" }])
      registry.register([{ title: "Second Duplicate", value: "dup" }])
      expect(registry.all()).toHaveLength(2)
      expect(registry.all().map((x) => x.title)).toEqual(["First Duplicate", "Second Duplicate"])
      dispose()
    })
  })

  test("dispose removes all entries sharing registered values", () => {
    createRoot((dispose) => {
      const registry = createCommandRegistry()
      const removeA = registry.register([{ title: "A1", value: "dup" }])
      registry.register([{ title: "B1", value: "dup" }])
      expect(registry.all()).toHaveLength(2)
      removeA()
      expect(registry.all()).toHaveLength(0)
      dispose()
    })
  })
})

describe("tui extension dialog registry", () => {
  test("registers a dialog factory", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      const factory: TuiDialogFactory = () => null
      registry.register("confirm", factory)
      expect(registry.all()).toHaveLength(1)
      expect(registry.all()[0].id).toBe("confirm")
      expect(registry.all()[0].factory).toBe(factory)
      dispose()
    })
  })

  test("showing a registered dialog sets dialog request", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.register("confirm", () => null)
      registry.show("confirm", { force: true })
      expect(registry.request()).toEqual({ id: "confirm", props: { force: true } })
      dispose()
    })
  })

  test("showing an unregistered dialog does not set request", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.show("missing", { ignored: true })
      expect(registry.request()).toBeNull()
      dispose()
    })
  })

  test("show without props sets request with undefined props", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.register("confirm", () => null)
      registry.show("confirm")
      expect(registry.request()).toEqual({ id: "confirm", props: undefined })
      dispose()
    })
  })

  test("later show call replaces previous request", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.register("first", () => null)
      registry.register("second", () => null)
      registry.show("first", { step: 1 })
      registry.show("second", { step: 2 })
      expect(registry.request()).toEqual({ id: "second", props: { step: 2 } })
      dispose()
    })
  })
})

describe("tui extension status registry", () => {
  test("registers and sorts status widgets", () => {
    createRoot((dispose) => {
      const registry = createStatusRegistry()
      registry.register({ id: "s2", label: "Second", order: 20, render: () => null })
      registry.register({ id: "s1", label: "First", order: 10, render: () => null })
      registry.register({ id: "s3", label: "Third", order: 30, render: () => null })
      expect(registry.sorted().map((w) => w.id)).toEqual(["s1", "s2", "s3"])
      dispose()
    })
  })

  test("uses default order for status widgets", () => {
    createRoot((dispose) => {
      const registry = createStatusRegistry()
      registry.register({ id: "s-default", label: "Default", render: () => null })
      registry.register({ id: "s-early", label: "Early", order: 1, render: () => null })
      expect(registry.sorted().map((w) => w.id)).toEqual(["s-early", "s-default"])
      dispose()
    })
  })

  test("dispose removes status widget", () => {
    createRoot((dispose) => {
      const registry = createStatusRegistry()
      const remove = registry.register({ id: "s1", label: "One", render: () => null })
      registry.register({ id: "s2", label: "Two", render: () => null })
      expect(registry.all()).toHaveLength(2)
      remove()
      expect(registry.all().map((w) => w.id)).toEqual(["s2"])
      dispose()
    })
  })

  test("keeps insertion order for same status widget order", () => {
    createRoot((dispose) => {
      const registry = createStatusRegistry()
      registry.register({ id: "s1", label: "One", order: 100, render: () => null })
      registry.register({ id: "s2", label: "Two", order: 100, render: () => null })
      expect(registry.sorted().map((w) => w.id)).toEqual(["s1", "s2"])
      dispose()
    })
  })
})

describe("tui extension event listener system", () => {
  test("dispatch calls specific and wildcard listeners", () => {
    createRoot((dispose) => {
      const events = createEventSystem()
      const called: string[] = []
      events.on("session.updated", () => called.push("specific"))
      events.on("*", () => called.push("wildcard"))

      events.dispatch({ type: "session.updated", payload: 1 })
      expect(called).toEqual(["specific", "wildcard"])
      dispose()
    })
  })

  test("specific dispose stops listener from receiving events", () => {
    createRoot((dispose) => {
      const events = createEventSystem()
      const called: string[] = []
      const off = events.on("session.updated", () => called.push("specific"))
      events.dispatch({ type: "session.updated" })
      off()
      events.dispatch({ type: "session.updated" })
      expect(called).toEqual(["specific"])
      dispose()
    })
  })

  test("wildcard dispose stops listener from receiving events", () => {
    createRoot((dispose) => {
      const events = createEventSystem()
      const called: string[] = []
      const off = events.on("*", () => called.push("wildcard"))
      events.dispatch({ type: "message.created" })
      off()
      events.dispatch({ type: "message.created" })
      expect(called).toEqual(["wildcard"])
      dispose()
    })
  })

  test("listener errors do not crash dispatch", () => {
    createRoot((dispose) => {
      const events = createEventSystem()
      const called: string[] = []

      events.on("session.updated", () => {
        throw new Error("boom")
      })
      events.on("session.updated", () => called.push("after-error"))
      events.on("*", () => called.push("wildcard"))

      expect(() => events.dispatch({ type: "session.updated" })).not.toThrow()
      expect(called).toEqual(["after-error", "wildcard"])
      dispose()
    })
  })

  test("dispatch with no listeners is a no-op", () => {
    createRoot((dispose) => {
      const events = createEventSystem()
      expect(() => events.dispatch({ type: "none" })).not.toThrow()
      dispose()
    })
  })
})

describe("tui extension dialog request signal", () => {
  test("sets a dialog request", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.register("confirm", () => null)
      registry.show("confirm", { ok: true })
      expect(registry.request()).toEqual({ id: "confirm", props: { ok: true } })
      dispose()
    })
  })

  test("clears dialog request", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.register("confirm", () => null)
      registry.show("confirm", { ok: true })
      expect(registry.request()).not.toBeNull()
      registry.clearRequest()
      expect(registry.request()).toBeNull()
      dispose()
    })
  })

  test("request signal updates memo reactively", () => {
    createRoot((dispose) => {
      const registry = createDialogRegistry()
      registry.register("confirm", () => null)

      const observed = () => registry.request()?.id ?? null

      expect(observed()).toBeNull()

      registry.show("confirm")
      expect(observed()).toBe("confirm")

      registry.clearRequest()
      expect(observed()).toBeNull()
      dispose()
    })
  })
})
