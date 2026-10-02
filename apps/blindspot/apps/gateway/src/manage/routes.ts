import { Hono } from "hono";
import {
  getRouteDetail,
  listRoutes,
  listTraces,
  removeCandidate,
  updateRoute,
} from "@blindspot/core";
import { RoutePatchSchema } from "@blindspot/shared";
import type { Env } from "../types";

/**
 * Route + trace management the dashboard needs (list/get/edit routes, remove a candidate,
 * list traces). Logic lives in @blindspot/core; these are thin handlers. Mounted under /v1.
 */
export const routesRouter = new Hono<Env>();

// list routes (paginated) with quality + cost + health
routesRouter.get("/routes", async (c) => {
  const result = await listRoutes(c.get("projectId"), {
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  return c.json(result);
});

// traces (paginated), optionally filtered to one route — must precede /routes/:name
routesRouter.get("/traces", async (c) => {
  const result = await listTraces(c.get("projectId"), {
    routeName: c.req.query("route"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  return c.json(result);
});

// one route's full detail: candidate pool + score series + golden sets + pending recs
routesRouter.get("/routes/:name", async (c) => {
  const detail = await getRouteDetail(c.get("projectId"), c.req.param("name"));
  if (!detail) return c.json({ error: { message: "route not found" } }, 404);
  return c.json(detail);
});

// edit policy bar / auto-approve
routesRouter.patch("/routes/:name", async (c) => {
  const parsed = RoutePatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { message: parsed.error.issues[0]?.message } }, 400);
  const updated = await updateRoute(c.get("projectId"), c.req.param("name"), parsed.data);
  if (!updated) return c.json({ error: { message: "route not found" } }, 404);
  return c.json({ route: updated });
});

// remove a candidate model from a route (never the live model)
routesRouter.delete("/routes/:name/candidates/:modelRef", async (c) => {
  const result = await removeCandidate(
    c.get("projectId"),
    c.req.param("name"),
    decodeURIComponent(c.req.param("modelRef")),
  );
  if (!result.ok) {
    const status = result.error === "route not found" ? 404 : 400;
    return c.json({ error: { message: result.error } }, status);
  }
  return c.json({ ok: true });
});
