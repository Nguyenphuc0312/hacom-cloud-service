import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarkdownContent from "./MarkdownContent";
import { MessageContentRenderer } from "./MessageContentRenderer";
import { TextMessage } from "./TextMessage";

describe("shift-code presentation boundaries", () => {
  it("renders shift codes as ordinary text in plain chat messages", () => {
    const { container } = render(
      <TextMessage content="HC2 vh1 CT ca hc2 là sao" isOwn={false} />,
    );

    expect(screen.getByText("HC2 vh1 CT ca hc2 là sao")).toBeTruthy();
    expect(container.querySelector("button[data-shift-code]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps shift codes plain while preserving rich-text formatting", () => {
    const { container } = render(
      <MessageContentRenderer
        content="<p>Ca <strong>HC2</strong>, vh1 và CT.</p><p></p>"
        contentFormat="rich_text"
        isOwn={false}
      />,
    );

    expect(screen.getByText("HC2").tagName).toBe("STRONG");
    expect(container.textContent).toContain("Ca HC2, vh1 và CT.");
    expect(container.querySelector("button[data-shift-code]")).toBeNull();
    expect(container.querySelector("p:empty")).toBeTruthy();
    expect(container.querySelector(".message-rich-content")?.className).toContain(
      "[&_p:empty]:min-h-[21px]",
    );
  });

  it("keeps shift codes plain while preserving markdown formatting", () => {
    const { container } = render(
      <MarkdownContent content="**HC2** vh1 CT" isOwn={false} />,
    );

    expect(screen.getByText("HC2").tagName).toBe("STRONG");
    expect(container.textContent).toContain("HC2 vh1 CT");
    expect(container.querySelector("button[data-shift-code]")).toBeNull();
  });
});
