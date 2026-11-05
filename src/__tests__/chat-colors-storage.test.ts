/** @jest-environment node */
import { addChatMessage, getChatMessages } from "@/lib/chat";
import { getChatCollection, isMongoConfigured } from "@/lib/mongo";

jest.mock("@/lib/mongo", () => ({ getChatCollection: jest.fn(), isMongoConfigured: jest.fn() }));

it("stores colors in MongoDB and returns them alongside legacy messages", async () => {
  const oldMessage = { id: "old", matchId: "8765", nick: "LegacyFan", text: "Hola", ts: 1 };
  const stored: unknown[] = [oldMessage];
  const collection = {
    findOne: jest.fn().mockResolvedValue(null),
    insertOne: jest.fn(async message => { stored.push(message); }),
    find: jest.fn(() => ({ sort: () => ({ toArray: async () => stored }) })),
  };
  jest.mocked(isMongoConfigured).mockReturnValue(true);
  jest.mocked(getChatCollection).mockResolvedValue(collection as never);

  expect(await addChatMessage("8765", "MongoColorFan", "Vamos", { nickColor: "#ccff00", textColor: "#00ffff" }))
    .toMatchObject({ ok: true, persistent: true });
  const messages = await getChatMessages("8765", 0);
  expect(messages[0]).toEqual(oldMessage);
  expect(messages[1]).toMatchObject({ nick: "MongoColorFan", text: "Vamos", nickColor: "#ccff00", textColor: "#00ffff" });
});

it("rejects malformed colors before writing directly through the chat library", async () => {
  expect(await addChatMessage("8765", "BadColorFan", "Test", { nickColor: "red" }))
    .toEqual({ ok: false, error: "Invalid message color" });
});
