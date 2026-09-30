import { describe, expect, it } from "vitest";
import { can, permissionsFor } from "./rbac";

describe("rbac", () => {
  it("viewer is read-only", () => {
    expect(permissionsFor("VIEWER")).toEqual([]);
  });
  it("site engineer enters progress but cannot approve QC", () => {
    expect(can("SITE_ENGINEER", "progress.enter")).toBe(true);
    expect(can("SITE_ENGINEER", "qc.approve")).toBe(false);
  });
  it("only admin manages users", () => {
    expect(can("ADMIN", "users.manage")).toBe(true);
    expect(can("PROJECT_MANAGER", "users.manage")).toBe(false);
    expect(can(undefined, "users.manage")).toBe(false);
  });
});
