import {
  isTransferAmountValid,
  isValidRoutingNumber,
  normalizeRoutingNumber,
  parseTransferAmountToCents,
} from "../lib/transferToBank";

describe("transferToBank helpers", () => {
  test("normalizes routing numbers to digits only", () => {
    expect(normalizeRoutingNumber("12-345 6789")).toBe("123456789");
  });

  test("accepts valid ABA routing numbers", () => {
    expect(isValidRoutingNumber("021000021")).toBe(true);
    expect(isValidRoutingNumber("111000025")).toBe(true);
  });

  test("rejects invalid routing numbers", () => {
    expect(isValidRoutingNumber("123456789")).toBe(false);
    expect(isValidRoutingNumber("000000000")).toBe(false);
  });

  test("validates transfer amounts against available funds", () => {
    expect(isTransferAmountValid(5000, 5000)).toBe(true);
    expect(isTransferAmountValid(1, 5000)).toBe(true);
    expect(isTransferAmountValid(5001, 5000)).toBe(false);
    expect(isTransferAmountValid(0, 5000)).toBe(false);
  });

  test("parses dollar amounts to cents", () => {
    expect(parseTransferAmountToCents("12.34")).toBe(1234);
    expect(parseTransferAmountToCents("1,234.50")).toBe(123450);
    expect(parseTransferAmountToCents("12.345")).toBeNull();
  });
});
