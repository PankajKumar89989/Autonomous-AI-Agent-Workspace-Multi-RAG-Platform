import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatusBadge from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["uploaded", "Queued"],
    ["processing", "Processing"],
    ["completed", "Indexed"],
    ["failed", "Failed"],
  ] as const)("shows a text label for %s (colour is never the only signal)", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
