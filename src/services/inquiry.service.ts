import * as inquiryRepository from '../repositories/inquiry.repository';
import type {
  InquiryEditableFields,
  InquiryListFilters,
  InquiryRecord,
  InquiryStatus,
  NewInquiry,
  Pagination,
} from '../types';
import { AppError } from '../utils/appError';

/**
 * Allowed status changes (staying in the same status is always allowed):
 *   New         -> In Progress
 *   In Progress -> Resolved
 *   Resolved    -> In Progress   (reopening)
 * Anything else (e.g. New -> Resolved, In Progress -> New) is rejected.
 */
const ALLOWED_TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]> = {
  New: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: ['In Progress'],
};

export function isAllowedTransition(from: InquiryStatus, to: InquiryStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

// Same message for "does not exist" and "exists but is someone else's Private inquiry",
// so other staff cannot discover that a private inquiry exists.
const NOT_FOUND = 'Inquiry not found';
const CONFLICT =
  'This inquiry was changed by someone else since you loaded it. Refresh to see the latest version and try again.';

async function getAccessibleOrThrow(id: number, userId: number): Promise<InquiryRecord> {
  const inquiry = await inquiryRepository.findAccessibleById(id, userId);
  if (!inquiry) throw AppError.notFound(NOT_FOUND);
  return inquiry;
}

export async function createInquiry(data: NewInquiry, userId: number): Promise<InquiryRecord> {
  // created_by comes from the verified JWT; status uses the database default ('New').
  return inquiryRepository.create(data, userId);
}

export async function listInquiries(
  userId: number,
  filters: InquiryListFilters,
): Promise<{ inquiries: InquiryRecord[]; pagination: Pagination }> {
  const { rows, total } = await inquiryRepository.findAccessible(userId, filters);
  return {
    inquiries: rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getInquiry(id: number, userId: number): Promise<InquiryRecord> {
  return getAccessibleOrThrow(id, userId);
}

export async function updateInquiry(
  id: number,
  userId: number,
  fields: InquiryEditableFields,
  expectedUpdatedAt?: string,
): Promise<InquiryRecord> {
  const updated = await inquiryRepository.updateDetails(id, userId, fields, expectedUpdatedAt);
  if (updated) return updated;

  // Nothing was updated. Work out why: missing/inaccessible (404) or stale version (409).
  await getAccessibleOrThrow(id, userId);
  throw AppError.conflict(CONFLICT);
}

export async function updateInquiryStatus(
  id: number,
  userId: number,
  newStatus: InquiryStatus,
): Promise<{ inquiry: InquiryRecord; changed: boolean }> {
  const current = await getAccessibleOrThrow(id, userId);

  // Staying in the same status is allowed and needs no database write.
  if (current.status === newStatus) {
    return { inquiry: current, changed: false };
  }

  if (!isAllowedTransition(current.status, newStatus)) {
    throw AppError.badRequest('Invalid status transition', [
      {
        field: 'status',
        message: `Cannot change status from '${current.status}' to '${newStatus}'`,
      },
    ]);
  }

  // Only succeeds if the status is still what we just validated against.
  const updated = await inquiryRepository.updateStatus(id, userId, current.status, newStatus);
  if (!updated) throw AppError.conflict(CONFLICT);

  return { inquiry: updated, changed: true };
}
