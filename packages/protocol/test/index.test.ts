import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../src/index.js";

describe("protocol", () => {
  it("expone la versión 1 del protocolo", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
