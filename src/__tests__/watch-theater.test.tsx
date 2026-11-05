import { act, fireEvent, render, screen } from "@testing-library/react";
import WatchTheater from "@/components/player/WatchTheater";
import { dictionaries } from "@/i18n/dictionaries";

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: dictionaries.es }),
}));

describe("fullscreen with chat", () => {
  let fullscreenElement: Element | null;
  let requestFullscreen: jest.Mock;
  let exitFullscreen: jest.Mock;
  const originalElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  const originalRequest = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "requestFullscreen");
  const originalExit = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
  const t = dictionaries.es.watch;

  const renderTheater = () => render(
    <WatchTheater title="Boca vs River" chat={<input aria-label="Chat draft" defaultValue="Vamos" />}>
      <iframe title="Match video" src="about:blank" />
    </WatchTheater>
  );

  beforeEach(() => {
    fullscreenElement = null;
    requestFullscreen = jest.fn(() => {
      fullscreenElement = document.querySelector(".watch-theater");
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    exitFullscreen = jest.fn(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
  });

  afterEach(() => {
    for (const [target, key, descriptor] of [
      [document, "fullscreenElement", originalElement],
      [HTMLElement.prototype, "requestFullscreen", originalRequest],
      [document, "exitFullscreen", originalExit],
    ] as const) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    }
    document.body.classList.remove("watch-theater-open");
  });

  it("expands the common container and hides/shows chat without recreating the video or draft", async () => {
    renderTheater();
    const video = screen.getByTitle("Match video");
    const draft = screen.getByRole("textbox", { name: "Chat draft" });
    fireEvent.change(draft, { target: { value: "Gol!" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.fullscreenWithChat })); });
    expect(fullscreenElement).toContainElement(video);
    expect(fullscreenElement).toContainElement(draft);
    expect(requestFullscreen.mock.contexts[0]).toBe(fullscreenElement);
    expect(document.body).toHaveClass("watch-theater-open");

    fireEvent.click(screen.getByRole("button", { name: t.hideChat }));
    expect(draft).not.toBeVisible();
    expect(screen.getByTitle("Match video")).toBe(video);
    fireEvent.click(screen.getByRole("button", { name: t.showChat }));
    expect(draft).toBeVisible();
    expect(draft).toHaveValue("Gol!");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.exitFullscreenChat })); });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveClass("watch-theater-open");
    expect(screen.getByTitle("Match video")).toBe(video);
  });

  it("restores the normal layout after the browser exits native fullscreen", async () => {
    renderTheater();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.fullscreenWithChat })); });
    act(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByRole("button", { name: t.fullscreenWithChat })).toHaveAttribute("aria-pressed", "false");
    expect(document.body).not.toHaveClass("watch-theater-open");
  });

  it("keeps theater state while a nested player enters its own fullscreen", async () => {
    renderTheater();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.fullscreenWithChat })); });
    act(() => {
      fullscreenElement = screen.getByTitle("Match video");
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByRole("button", { name: t.exitFullscreenChat })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers a viewport fallback when fullscreen is denied and closes it with Escape", async () => {
    requestFullscreen.mockRejectedValue(new Error("Denied"));
    renderTheater();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.fullscreenWithChat })); });
    expect(document.body).toHaveClass("watch-theater-open");
    expect(screen.getByRole("textbox", { name: "Chat draft" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body).not.toHaveClass("watch-theater-open");
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it("cleans up fullscreen and page scrolling when navigating away", async () => {
    const { unmount } = renderTheater();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.fullscreenWithChat })); });
    unmount();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveClass("watch-theater-open");
  });
});
