import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBytes, timeAgo } from "@/lib/format";

afterEach(() => vi.useRealTimers());

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("timeAgo", () => {
  it("describes recent and older times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    expect(timeAgo("2026-10-10T11:59:50Z")).toBe("just now");
    expect(timeAgo("2026-10-10T11:55:00Z")).toBe("5 minutes ago");
    expect(timeAgo("2026-10-10T09:00:00Z")).toBe("3 hours ago");
    expect(timeAgo("2026-10-08T12:00:00Z")).toBe("2 days ago");
  });
});
