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
  createdAt?: string;
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
  _count?: { zones: number; reviews: number; bookings: number };
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
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

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
  status: BookingStatus;
  notes?: string | null;
  createdAt: string;
  room?: Pick<Room, 'id' | 'name' | 'address'>;
  zone?: Pick<Zone, 'id' | 'name' | 'type' | 'pricePerHour'>;
  computer?: Pick<Computer, 'id' | 'name' | 'specs'>;
  promoCode?: Pick<PromoCode, 'id' | 'code' | 'discountType' | 'discountValue'>;
  payments?: Payment[];
}

export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  amount: number | string;
  type: 'ADVANCE' | 'REMAINING';
  method?: 'PAYME' | 'CLICK' | 'UZCARD' | 'CASH' | null;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  paidAt?: string | null;
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
  allComputers?: Array<Pick<Computer, 'id' | 'name' | 'specs' | 'status'> & { canBook: boolean }>;
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