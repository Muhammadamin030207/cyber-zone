import { toNumber, round2 } from './money';

export interface PromoDiscount {
  discountType?: 'PERCENTAGE' | 'FIXED' | string;
  discountValue?: any;
  minBookingAmount?: any;
}

export interface PricingInput {
  pricePerHour: any;
  durationHours: any;
  promo?: PromoDiscount | null;
  pointsToUse?: number; // bonus ball (1 ball = 1 so'm)
  maxPointsPercent?: number; // ball bilan qoplash mumkin bo'lgan maksimal foiz (0.5 = 50%)
}

export interface PricingResult {
  baseTotal: number;
  discountPromo: number;
  discountPoints: number;
  totalDiscount: number;
  finalTotal: number;
  pointsUsed: number;
  advance: number;
  remaining: number;
}

/**
 * Bron narxini barcha chegirmalar bilan hisoblaydi (tiyingacha aniq).
 * Promo chegirma, keyin bonus ballar chegirmasi qo'llaniladi.
 */
export function computeBookingPrice(input: PricingInput): PricingResult {
  const baseTotal = round2(toNumber(input.pricePerHour) * toNumber(input.durationHours));

  // 1) Promo chegirma
  let discountPromo = 0;
  const promo = input.promo;
  if (promo) {
    const value = toNumber(promo.discountValue);
    if (promo.discountType === 'PERCENTAGE') {
      discountPromo = round2((baseTotal * value) / 100);
    } else if (promo.discountType === 'FIXED') {
      discountPromo = round2(value);
    }
    if (toNumber(promo.minBookingAmount) && baseTotal < toNumber(promo.minBookingAmount)) {
      discountPromo = round2(0); // minimal summa bajarilmasa promo qo'llanmaydi
    }
    discountPromo = Math.min(round2(discountPromo), baseTotal);
  }

  const afterPromo = round2(baseTotal - discountPromo);

  // 2) Bonus ballar chegirmasi (1 ball = 1 so'm, maks 50%)
  const cap = Math.floor(afterPromo * (input.maxPointsPercent ?? 0.5));
  const requested = Math.floor(Math.max(0, toNumber(input.pointsToUse) || 0));
  const pointsUsed = Math.min(requested, cap);
  const discountPoints = pointsUsed;

  const totalDiscount = round2(discountPromo + discountPoints);
  const finalTotal = round2(Math.max(0, baseTotal - totalDiscount));
  const advance = round2(finalTotal * 0.3);
  const remaining = round2(finalTotal - advance);

  return {
    baseTotal,
    discountPromo,
    discountPoints,
    totalDiscount,
    finalTotal,
    pointsUsed,
    advance,
    remaining,
  };
}