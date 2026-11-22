import { Router } from 'express';
import * as inquiryController from '../controllers/inquiry.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createInquirySchema,
  inquiryIdParamsSchema,
  listInquiriesQuerySchema,
  updateInquirySchema,
  updateStatusSchema,
} from '../validators/inquiry.validator';

const router = Router();

// Every inquiry endpoint requires a valid JWT.
router.use(authenticate);

router.post('/', validate({ body: createInquirySchema }), inquiryController.createInquiry);
router.get('/', validate({ query: listInquiriesQuerySchema }), inquiryController.listInquiries);
router.get('/:id', validate({ params: inquiryIdParamsSchema }), inquiryController.getInquiry);
router.put(
  '/:id',
  validate({ params: inquiryIdParamsSchema, body: updateInquirySchema }),
  inquiryController.updateInquiry,
);
router.patch(
  '/:id/status',
  validate({ params: inquiryIdParamsSchema, body: updateStatusSchema }),
  inquiryController.updateInquiryStatus,
);

// No DELETE endpoint: the assessment workflow never removes inquiries, and
// keeping them preserves history. Resolved is the terminal state instead.

export default router;
