import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "example-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "echo",
  {
    description: "입력 텍스트를 그대로 반환합니다.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  async (args) => {
    console.error("[echo] args:", args);
    const text = z.string().parse((args as any).text);

    return { content: [{ type: "text", text }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server started (stdio).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
