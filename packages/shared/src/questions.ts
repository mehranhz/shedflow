import { z } from 'zod';

export const QuestionTypeSchema = z.enum([
  'text',
  'textarea',
  'phone',
  'select',
  'checkbox',
]);

export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  label: z.string().min(1),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});

export const EventTypeQuestionsSchema = z.array(QuestionSchema);

export const BookingAnswersSchema = z.record(
  z.string(),
  z.union([z.string(), z.boolean()]),
);

export type Question = z.infer<typeof QuestionSchema>;
export type EventTypeQuestions = z.infer<typeof EventTypeQuestionsSchema>;
export type BookingAnswers = z.infer<typeof BookingAnswersSchema>;
