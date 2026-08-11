export type ResourceDeleteMode = "FOR_ME" | "FOR_EVERYONE";

export interface ResourceDeleteMenuItem {
  mode: ResourceDeleteMode;
  label: string;
}

export const buildResourceDeleteMenuItems = (
  isPersonalCloud: boolean,
  recallLabel: string,
): ResourceDeleteMenuItem[] => {
  if (isPersonalCloud) {
    return [{ mode: "FOR_ME", label: "Xóa" }];
  }

  return [
    { mode: "FOR_ME", label: "Xóa chỉ ở phía tôi" },
    { mode: "FOR_EVERYONE", label: recallLabel },
  ];
};
