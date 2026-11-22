import { pool } from '../config/database';
import type {
  InquiryEditableFields,
  InquiryListFilters,
  InquiryRecord,
  InquiryStatus,
  NewInquiry,
} from '../types';

const COLUMNS = `id, customer_name, contact_info, subject, description,
                 status, visibility, created_by, created_at, updated_at`;

/**
 * THE access rule, applied inside every query:
 * a staff member may see/change an inquiry if it is Public OR they created it.
 * `userParam` is a placeholder such as "$1" whose value is the id from the verified JWT.
 */
const canAccess = (userParam: string) => `(visibility = 'Public' OR created_by = ${userParam})`;

/** Escapes LIKE wildcards so a search for "50%" matches the text "50%", not "50 anything". */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export async function create(data: NewInquiry, createdBy: number): Promise<InquiryRecord> {
  const result = await pool.query<InquiryRecord>(
    `INSERT INTO inquiries (customer_name, contact_info, subject, description, visibility, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [data.customer_name, data.contact_info, data.subject, data.description, data.visibility, createdBy],
  );
  return result.rows[0];
}

/** Returns one page of inquiries the user may access, plus the total number of matches. */
export async function findAccessible(
  userId: number,
  filters: InquiryListFilters,
): Promise<{ rows: InquiryRecord[]; total: number }> {
  // Values go into `params`; only the placeholders ($1, $2, ...) are put into the SQL text.
  const params: unknown[] = [userId];
  const addParam = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const conditions = [canAccess('$1')];
  if (filters.status) conditions.push(`status = ${addParam(filters.status)}`);
  if (filters.visibility) conditions.push(`visibility = ${addParam(filters.visibility)}`);
  if (filters.search) {
    const pattern = addParam(`%${escapeLike(filters.search)}%`);
    conditions.push(`(customer_name ILIKE ${pattern} OR subject ILIKE ${pattern})`);
  }
  const where = conditions.join(' AND ');

  const countResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM inquiries WHERE ${where}`,
    params,
  );

  const limitParam = addParam(filters.limit);
  const offsetParam = addParam((filters.page - 1) * filters.limit);
  const rowsResult = await pool.query<InquiryRecord>(
    `SELECT ${COLUMNS}
     FROM inquiries
     WHERE ${where}
     ORDER BY created_at DESC, id DESC   -- newest first; id breaks ties so pages are stable
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  return { rows: rowsResult.rows, total: countResult.rows[0].total };
}

/** Returns the inquiry only if it exists AND the user may access it; otherwise null. */
export async function findAccessibleById(id: number, userId: number): Promise<InquiryRecord | null> {
  const result = await pool.query<InquiryRecord>(
    `SELECT ${COLUMNS} FROM inquiries WHERE id = $1 AND ${canAccess('$2')}`,
    [id, userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Updates the editable fields of an accessible inquiry.
 * If `expectedUpdatedAt` is given, the row is only updated if it has not changed
 * since the client loaded it (optimistic concurrency). Returns null when no row
 * was updated (not found / not accessible / changed by someone else).
 */
export async function updateDetails(
  id: number,
  userId: number,
  fields: InquiryEditableFields,
  expectedUpdatedAt?: string,
): Promise<InquiryRecord | null> {
  const result = await pool.query<InquiryRecord>(
    `UPDATE inquiries
     SET customer_name = $3, contact_info = $4, subject = $5, description = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND ${canAccess('$2')}
       -- JavaScript dates have millisecond precision; PostgreSQL stores microseconds.
       AND ($7::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = $7::timestamptz)
     RETURNING ${COLUMNS}`,
    [
      id,
      userId,
      fields.customer_name,
      fields.contact_info,
      fields.subject,
      fields.description,
      expectedUpdatedAt ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

/**
 * Compare-and-set status update: changes the status only if it is STILL
 * `fromStatus` (the value the service validated the transition against).
 * Returns null if another request changed it first.
 */
export async function updateStatus(
  id: number,
  userId: number,
  fromStatus: InquiryStatus,
  toStatus: InquiryStatus,
): Promise<InquiryRecord | null> {
  const result = await pool.query<InquiryRecord>(
    `UPDATE inquiries
     SET status = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND ${canAccess('$2')} AND status = $3
     RETURNING ${COLUMNS}`,
    [id, userId, fromStatus, toStatus],
  );
  return result.rows[0] ?? null;
}
