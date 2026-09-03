import { describe, it, expect } from "vitest";
import {
  collectSenders,
  matchesFilters,
  groupByDay,
  formatDayHeading,
  EMPTY_RESOURCE_FILTERS,
  hasActiveFilters,
  type FilterableResource,
} from "./resourceFilter";

const item = (
  senderId: string,
  senderName: string,
  createdAt: string,
  senderAvatarUrl?: string | null,
): FilterableResource => ({
  senderId,
  senderName,
  createdAt,
  senderAvatarUrl,
});

describe("collectSenders", () => {
  it("de-duplicates by id and sorts by name", () => {
    expect(
      collectSenders([
        item("u2", "Bình", "2026-08-13T09:00:00+07:00"),
        item("u1", "An", "2026-08-13T10:00:00+07:00"),
        item("u2", "Bình", "2026-08-12T10:00:00+07:00"),
      ]),
    ).toEqual([
      { id: "u1", name: "An", avatarUrl: null },
      { id: "u2", name: "Bình", avatarUrl: null },
    ]);
  });

  it("keeps the avatar when the first row for a sender lacks one", () => {
    // Link items carry no avatar, so a later media/file row must fill it in.
    const senders = collectSenders([
      item("u1", "An", "2026-08-13T10:00:00+07:00", null),
      item("u1", "An", "2026-08-13T11:00:00+07:00", "https://cdn/a.png"),
    ]);
    expect(senders).toEqual([
      { id: "u1", name: "An", avatarUrl: "https://cdn/a.png" },
    ]);
  });

  it("returns an empty list for no items", () => {
    expect(collectSenders([])).toEqual([]);
  });
});

describe("matchesFilters", () => {
  const target = item("u1", "An", "2026-08-13T10:00:00+07:00");

  it("keeps everything when no filter is active", () => {
    expect(matchesFilters(target, EMPTY_RESOURCE_FILTERS)).toBe(true);
  });

  it("filters by sender", () => {
    expect(
      matchesFilters(target, { ...EMPTY_RESOURCE_FILTERS, senderId: "u1" }),
    ).toBe(true);
    expect(
      matchesFilters(target, { ...EMPTY_RESOURCE_FILTERS, senderId: "u2" }),
    ).toBe(false);
  });

  it("treats the range bounds as inclusive", () => {
    const onBothEdges = {
      senderId: null,
      from: "2026-08-13",
      to: "2026-08-13",
    };
    expect(matchesFilters(target, onBothEdges)).toBe(true);
  });

  it("excludes days outside the range", () => {
    expect(
      matchesFilters(target, { senderId: null, from: "2026-08-14", to: null }),
    ).toBe(false);
    expect(
      matchesFilters(target, { senderId: null, from: null, to: "2026-08-12" }),
    ).toBe(false);
  });

  it("combines sender and range with AND", () => {
    expect(
      matchesFilters(target, {
        senderId: "u1",
        from: "2026-08-13",
        to: "2026-08-13",
      }),
    ).toBe(true);
    expect(
      matchesFilters(target, {
        senderId: "u2",
        from: "2026-08-13",
        to: "2026-08-13",
      }),
    ).toBe(false);
  });

  it("drops items with an unparseable date once a range is set", () => {
    const broken = item("u1", "An", "not-a-date");
    expect(matchesFilters(broken, EMPTY_RESOURCE_FILTERS)).toBe(true);
    expect(
      matchesFilters(broken, { senderId: null, from: "2026-08-01", to: null }),
    ).toBe(false);
  });
});

describe("hasActiveFilters", () => {
  it("is false only for the empty filter set", () => {
    expect(hasActiveFilters(EMPTY_RESOURCE_FILTERS)).toBe(false);
    expect(
      hasActiveFilters({ ...EMPTY_RESOURCE_FILTERS, senderId: "u1" }),
    ).toBe(true);
    expect(
      hasActiveFilters({ ...EMPTY_RESOURCE_FILTERS, to: "2026-08-01" }),
    ).toBe(true);
  });
});

describe("groupByDay", () => {
  it("splits items across their own days, newest first", () => {
    const groups = groupByDay([
      item("u1", "An", "2026-08-12T08:00:00+07:00"),
      item("u1", "An", "2026-08-13T09:00:00+07:00"),
      item("u2", "Bình", "2026-08-13T23:30:00+07:00"),
    ]);
    expect(groups.map((g) => g.iso)).toEqual(["2026-08-13", "2026-08-12"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it("keeps undated items in their own trailing group", () => {
    const groups = groupByDay([
      item("u1", "An", "nonsense"),
      item("u1", "An", "2026-08-13T09:00:00+07:00"),
    ]);
    expect(groups.map((g) => g.iso)).toEqual(["2026-08-13", ""]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("formatDayHeading", () => {
  it("labels a day in the current year without the year", () => {
    const thisYear = new Date().getFullYear();
    expect(formatDayHeading(`${thisYear}-08-13`)).toBe("Ngày 13 tháng 8");
  });

  it("includes the year for other years", () => {
    expect(formatDayHeading("2019-08-13")).toContain("2019");
  });

  it("labels undated groups", () => {
    expect(formatDayHeading("")).toBe("Không rõ ngày");
  });
});
