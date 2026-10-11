import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthForm from "@/components/AuthForm";
import { ApiError } from "@/lib/api";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
const login = vi.fn();
const register = vi.fn();
vi.mock("@/lib/auth", () => ({ login: (...a: unknown[]) => login(...a), register: (...a: unknown[]) => register(...a) }));

beforeEach(() => vi.clearAllMocks());

describe("AuthForm", () => {
  it("signs in and goes to the dashboard", async () => {
    login.mockResolvedValue(undefined);
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Secret123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(login).toHaveBeenCalledWith("ada@example.com", "Secret123");
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the server's error message and stays on the page", async () => {
    login.mockRejectedValue(new ApiError("INVALID_CREDENTIALS", "Incorrect email or password.", 401));
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("registration asks for a name and explains the password rule", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByText(/8\+ characters with letters and numbers/)).toBeInTheDocument();
  });
});
