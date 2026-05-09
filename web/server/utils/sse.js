export function openSseStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.flushHeaders?.();

  const send = (eventName, payload) => {
    response.write(`event: ${eventName}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const closeWith = (unsubscribe) => {
    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  };

  return { closeWith, send };
}
