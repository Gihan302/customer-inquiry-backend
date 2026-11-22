import { z } from 'zod';
import { INQUIRY_STATUSES, INQUIRY_VISIBILITIES } from '../types';

// ---------------------------------------------------------------------
// Reusable field rules
// ---------------------------------------------------------------------

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const PHONE_PATTERN = /^\+?[\d\s\-()]+$/;
const isEmail = (value: string) => z.email().safeParse(value).success;
const isPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').length;
  return PHONE_PATTERN.test(value) && digits >= 7 && digits <= 15;
};

const contactInfo = requiredText('Contact info', 150).refine((v) => isEmail(v) || isPhone(v), {
  message: 'Contact info must be a valid email address or phone number',
});

const status = z.enum(INQUIRY_STATUSES, {
  error: `Status must be one of: ${INQUIRY_STATUSES.join(', ')}`,
});

const visibility = z.enum(INQUIRY_VISIBILITIES, {
  error: `Visibility must be one of: ${INQUIRY_VISIBILITIES.join(', ')}`,
});

/**
 * Like z.object, but REJECTS unknown fields instead of silently dropping them,
 * e.g. a client trying to send "created_by" or "status" on create.
 */
const strictBody = <T extends z.core.$ZodLooseShape>(shape: T, allowed: string) =>
  z.strictObject(shape, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `Unknown field(s): ${issue.keys.join(', ')}. Allowed fields: ${allowed}`
        : undefined,
  });

const editableFields = {
  customer_name: requiredText('Customer name', 150),
  contact_info: contactInfo,
  subject: requiredText('Subject', 200),
  description: requiredText('Description', 5000),
};

// ---------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------

/** URL parameter :id — a positive whole number (rejects "abc", "1.5", "-3", "1e3"). */
export const inquiryIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,14}$/, 'Inquiry ID must be a positive integer')
    .transform(Number),
});

/** POST /api/inquiries */
export const createInquirySchema = strictBody(
  { ...editableFields, visibility: visibility.default('Public') },
  'customer_name, contact_info, subject, description, visibility',
);

/** PUT /api/inquiries/:id — status, visibility and created_by cannot be changed here. */
export const updateInquirySchema = strictBody(
  {
    ...editableFields,
    // Optional optimistic-concurrency check: the updated_at value the client last saw.
    // If the record changed since then, the update is refused with 409.
    expected_updated_at: z
      .iso.datetime({ offset: true, error: 'expected_updated_at must be an ISO 8601 timestamp' })
      .optional(),
  },
  'customer_name, contact_info, subject, description, expected_updated_at',
);

/** PATCH /api/inquiries/:id/status */
export const updateStatusSchema = strictBody({ status }, 'status');

/** GET /api/inquiries query string */
export const listInquiriesQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'page must be a number' })
    .int('page must be a whole number')
    .min(1, 'page must be at least 1')
    .default(1),
  limit: z.coerce
    .number({ error: 'limit must be a number' })
    .int('limit must be a whole number')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must be at most 100')
    .default(10),
  status: status.optional(),
  visibility: visibility.optional(),
  search: z
    .string({ error: 'search must be a single text value' })
    .trim()
    .max(100, 'search must be at most 100 characters')
    // An empty ?search= means "no search".
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});

export type InquiryIdParams = z.infer<typeof inquiryIdParamsSchema>;
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type UpdateInquiryInput = z.infer<typeof updateInquirySchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListInquiriesQuery = z.infer<typeof listInquiriesQuerySchema>;
