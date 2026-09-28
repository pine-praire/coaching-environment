import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("hides the password by default and toggles visibility", () => {
    render(<PasswordInput id="p" defaultValue="secret" />);
    const input = document.getElementById("p") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("secret");

    fireEvent.click(screen.getByRole("button", { name: "Скрыть пароль" }));
    expect(input.type).toBe("password");
  });

  it("toggle button does not submit the form", () => {
    let submitted = false;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted = true;
        }}
      >
        <PasswordInput id="p" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(submitted).toBe(false);
  });
});
