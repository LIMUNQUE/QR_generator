import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App Component", () => {
  test("renders the main layout", () => {
    render(<App />);
    expect(screen.getByText(/QR STUDIO/i)).toBeInTheDocument();
  });
});
