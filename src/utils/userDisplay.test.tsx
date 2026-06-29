import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RoomMemberRole } from "../types";
import { MemberRoleBadge } from "../features/chat/components/group-members/MemberRoleBadge";
import { getSafeUserPosition, shouldShowUserPosition } from "./userDisplay";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("user display helpers", () => {
  it("does not expose user position while SHOW_USER_POSITION is disabled", () => {
    expect(shouldShowUserPosition()).toBe(false);
    expect(
      getSafeUserPosition({
        position: "Backend Architect",
        jobTitle: "Engineering Manager",
        job_title: "Lead",
        employeeTitle: "Director",
        designation: "Principal",
      }),
    ).toBeNull();
  });

  it("does not treat generic title as a user position fallback", () => {
    expect(getSafeUserPosition({ title: "Backend Architect" })).toBeNull();
  });

  it("keeps group permission role badges visible", () => {
    render(<MemberRoleBadge role={RoomMemberRole.ADMIN} />);

    expect(screen.getByText("profile:groupInfo.roles.admin")).toBeTruthy();
  });
});
