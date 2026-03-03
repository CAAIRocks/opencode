import type {
  Event,
  createOpencodeClient,
  Project,
  Model,
  Provider,
  Permission,
  UserMessage,
  Message,
  Part,
  Auth,
  Config,
} from "@opencode-ai/sdk"

import type { BunShell } from "./shell"
import { type ToolDefinition } from "./tool"

export * from "./tool"

export type ProviderContext = {
  source: "env" | "config" | "custom" | "api"
  info: Provider
  options: Record<string, any>
}

export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>
  project: Project
  directory: string
  worktree: string
  serverUrl: URL
  $: BunShell
}

export type Plugin = (input: PluginInput) => Promise<Hooks>

export type AuthHook = {
  provider: string
  loader?: (auth: () => Promise<Auth>, provider: Provider) => Promise<Record<string, any>>
  methods: (
    | {
        type: "oauth"
        label: string
        prompts?: Array<
          | {
              type: "text"
              key: string
              message: string
              placeholder?: string
              validate?: (value: string) => string | undefined
              condition?: (inputs: Record<string, string>) => boolean
            }
          | {
              type: "select"
              key: string
              message: string
              options: Array<{
                label: string
                value: string
                hint?: string
              }>
              condition?: (inputs: Record<string, string>) => boolean
            }
        >
        authorize(inputs?: Record<string, string>): Promise<AuthOuathResult>
      }
    | {
        type: "api"
        label: string
        prompts?: Array<
          | {
              type: "text"
              key: string
              message: string
              placeholder?: string
              validate?: (value: string) => string | undefined
              condition?: (inputs: Record<string, string>) => boolean
            }
          | {
              type: "select"
              key: string
              message: string
              options: Array<{
                label: string
                value: string
                hint?: string
              }>
              condition?: (inputs: Record<string, string>) => boolean
            }
        >
        authorize?(inputs?: Record<string, string>): Promise<
          | {
              type: "success"
              key: string
              provider?: string
            }
          | {
              type: "failed"
            }
        >
      }
  )[]
}

export type AuthOuathResult = { url: string; instructions: string } & (
  | {
      method: "auto"
      callback(): Promise<
        | ({
            type: "success"
            provider?: string
          } & (
            | {
                refresh: string
                access: string
                expires: number
                accountId?: string
              }
            | { key: string }
          ))
        | {
            type: "failed"
          }
      >
    }
  | {
      method: "code"
      callback(code: string): Promise<
        | ({
            type: "success"
            provider?: string
          } & (
            | {
                refresh: string
                access: string
                expires: number
                accountId?: string
              }
            | { key: string }
          ))
        | {
            type: "failed"
          }
      >
    }
)

// --- TUI Extension Types ---

export interface TuiSidebarWidget {
  id: string
  label: string
  order?: number
  collapsible?: boolean
  render: () => any // JSX.Element - using any for framework-agnostic plugin API
}

export interface TuiCommandOption {
  title: string
  value: string
  description?: string
  category?: string
  keybind?: string
  slash?: { name: string; aliases?: string[] }
  suggested?: boolean
  hidden?: boolean
  onSelect?: () => void
}

export type TuiDialogFactory = (props?: Record<string, any>) => any // JSX.Element

export interface TuiStatusWidget {
  id: string
  label: string
  order?: number
  render: () => any // JSX.Element - terminal text content
}

export interface TuiExtensionInput {
  sidebar: {
    register(widget: TuiSidebarWidget): () => void
  }
  command: {
    register(options: TuiCommandOption[]): () => void
  }
  dialog: {
    register(id: string, factory: TuiDialogFactory): void
    show(id: string, props?: Record<string, any>): void
  }
  status: {
    register(widget: TuiStatusWidget): () => void
  }
  context: {
    readonly directory: string
    readonly session: () => any
    readonly messages: () => any[]
    readonly diffs: () => any[]
    readonly config: () => any
    onEvent(type: string, handler: (event: any) => void): () => void
  }
}

// --- Web Extension Types ---

export interface WebTabContribution {
  id: string
  label: string
  icon?: string
  order?: number
  component: () => any // SolidJS component
}

