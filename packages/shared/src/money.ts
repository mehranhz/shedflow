export type Money = {
  amountMinor: number;
  currency: string;
};

export function assertMinor(n: number): asserts n is number {
  if (!Number.isInteger(n)) {
    throw new TypeError('Money amount must be an integer number of minor units');
  }
}

export function money(amountMinor: number, currency: string): Money {
  assertMinor(amountMinor);
  return { amountMinor, currency };
}
