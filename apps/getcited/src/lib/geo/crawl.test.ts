import { describe, it, expect } from "vitest";
import { robotsAllows } from "./robots";

describe("robotsAllows", () => {
  const robots = `User-agent: *
Disallow: /private
Disallow: /admin

User-agent: BadBot
Disallow: /`;

  it("allows paths not disallowed", () => {
    expect(robotsAllows(robots, "/blog/best-tools", "GetCitedBot/1.0")).toBe(true);
  });

  it("blocks disallowed paths for *", () => {
    expect(robotsAllows(robots, "/private/x", "GetCitedBot/1.0")).toBe(false);
    expect(robotsAllows(robots, "/admin", "GetCitedBot/1.0")).toBe(false);
  });

  it("allows everything when robots.txt is empty", () => {
    expect(robotsAllows("", "/anything", "GetCitedBot/1.0")).toBe(true);
  });

  it("honors a UA-specific full disallow", () => {
    expect(robotsAllows(robots, "/blog", "BadBot")).toBe(false);
  });
});
