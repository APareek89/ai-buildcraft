import { eq } from "drizzle-orm";
import { getDb, projects } from "@blindspot/db";

/** Basic project identity for the dashboard's whoami / sign-in-with-key screen. */
export async function getProject(projectId: string) {
  const row = (
    await getDb()
      .select({
        id: projects.id,
        name: projects.name,
        userId: projects.userId,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
  )[0];
  return row ?? null;
}
