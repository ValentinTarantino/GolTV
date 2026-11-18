import {
  addChatMessage,
  deleteChatMessage,
  getChatMessages,
  getDeletedChatMessageIds,
} from "@/lib/chat";

// The chat store runs without a database here: exercise the in-memory path.
jest.mock("@/lib/mongo", () => ({
  CHAT_DELETED_COLLECTION: "chat_deleted",
  getChatCollection: async () => null,
  getDb: async () => null,
}));

describe("chat deletions", () => {
  it("removes the message and exposes a tombstone so polling clients drop it", async () => {
    const matchId = "987001";
    await addChatMessage(matchId, "Borra1", "hola a todos");

    const before = await getChatMessages(matchId, 0);
    expect(before).toHaveLength(1);
    const id = before[0].id;
    expect(await getDeletedChatMessageIds(matchId)).toEqual([]);

    await expect(deleteChatMessage(matchId, id)).resolves.toBe(true);

    expect(await getChatMessages(matchId, 0)).toEqual([]);
    expect(await getDeletedChatMessageIds(matchId)).toEqual([id]);
  });

  it("keeps other messages of the same match and reports unknown ids", async () => {
    const matchId = "987002";
    await addChatMessage(matchId, "Borra2", "primero");
    const first = (await getChatMessages(matchId, 0))[0];

    await new Promise(resolve => setTimeout(resolve, 5));
    await addChatMessage(matchId, "Borra3", "segundo");
    const both = await getChatMessages(matchId, 0);
    expect(both).toHaveLength(2);

    await deleteChatMessage(matchId, first.id);

    const remaining = await getChatMessages(matchId, 0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe("segundo");
    expect(await getDeletedChatMessageIds(matchId)).toEqual([first.id]);

    await expect(deleteChatMessage(matchId, "no-existe")).resolves.toBe(false);
  });

  it("does not duplicate a tombstone when the same message is deleted twice", async () => {
    const matchId = "987003";
    await addChatMessage(matchId, "Borra4", "mensaje");

    const [message] = await getChatMessages(matchId, 0);
    await deleteChatMessage(matchId, message.id);
    await deleteChatMessage(matchId, message.id);

    expect(await getDeletedChatMessageIds(matchId)).toEqual([message.id]);
  });
});
