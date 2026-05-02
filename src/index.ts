import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    ok: true,
    name: "spontai-api",
    version: "0.0.1",
  }),
);

export default app;
