export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: Role;
  language: string;
  status: 'ACTIVE' | 'BLOCKED';
  loyaltyBalance?: number;
  createdAt?: string;
  mustChangePassword?: boolean;
  requirePasskey?: boolean;
  twoFactorEnabled?: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Computer {
  id: string;
  zoneId: string;
  name: string;
  specs: Record<string, any>;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'BROKEN';
}

export interface Zone {
  id: string;
  roomId: string;
  type: 'GENERAL_HALL' | 'VIP' | 'CABIN';
  name: string;
  description?: string | null;
  capacity: number;
  pricePerHour: number | string;
  computers?: Computer[];
}

export interface Room {
  id: string;
  ownerId: string;
  name: string;
  description?: string | null;
  address: string;
  district?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  workingHours?: { open: string; close: string } | null;
  timezone: string;
  images?: string[] | null;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  createdAt: string;
  zones?: Zone[];
  reviews?: Review[];
  avgRating?: number;
  ratingCount?: number;
  _count?: { zones: number; reviews: number; bookings: number; computers?: number };
  owner?: Pick<User, 'id' | 'fullName' | 'email' | 'phone'> | null;
}

export interface Review {
  id: string;
  userId: string;
  roomId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: Pick<User, 'id' | 'fullName' | 'avatarUrl'>;
}

export interface PromoCode {
  id: string;
  roomId?: string | null;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number | string;
  minBookingAmount?: number | string | null;
  maxUses?: number | null;
  usedCount: number;
  usageLimitPerUser?: number;
  isPersonal?: boolean;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
}

export type BookingStatus =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Booking {
  id: string;
  userId: string;
  roomId: string;
  zoneId: string;
  computerId?: string | null;
  promoCodeId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number | string;
  totalPrice: number | string;
  discountAmount: number | string;
  finalPrice: number | string;
  advanceAmount: number | string;
  remainingAmount: number | string;
  depositPercent?: number | string;
  status: BookingStatus;
  notes?: string | null;
  sessionStartedAt?: string | null;
  sessionEndedAt?: string | null;
  actualDurationMinutes?: number | null;
  actualPrice?: number | string | null;
  billingAdjustment?: number | string | null;
  minBillingMinutes?: number;
  createdAt: string;
  room?: Pick<Room, 'id' | 'name' | 'address'>;
  zone?: Pick<Zone, 'id' | 'name' | 'type' | 'pricePerHour'>;
  computer?: Pick<Computer, 'id' | 'name' | 'specs'>;
  promoCode?: Pick<PromoCode, 'id' | 'code' | 'discountType' | 'discountValue'>;
  user?: Pick<User, 'id' | 'fullName' | 'email' | 'phone'>;
  payments?: Payment[];
}

export interface BookingSessionState {
  state: 'active' | 'ended' | 'idle';
  serverTime: string;
  bookedStart: string;
  bookedEnd: string;
  elapsedMinutes: number;
  billedMinutes: number;
  remainingMs: number;
  overdueMs: number;
  actualPrice: number | null;
  prepaidValue: number;
  totalPaid: number;
  pointsUsed: number;
}

export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  amount: number | string;
  type: 'ADVANCE' | 'REMAINING';
  method?: 'PAYME' | 'CLICK' | 'UZCARD' | 'HUMO' | 'UZUM' | 'PAYNET' | 'CASH' | null;
  provider?: 'PAYME' | 'CLICK' | 'UZUM' | 'PAYNET' | null;
  status: 'CREATED' | 'PENDING' | 'REDIRECT_REQUIRED' | 'PROCESSING' | 'PAID' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  paidAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AvailabilityZone {
  id: string;
  name: string;
  type: string;
  pricePerHour: number | string;
  totalComputers: number;
  bookedComputers: number;
  availableComputers: number;
  computers: Array<Pick<Computer, 'id' | 'name' | 'specs'>>;
  allComputers?: Array<
    Pick<Computer, 'id' | 'name' | 'specs' | 'status'> & {
      canBook: boolean;
      bookedSlots: Array<{ start: string; end: string }>;
      freeWindows?: Array<{ start: string; end: string }>;
    }
  >;
}

export interface NewsItem {
  id: string;
  roomId?: string | null;
  title: string;
  content: string;
  imageUrl?: string | null;
  type: 'NEWS' | 'PROMOTION' | 'BANNER';
  isActive: boolean;
  publishedAt: string;
  room?: Pick<Room, 'id' | 'name'>;
  author?: Pick<User, 'id' | 'fullName'>;
}