export interface WebToolbarContribution {
  id: string
  label: string
  icon: string
  order?: number
  onClick?: () => void
  component?: () => any // SolidJS component for custom rendering
}

export interface WebStatusBarContribution {
  id: string
  label: string
  order?: number
  healthy?: () => boolean
  component: () => any // SolidJS component
}

export interface WebSearchProviderContribution {
  id: string
  category: string
  search(query: string): Array<{
    id: string
    title: string
    description?: string
    onSelect: () => void
  }>
}

export interface WebSidebarWidgetContribution {
  id: string
  label: string
  order?: number
  component: () => any // SolidJS component
}

export interface WebContributions {
  tabs?: WebTabContribution[]
  toolbarButtons?: WebToolbarContribution[]
  statusBarItems?: WebStatusBarContribution[]
  searchProviders?: WebSearchProviderContribution[]
  sidebarWidgets?: WebSidebarWidgetContribution[]
}

export interface WebExtensionContext {
  readonly directory: () => string
  readonly session: () => any
  readonly messages: () => any[]
  readonly diffs: () => any[]
  readonly config: () => any
  readonly providers: () => any[]
  onEvent(type: string, handler: (event: any) => void): () => void
  command: {
    trigger(id: string): void
    register(options: any[]): () => void
  }
  sdk: {
    session: {
      prompt(input: { sessionID: string; content: string }): Promise<any>
      command(input: { sessionID: string; command: string }): Promise<any>
      fork(input: { sessionID: string }): Promise<any>
      delete(input: { sessionID: string }): Promise<any>
    }
  }
}

export interface Hooks {
  event?: (input: { event: Event }) => Promise<void>
  config?: (input: Config) => Promise<void>
  tool?: {
    [key: string]: ToolDefinition
  }
  auth?: AuthHook
  /**
   * Called when a new message is received
   */
  "chat.message"?: (
    input: {
      sessionID: string
      agent?: string
      model?: { providerID: string; modelID: string }
      messageID?: string
      variant?: string
    },
    output: { message: UserMessage; parts: Part[] },
  ) => Promise<void>
  /**
   * Modify parameters sent to LLM
   */
  "chat.params"?: (
    input: { sessionID: string; agent: string; model: Model; provider: ProviderContext; message: UserMessage },
    output: { temperature: number; topP: number; topK: number; options: Record<string, any> },
  ) => Promise<void>
  "chat.headers"?: (
    input: { sessionID: string; agent: string; model: Model; provider: ProviderContext; message: UserMessage },
    output: { headers: Record<string, string> },
  ) => Promise<void>
  "permission.ask"?: (input: Permission, output: { status: "ask" | "deny" | "allow" }) => Promise<void>
  "command.execute.before"?: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Part[] },
  ) => Promise<void>
  "tool.execute.before"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any },
  ) => Promise<void>
  "shell.env"?: (
    input: { cwd: string; sessionID?: string; callID?: string },
    output: { env: Record<string, string> },
  ) => Promise<void>
  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: {
      title: string
      output: string
      metadata: any
    },
  ) => Promise<void>
  "experimental.chat.messages.transform"?: (
    input: {},
    output: {
      messages: {
        info: Message
        parts: Part[]
      }[]
    },
  ) => Promise<void>
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string; model: Model },
    output: {
      system: string[]
    },
  ) => Promise<void>
  /**
   * Called before session compaction starts. Allows plugins to customize
   * the compaction prompt.
   *
   * - `context`: Additional context strings appended to the default prompt
   * - `prompt`: If set, replaces the default compaction prompt entirely
   */
  "experimental.session.compacting"?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => Promise<void>
  "experimental.text.complete"?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ) => Promise<void>
  /**
   * Modify tool definitions (description and parameters) sent to LLM
   */
  "tool.definition"?: (input: { toolID: string }, output: { description: string; parameters: any }) => Promise<void>
  /**
   * Called when the TUI initializes, providing access to TUI extension registries.
   * Only called in TUI mode (not web or desktop).
   */
  "tui.init"?: (input: TuiExtensionInput) => Promise<void>
  /**
   * Declares UI contributions for the web interface.
   * Called during plugin initialization to collect web UI extensions.
   */
  "web.init"?: (input: WebExtensionContext) => Promise<WebContributions | void>
}
