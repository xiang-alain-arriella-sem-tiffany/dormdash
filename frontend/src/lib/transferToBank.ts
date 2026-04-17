const ROUTING_NUMBER_PREFIX_RANGES: Array<[number, number]> = [
  [1, 12],
  [21, 32],
  [61, 72],
];

const isCommonRoutingPrefix = (routingNumber: string): boolean => {
  const prefix = Number(routingNumber.slice(0, 2));
  return (
    prefix === 80 ||
    ROUTING_NUMBER_PREFIX_RANGES.some(
      ([min, max]) => prefix >= min && prefix <= max,
    )
  );
};

export const normalizeRoutingNumber = (value: string): string =>
  value.replace(/\D/g, "").slice(0, 9);

export const isValidRoutingNumber = (value: string): boolean => {
  const routingNumber = normalizeRoutingNumber(value);

  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }

  if (!isCommonRoutingPrefix(routingNumber)) {
    return false;
  }

  if (/^(\d)\1{8}$/.test(routingNumber)) {
    return false;
  }

  const digits = routingNumber.split("").map(Number);
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    (digits[2] + digits[5] + digits[8]);

  return checksum % 10 === 0;
};

export const isTransferAmountValid = (
  amountCents: number,
  availableToTransferCents: number,
): boolean => {
  return (
    Number.isInteger(amountCents) &&
    amountCents > 0 &&
    amountCents <= availableToTransferCents
  );
};

export const parseTransferAmountToCents = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const normalizedValue = trimmedValue.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
    return null;
  }

  const numericValue = Number(normalizedValue);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.round(numericValue * 100);
};
