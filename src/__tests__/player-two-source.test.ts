/** @jest-environment node */
import { __rot47ForTest as rot47 } from "@/lib/player-two-source";

describe("player-two-source", () => {
  describe("rot47", () => {
    it("decodes ROT47-encoded JSON round-trip", () => {
      const original = '{"key":"value","number":42}';
      const encoded = rot47(original);
      expect(encoded).not.toBe(original);
      const decoded = rot47(encoded);
      expect(decoded).toBe(original);
    });

    it("preserves characters outside the printable ASCII range", () => {
      expect(rot47("hello world\n\t")).toBe(rot47("hello world") + "\n\t");
    });

    it("decodes a known params snippet", () => {
      // "true" encodes to "ECF6" in ROT47
      expect(rot47("ECF6")).toBe("true");
      expect(rot47("true")).toBe("ECF6");
    });
  });

  describe("mdata encoding", () => {
    it("encodes matchId_sportType as base64", () => {
      const matchId = 4398525;
      const mdata = Buffer.from(`${matchId}_1`, "utf8").toString("base64");
      expect(mdata).toBe("NDM5ODUyNV8x");
      // Decode back to verify
      expect(Buffer.from(mdata, "base64").toString("utf8")).toBe("4398525_1");
    });

    it("produces different mdata for different matchIds", () => {
      const a = Buffer.from("1234_1", "utf8").toString("base64");
      const b = Buffer.from("5678_1", "utf8").toString("base64");
      expect(a).not.toBe(b);
    });
  });
});

