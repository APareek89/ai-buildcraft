/** Hono environment: `projectId` is set by the requireProject middleware (auth.ts). */
export type Env = { Variables: { projectId: string } };
