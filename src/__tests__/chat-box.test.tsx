import { act, fireEvent, render, screen } from "@testing-library/react";
import ChatBox from "@/components/chat/ChatBox";
import { dictionaries } from "@/i18n/dictionaries";

jest.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: dictionaries.es }) }));

const t = dictionaries.es.chat;
const originalFetch = global.fetch;
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
const first = { id: "first", nick: "OtroHincha", text: "¡Vamos equipo!", ts: 1, nickColor: "#00ffff", textColor: "#ff8800" };

describe("public chat and message colors", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: jest.fn() });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [first], persistent: true }) });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  });
  const loadMessages = async () => { await act(async () => { jest.advanceTimersByTime(0); }); };
  const selectColor = (label: string, name: string) => {
    fireEvent.click(screen.getByRole("combobox", { name: label }));
    fireEvent.click(screen.getByRole("option", { name }));
  };

  it("loads and polls messages before choosing a nickname", async () => {
    render(<ChatBox matchId="123" />);
    await loadMessages();
    expect(screen.getByRole("log")).toHaveTextContent(first.text);
    expect(screen.getByLabelText(t.nickPlaceholder)).toBeInTheDocument();
    expect(screen.queryByLabelText(t.placeholder)).not.toBeInTheDocument();
    expect(screen.getByText("OtroHincha:")).toHaveStyle({ color: "#00ffff" });
    expect(screen.getByText(first.text)).toHaveStyle({ color: "#ff8800" });
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith("/api/chat?matchId=123&offset=1", { cache: "no-store" });
  });

  it("keeps reading history on joining, saves preferences and sends both selected colors", async () => {
    render(<ChatBox matchId="123" />);
    await loadMessages();
    selectColor(t.nickColor, t.colors.magenta);
    selectColor(t.textColor, t.colors.green);
    fireEvent.change(screen.getByLabelText(t.nickPlaceholder), { target: { value: "Fan" } });
    fireEvent.click(screen.getByRole("button", { name: t.enterButton }));
    expect(screen.getByRole("log")).toHaveTextContent(first.text);
    expect(localStorage.getItem("goltv-chat-nick-color")).toBe("#ff00ff");
    expect(localStorage.getItem("goltv-chat-text-color")).toBe("#00ff00");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(t.placeholder), { target: { value: "Gol!" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.sendButton })); });
    expect(global.fetch).toHaveBeenCalledWith("/api/chat", expect.objectContaining({
      method: "POST", body: JSON.stringify({ matchId: "123", nick: "Fan", text: "Gol!", nickColor: "#ff00ff", textColor: "#00ff00" }),
    }));
  });

  it("restores saved colors when the chat mounts again", () => {
    localStorage.setItem("goltv-chat-nick-color", "#ff00ff");
    localStorage.setItem("goltv-chat-text-color", "#00ff00");
    render(<ChatBox matchId="123" />);
    expect(screen.getByLabelText(t.nickColor)).toHaveAttribute("data-value", "#ff00ff");
    expect(screen.getByLabelText(t.textColor)).toHaveAttribute("data-value", "#00ff00");
  });

  it("changes the nickname without losing history, colors or the message draft, and supports cancel", async () => {
    localStorage.setItem("goltv-chat-nick", "OldFan");
    localStorage.setItem("goltv-chat-nick-color", "#ff00ff");
    localStorage.setItem("goltv-chat-text-color", "#00ff00");
    render(<ChatBox matchId="123" />);
    await loadMessages();
    fireEvent.change(screen.getByLabelText(t.placeholder), { target: { value: "Mi mensaje" } });
    fireEvent.click(screen.getByRole("button", { name: t.changeNick }));
    expect(screen.getByLabelText(t.nickPlaceholder)).toHaveValue("OldFan");
    expect(screen.getByLabelText(t.nickPlaceholder)).toHaveFocus();
    fireEvent.change(screen.getByLabelText(t.nickPlaceholder), { target: { value: "DiscardedFan" } });
    fireEvent.click(screen.getByRole("button", { name: t.cancelNickChange }));
    expect(localStorage.getItem("goltv-chat-nick")).toBe("OldFan");
    expect(screen.getByLabelText(t.placeholder)).toHaveValue("Mi mensaje");

    fireEvent.click(screen.getByRole("button", { name: t.changeNick }));
    fireEvent.change(screen.getByLabelText(t.nickPlaceholder), { target: { value: "NewFan" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveNick }));
    expect(localStorage.getItem("goltv-chat-nick")).toBe("NewFan");
    expect(screen.getByRole("log")).toHaveTextContent(first.text);
    expect(screen.getByLabelText(t.placeholder)).toHaveValue("Mi mensaje");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.sendButton })); });
    expect(global.fetch).toHaveBeenCalledWith("/api/chat", expect.objectContaining({
      method: "POST", body: JSON.stringify({ matchId: "123", nick: "NewFan", text: "Mi mensaje", nickColor: "#ff00ff", textColor: "#00ff00" }),
    }));
  });

  it("retains the previous nickname when an invalid change is submitted", () => {
    localStorage.setItem("goltv-chat-nick", "OldFan");
    render(<ChatBox matchId="123" />);
    fireEvent.click(screen.getByRole("button", { name: t.changeNick }));
    fireEvent.change(screen.getByLabelText(t.nickPlaceholder), { target: { value: "Invalid!" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveNick }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.invalidNick);
    expect(localStorage.getItem("goltv-chat-nick")).toBe("OldFan");
  });

  it("replaces previously saved black and gray selections with the default palette colors", () => {
    localStorage.setItem("goltv-chat-nick-color", "#000000");
    localStorage.setItem("goltv-chat-text-color", "#888888");
    render(<ChatBox matchId="123" />);
    expect(screen.getByRole("combobox", { name: t.nickColor })).toHaveAttribute("data-value", "#ccff00");
    expect(screen.getByRole("combobox", { name: t.textColor })).toHaveAttribute("data-value", "#ffffff");
  });

  it("supports keyboard color selection and Escape without opening a native picker", () => {
    render(<ChatBox matchId="123" />);
    const picker = screen.getByRole("combobox", { name: t.nickColor });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")).toHaveLength(24);
    fireEvent.keyDown(picker, { key: "End" });
    fireEvent.keyDown(picker, { key: "Enter" });
    expect(picker).toHaveAttribute("data-value", "#00ff00");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(picker);
    fireEvent.keyDown(picker, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clears the old history and offset when selecting a different match", async () => {
    const { rerender } = render(<ChatBox matchId="123" />);
    await loadMessages();
    jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ messages: [], persistent: true }) } as Response);
    rerender(<ChatBox matchId="456" />);
    await loadMessages();
    expect(screen.getByRole("log")).not.toHaveTextContent(first.text);
    expect(global.fetch).toHaveBeenLastCalledWith("/api/chat?matchId=456&offset=0", { cache: "no-store" });
  });
});
