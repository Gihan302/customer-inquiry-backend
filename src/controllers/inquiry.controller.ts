import type { Request, Response } from 'express';
import { getAuthUser } from '../middlewares/auth.middleware';
import * as inquiryService from '../services/inquiry.service';
import { sendSuccess } from '../utils/apiResponse';
import type {
  CreateInquiryInput,
  InquiryIdParams,
  ListInquiriesQuery,
  UpdateInquiryInput,
  UpdateStatusInput,
} from '../validators/inquiry.validator';

// Every handler takes the user id from the verified JWT (getAuthUser), never from the request.
// The `as` casts are safe because the validate() middleware already parsed these values.

/** POST /api/inquiries */
export async function createInquiry(req: Request, res: Response): Promise<void> {
  const { userId } = getAuthUser(req);
  const inquiry = await inquiryService.createInquiry(req.body as CreateInquiryInput, userId);
  sendSuccess(res, 201, 'Inquiry created successfully', { inquiry });
}

/** GET /api/inquiries */
export async function listInquiries(req: Request, res: Response): Promise<void> {
  const { userId } = getAuthUser(req);
  const filters = req.query as unknown as ListInquiriesQuery;
  const result = await inquiryService.listInquiries(userId, filters);
  sendSuccess(res, 200, 'Inquiries retrieved successfully', result);
}

/** GET /api/inquiries/:id */
export async function getInquiry(req: Request, res: Response): Promise<void> {
  const { userId } = getAuthUser(req);
  const { id } = req.params as unknown as InquiryIdParams;
  const inquiry = await inquiryService.getInquiry(id, userId);
  sendSuccess(res, 200, 'Inquiry retrieved successfully', { inquiry });
}

/** PUT /api/inquiries/:id */
export async function updateInquiry(req: Request, res: Response): Promise<void> {
  const { userId } = getAuthUser(req);
  const { id } = req.params as unknown as InquiryIdParams;
  const { expected_updated_at, ...fields } = req.body as UpdateInquiryInput;
  const inquiry = await inquiryService.updateInquiry(id, userId, fields, expected_updated_at);
  sendSuccess(res, 200, 'Inquiry updated successfully', { inquiry });
}

/** PATCH /api/inquiries/:id/status */
export async function updateInquiryStatus(req: Request, res: Response): Promise<void> {
  const { userId } = getAuthUser(req);
  const { id } = req.params as unknown as InquiryIdParams;
  const { status } = req.body as UpdateStatusInput;
  const { inquiry, changed } = await inquiryService.updateInquiryStatus(id, userId, status);
  sendSuccess(
    res,
    200,
    changed ? 'Inquiry status updated successfully' : 'Inquiry status unchanged',
    { inquiry },
  );
}
