import logging
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
mcp = FastMCP("example-mcp-server")


@mcp.tool()
def echo(text: str) -> str:
    logging.info("[echo] text=%s", text)
    return text


if __name__ == "__main__":
    mcp.run()
