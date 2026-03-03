import type { Plugin } from "@opencode-ai/plugin"

const ExampleTuiExtension: Plugin = async () => {
  let buildStatus = "idle"
  const buildLog: string[] = ["Build system ready."]
  let fileChangeCount = 0

  return {
    "tui.init": async (tui) => {
      tui.sidebar.register({
        id: "build-status",
        label: "Build Status",
        order: 50,
        collapsible: true,
        render: () => ({
          type: "box",
          props: {},
          children: [
            {
              type: "text",
              props: {
                fg: buildStatus === "idle" ? "#808080" : buildStatus === "running" ? "#fab283" : "#4ade80",
              },
              children: `Status: ${buildStatus}`,
            },
            {
              type: "text",
              props: { fg: "#808080" },
              children: `Files changed: ${fileChangeCount}`,
            },
            {
              type: "text",
              props: { fg: "#808080" },
              children: `Log entries: ${buildLog.length}`,
            },
          ],
        }),
      })

      tui.command.register([
        {
          title: "Show Build Log",
          value: "ext.build.log",
          category: "Build",
          description: "View the build output log",
          slash: { name: "buildlog" },
          onSelect: () => {
            tui.dialog.show("build-log")
          },
        },
        {
          title: "Run Build",
          value: "ext.build.run",
          category: "Build",
          description: "Start a new build",
          slash: { name: "build" },
          onSelect: () => {
            buildStatus = "running"
            buildLog.push(`[${new Date().toISOString()}] Build started...`)
            setTimeout(() => {
              buildStatus = "success"
              buildLog.push(`[${new Date().toISOString()}] Build completed successfully.`)
            }, 2000)
          },
        },
      ])

      tui.dialog.register("build-log", () => ({
        type: "box",
        props: { flexDirection: "column", gap: 1 },
        children: [
          {
            type: "text",
            props: { fg: "#ffffff" },
            children: "Build Log",
          },
          ...buildLog.map((line) => ({
            type: "text",
            props: { fg: "#808080" },
            children: line,
          })),
        ],
      }))

      tui.status.register({
        id: "build-status",
        label: "Build",
        order: 10,
        render: () => {
          const statusColors: Record<string, string> = {
            idle: "#808080",
            running: "#fab283",
            success: "#4ade80",
            failed: "#f87171",
          }

          return {
            type: "text",
            props: { fg: statusColors[buildStatus] || "#808080" },
            children: `⚡ ${buildStatus}`,
          }
        },
      })

      tui.context.onEvent("file.changed", (event) => {
        fileChangeCount++
        buildLog.push(`[${new Date().toISOString()}] File changed: ${event?.properties?.path ?? "unknown"}`)
      })
    },
  }
}

export default ExampleTuiExtension
