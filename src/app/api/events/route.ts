export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (
        event: string,
        data: unknown
      ) => {
        const message =
          `event: ${event}\n` +
          `data: ${JSON.stringify(data)}\n\n`;

        controller.enqueue(
          encoder.encode(message)
        );
      };

      sendEvent("connected", {
        message: "SSE connection established",
      });

      const timer = setInterval(() => {
        sendEvent("heartbeat", {
          timestamp: new Date().toISOString(),
        });
      }, 5000);

      setTimeout(() => {
        clearInterval(timer);
        controller.close();
      }, 30000);

      return () => {
        clearInterval(timer);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}