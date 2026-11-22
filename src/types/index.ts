// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

/** A full row from the users table. Contains the password hash: never send it to a client. */
export interface UserRecord {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

/** User data that is safe to return in API responses. */
export type PublicUser = Omit<UserRecord, 'password_hash'>;

/** The authenticated staff member, taken from a verified JWT. */
export interface AuthUser {
  userId: number;
  email: string;
}

// ---------------------------------------------------------------------
// Inquiries (values mirror the PostgreSQL ENUM types in the migration)
// ---------------------------------------------------------------------

export const INQUIRY_STATUSES = ['New', 'In Progress', 'Resolved'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_VISIBILITIES = ['Public', 'Private'] as const;
export type InquiryVisibility = (typeof INQUIRY_VISIBILITIES)[number];

/** A row from the inquiries table. */
export interface InquiryRecord {
  id: number;
  customer_name: string;
  contact_info: string;
  subject: string;
  description: string;
  status: InquiryStatus;
  visibility: InquiryVisibility;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

/** Fields a staff member may edit through PUT /api/inquiries/:id. */
export interface InquiryEditableFields {
  customer_name: string;
  contact_info: string;
  subject: string;
  description: string;
}

/** Fields accepted when creating an inquiry (status and created_by are never client-controlled). */
export interface NewInquiry extends InquiryEditableFields {
  visibility: InquiryVisibility;
}

export interface InquiryListFilters {
  page: number;
  limit: number;
  status?: InquiryStatus;
  visibility?: InquiryVisibility;
  search?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ---------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors: ErrorDetail[];
}
