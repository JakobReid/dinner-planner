import { describe, it, expect } from "vitest";
import { AISLES, AISLE_LABEL, guessAisle } from "../src/aisles.js";

describe("guessAisle", () => {
  it("files common ingredients", () => {
    expect(guessAisle("chicken thigh")).toBe("meat");
    expect(guessAisle("carrot")).toBe("veg");
    expect(guessAisle("milk")).toBe("dairy");
    expect(guessAisle("rice")).toBe("pantry");
  });

  it("prefers the longest matching phrase", () => {
    expect(guessAisle("coconut milk")).toBe("pantry");
    expect(guessAisle("sweet potato")).toBe("veg");
    expect(guessAisle("cottage cheese")).toBe("dairy");
  });

  it("matches plurals and words inside longer names", () => {
    expect(guessAisle("tomatoes")).toBe("veg");
    expect(guessAisle("2 carrots")).toBe("veg");
    expect(guessAisle("tinned tomatoes")).toBe("pantry");
  });

  it("falls back to other", () => {
    expect(guessAisle("")).toBe("other");
    expect(guessAisle("flux capacitor")).toBe("other");
  });

  it("every aisle id has a label", () => {
    AISLES.forEach(([id]) => expect(AISLE_LABEL[id]).toBeTruthy());
    expect(AISLES.at(-1)[0]).toBe("other");
  });
});
