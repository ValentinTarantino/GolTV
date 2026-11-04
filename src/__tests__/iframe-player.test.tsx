import { act, fireEvent, render, screen } from "@testing-library/react";
import IframePlayer from "@/components/player/IframePlayer";
import { parseIframeChannels } from "@/components/player/useIframeChannelBridge";
import type { Channel } from "@/lib/types";

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: { player: {
    adBlockerTip: "Tip", loadingStream: "Loading", externalLoadTimeout: "Choose another signal", retry: "Retry", errorLoading: "Unavailable",
  } } }),
}));
jest.mock("@/components/ui/FootballLoader", () => ({ __esModule: true, default: () => null }));

describe("external player loading", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("accepts signals only from the current provider frame and switches without reloading it", () => {
    const url = "https://example.com/player.html?mdata=123";
    const channel: Channel = { id: "embed-test", name: "Canal de prueba", provider: "iframe-bridge", url, kind: "iframe" };
    const onChannels = jest.fn();
    const { rerender } = render(<IframePlayer url={url} title="Match" channel={channel} onChannels={onChannels} />);
    const frame = screen.getByTitle("Match") as HTMLIFrameElement;
    const list = [{ streamId: 11, siteType: 2001, name: "ESPN" }, { streamId: 22, siteType: 2001, name: "TyC" }];
    const data = { msgEventType: "FROM_IFRAME_PLAYER", val: { evType: 104, _cStreamList: list } };
    const send = (origin: string, source: MessageEventSource | null) => act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin, source, data }));
    });
    send("https://attacker.example", frame.contentWindow);
    send("https://example.com", window);
    expect(onChannels).not.toHaveBeenCalled();
    send("https://example.com", frame.contentWindow);
    expect(onChannels.mock.calls[0][0].map((c: Channel) => c.name)).toEqual(["ESPN", "TyC"]);
    const post = jest.spyOn(frame.contentWindow!, "postMessage");
    rerender(<IframePlayer url={url} title="Match" channel={onChannels.mock.calls[0][0][1]} onChannels={onChannels} />);
    expect(screen.getByTitle("Match")).toBe(frame);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ val: expect.objectContaining({
      _si: expect.objectContaining({ streamId: 22, siteType: 2001 }),
    }) }), "https://example.com");
    post.mockRestore();
  });

  it("deduplicates signals, ignores invalid identifiers and keeps the trusted embed URL", () => {
    const rows = parseIframeChannels([
      { streamId: 1, siteType: 2, name: "One", url: "https://attacker.example" },
      { streamId: 1, siteType: 2, name: "Duplicate" },
      { streamId: 1, siteType: 3, name: "Other server" },
      { streamId: "2", siteType: 2 }, null,
    ], "https://example.com/player");
    expect(rows).toHaveLength(2);
    expect(rows.every(c => c.url === "https://example.com/player")).toBe(true);
  });

  it("stops indefinite loading and allows retry when an iframe never loads", () => {
    render(<IframePlayer url="https://example.com/embed" title="Match" />);
    const frame = screen.getByTitle("Match");
    act(() => jest.advanceTimersByTime(15000));
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Choose another signal");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.getByTitle("Match")).not.toBe(frame);
  });

  it("starts a fresh loading cycle when the channel URL changes", () => {
    const { rerender } = render(<IframePlayer url="https://example.com/one" title="Match" />);
    fireEvent.load(screen.getByTitle("Match"));
    act(() => jest.advanceTimersByTime(15000));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<IframePlayer url="https://example.com/two" title="Match" />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(15000));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("keeps Player 1 signals on their published URL without sandbox", () => {
    const channel: Channel = {
      id: "secondary-test",
      name: "Canal de prueba",
      provider: "secondary-feed",
      url: "https://example.com/embed",
      kind: "iframe",
    };
    render(<IframePlayer url={channel.url} title="Match" channel={channel} />);
    const frame = screen.getByTitle("Match");
    expect(frame).toHaveAttribute("src", channel.url);
    expect(frame).not.toHaveAttribute("sandbox");
  });
});
