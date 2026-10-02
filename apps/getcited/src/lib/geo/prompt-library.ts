export interface PromptSet {
  id: string;
  name: string;
  prompts: string[];
}

/** Built-in buyer-intent prompt sets. Seeds the free landing-page mock audit. */
export const BUILTIN_PROMPT_SETS: Record<string, PromptSet> = {
  demo: {
    id: "demo",
    name: "Team tools — buyer intent (demo)",
    prompts: [
      "What's the best issue tracker for a fast-moving software team?",
      "Which project management tool works best for remote teams?",
      "Recommend a tool to plan sprints and track team workload.",
      "Best way to manage tasks across multiple product teams?",
    ],
  },
};

export function resolvePromptSet(id: string): PromptSet | null {
  return BUILTIN_PROMPT_SETS[id] ?? null;
}
