import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Markdown from "@/components/Markdown";

describe("Markdown", () => {
  it("turns [n] markers into buttons that open the source", async () => {
    const onCite = vi.fn();
    render(<Markdown text="Batteries are cheaper [1][2]." onCite={onCite} />);
    await userEvent.click(screen.getByRole("button", { name: "Open source 2" }));
    expect(onCite).toHaveBeenCalledWith(2);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("never renders raw HTML from the model or from web pages", () => {
    const { container } = render(<Markdown text={'<script>alert(1)</script><img src=x onerror="alert(2)">'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("opens external links safely", () => {
    render(<Markdown text="[docs](https://example.com)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders lists, tables and code", () => {
    render(<Markdown text={"- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`inline`"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("inline").tagName).toBe("CODE");
  });
});
