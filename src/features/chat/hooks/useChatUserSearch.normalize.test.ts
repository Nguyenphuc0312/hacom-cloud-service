import { describe, expect, it } from "vitest";

import {
  matchesFriendQuery,
  normalizeSearchUser,
  type ChatSearchUser,
} from "./useChatUserSearch";

describe("normalizeSearchUser friendship contract", () => {
  it("forces accepted when isFriend=true and disables add friend", () => {
    expect(
      normalizeSearchUser({
        id: "u1",
        username: "alice",
        displayName: "Alice",
        isFriend: true,
        canAddFriend: true,
        friendshipStatus: "none",
      }),
    ).toEqual(
      expect.objectContaining({
        isFriend: true,
        canAddFriend: false,
        friendshipStatus: "accepted",
      }),
    );
  });

  it("does not allow add friend for pending search rows", () => {
    expect(
      normalizeSearchUser({
        id: "u1",
        username: "alice",
        displayName: "Alice",
        isFriend: false,
        canAddFriend: true,
        friendshipStatus: "pending",
      }),
    ).toEqual(
      expect.objectContaining({
        isFriend: false,
        canAddFriend: false,
        friendshipStatus: "pending",
      }),
    );
  });
});

describe("search aliases", () => {
  const friend: ChatSearchUser = {
    id: "u1",
    username: "HC000296",
    displayName: "Nguyễn Minh Quang",
    fullName: "Nguyễn Minh Quang",
    avatarUrl: null,
    status: null,
    employeeCode: "HC000296",
    departmentName: "Văn phòng Tổng công ty",
    unitCode: "VPTCT",
    title: "Chuyên viên",
    alias: "VPTCT-Nguyễn Minh Quang",
    isFriend: true,
    canAddFriend: false,
    friendshipStatus: "accepted",
  };

  it("giữ tên gợi nhớ từ kết quả API", () => {
    expect(
      normalizeSearchUser({
        id: "u1",
        username: "HC000296",
        displayName: "Nguyễn Minh Quang",
        alias: friend.alias,
      }),
    ).toEqual(expect.objectContaining({ alias: friend.alias }));
  });

  it("tìm được bằng tên gợi nhớ có hoặc không dấu", () => {
    expect(matchesFriendQuery(friend, "VPTCT-Nguyễn Minh Quang")).toBe(true);
    expect(matchesFriendQuery(friend, "vptct nguyen minh quang")).toBe(true);
  });

  it("tìm được bằng mã và đơn vị", () => {
    expect(matchesFriendQuery(friend, "@HC000296")).toBe(true);
    expect(matchesFriendQuery(friend, "van phong tong cong ty")).toBe(true);
  });

  it("không khớp subsequence nhiễu", () => {
    expect(matchesFriendQuery(friend, "hc000975")).toBe(false);
  });
});
