import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { useClickOutside } from "./useClickOutside";

const mount = () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useClickOutside", () => {
  it("đóng khi mousedown ngoài ref, giữ nguyên khi bấm trong", () => {
    const inside = mount();
    const outside = mount();
    const onDismiss = vi.fn();
    renderHook(() => useClickOutside({ current: inside }, onDismiss));

    fireEvent.mouseDown(inside);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(outside);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("nhiều ref: chỉ đóng khi ngoài TẤT CẢ (anchor + popover)", () => {
    const anchor = mount();
    const popover = mount();
    const outside = mount();
    const onDismiss = vi.fn();
    renderHook(() =>
      useClickOutside([{ current: anchor }, { current: popover }], onDismiss),
    );

    fireEvent.mouseDown(popover);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(outside);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("escape: chỉ đóng bằng Escape khi bật option", () => {
    const el = mount();
    const plain = vi.fn();
    const withEscape = vi.fn();
    renderHook(() => useClickOutside({ current: el }, plain));
    renderHook(() => useClickOutside({ current: el }, withEscape, { escape: true }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(plain).not.toHaveBeenCalled();
    expect(withEscape).toHaveBeenCalledTimes(1);
  });

  it("active=false: không gắn listener", () => {
    const el = mount();
    const outside = mount();
    const onDismiss = vi.fn();
    renderHook(() => useClickOutside({ current: el }, onDismiss, { active: false }));

    fireEvent.mouseDown(outside);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
