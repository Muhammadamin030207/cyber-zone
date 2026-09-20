import { describe, it, expect } from 'vitest';
import { computeBookingPrice } from '../utils/pricing';

describe('computeBookingPrice — base', () => {
  it('computes base, 30% advance and remaining', () => {
    const r = computeBookingPrice({ pricePerHour: 10000, durationHours: 3 });
    expect(r.baseTotal).toBe(30000);
    expect(r.advance).toBe(9000);
    expect(r.remaining).toBe(21000);
    expect(r.discountPromo).toBe(0);
    expect(r.discountPoints).toBe(0);
    expect(r.finalTotal).toBe(30000);
  });

  it('handles fractional hours', () => {
    const r = computeBookingPrice({ pricePerHour: 10000, durationHours: 1.5 });
    expect(r.baseTotal).toBe(15000);
    expect(r.advance).toBe(4500);
    expect(r.remaining).toBe(10500);
  });
});

describe('computeBookingPrice — promo', () => {
  it('applies PERCENTAGE discount', () => {
    const r = computeBookingPrice({
      pricePerHour: 10000,
      durationHours: 3,
      promo: { discountType: 'PERCENTAGE', discountValue: 10 },
    });
    expect(r.discountPromo).toBe(3000);
    expect(r.finalTotal).toBe(27000);
    expect(r.advance).toBe(8100);
    expect(r.remaining).toBe(18900);
  });

  it('applies FIXED discount', () => {
    const r = computeBookingPrice({
      pricePerHour: 10000,
      durationHours: 3,
      promo: { discountType: 'FIXED', discountValue: 5000 },
    });
    expect(r.discountPromo).toBe(5000);
    expect(r.finalTotal).toBe(25000);
  });

  it('does not clamp fixed discount above base', () => {
    const r = computeBookingPrice({
      pricePerHour: 10000,
      durationHours: 1,
      promo: { discountType: 'FIXED', discountValue: 20000 },
    });
    expect(r.discountPromo).toBe(10000);
    expect(r.finalTotal).toBe(0);
    expect(r.advance).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it('skips promo when min booking amount not reached', () => {
    const r = computeBookingPrice({
      pricePerHour: 10000,
      durationHours: 1,
      promo: { discountType: 'FIXED', discountValue: 5000, minBookingAmount: 20000 },
    });
    expect(r.discountPromo).toBe(0);
    expect(r.finalTotal).toBe(10000);
  });
});

describe('computeBookingPrice — loyalty points', () => {
  it('caps points at 50% of after-promo price', () => {
    const r = computeBookingPrice({
      pricePerHour: 10000,
      durationHours: 3,
      promo: { discountType: 'PERCENTAGE', discountValue: 10 },
      pointsToUse: 20000,
    });
    expect(r.discountPromo).toBe(3000);
    expect(r.discountPoints).toBe(13500); // floor(27000 * 0.5)
    expect(r.pointsUsed).toBe(13500);
    expect(r.finalTotal).toBe(13500);
  });

  it('uses fewer points if requested below cap', () => {
    const r = computeBookingPrice({ pricePerHour: 10000, durationHours: 3, pointsToUse: 5000 });
    expect(r.pointsUsed).toBe(5000);
    expect(r.finalTotal).toBe(25000);
  });

  it('uses zero points when not requested', () => {
    const r = computeBookingPrice({ pricePerHour: 10000, durationHours: 3 });
    expect(r.pointsUsed).toBe(0);
    expect(r.finalTotal).toBe(30000);
  });
});

describe('computeBookingPrice — combined discounts', () => {
  it('promo then points stack correctly', () => {
    const r = computeBookingPrice({
      pricePerHour: 10000,
      durationHours: 3,
      promo: { discountType: 'PERCENTAGE', discountValue: 10 },
      pointsToUse: 10000,
    });
    expect(r.discountPromo).toBe(3000); // 10% of 30000
    expect(r.discountPoints).toBe(10000); // <= cap 13500
    expect(r.totalDiscount).toBe(13000);
    expect(r.finalTotal).toBe(17000); // 30000 - 13000
    expect(r.advance).toBe(5100);
    expect(r.remaining).toBe(11900);
  });
});