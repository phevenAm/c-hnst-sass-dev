-- Additional weekly check-in responses for demo client (Cassie Morgan)
-- Extends the existing 4 entries (Jun 8–29) through to Aug 3

insert into public.responses (id, user_id, questionnaire_id, scores, submitted_at) values

(
  gen_random_uuid(),
  '3d5e1d85-d7c6-4573-b61e-91d19daa07bb',
  '724dc304-e093-4ccf-88af-0d3bdc93334b',
  '{
    "032153c8-cff6-4d2f-8b32-394622da6b8b": 7,
    "b439e04b-8b80-4f07-b1bc-94ea43536144": 7,
    "4b40bac2-2875-4a3f-ac66-a39b3c2f9256": 7,
    "3b35fd57-839b-469b-a0b7-407091bfc743": "Had the conversation with my manager — it went better than I expected. She was actually really receptive about the workload. I felt proud of how I handled it.",
    "e2cff136-1a8c-43dd-b638-8fcb0c5416c2": "Keep the daily check-in habit going and try to carve out one evening just for myself this week."
  }'::jsonb,
  '2026-07-06 18:30:00+00'
),

(
  gen_random_uuid(),
  '3d5e1d85-d7c6-4573-b61e-91d19daa07bb',
  '724dc304-e093-4ccf-88af-0d3bdc93334b',
  '{
    "032153c8-cff6-4d2f-8b32-394622da6b8b": 6,
    "b439e04b-8b80-4f07-b1bc-94ea43536144": 6,
    "4b40bac2-2875-4a3f-ac66-a39b3c2f9256": 5,
    "3b35fd57-839b-469b-a0b7-407091bfc743": "Performance reviews are coming up and the old anxiety crept back a bit. I noticed it quicker this time though, which felt like progress even if the feeling itself wasn''t great.",
    "e2cff136-1a8c-43dd-b638-8fcb0c5416c2": "Write down what I''m actually proud of this year before the review — shift the focus from fear to evidence."
  }'::jsonb,
  '2026-07-13 18:30:00+00'
),

(
  gen_random_uuid(),
  '3d5e1d85-d7c6-4573-b61e-91d19daa07bb',
  '724dc304-e093-4ccf-88af-0d3bdc93334b',
  '{
    "032153c8-cff6-4d2f-8b32-394622da6b8b": 8,
    "b439e04b-8b80-4f07-b1bc-94ea43536144": 8,
    "4b40bac2-2875-4a3f-ac66-a39b3c2f9256": 7,
    "3b35fd57-839b-469b-a0b7-407091bfc743": "The performance review went really well — I went in prepared and felt calm. I actually got positive feedback I hadn''t expected. This felt like a real shift in how I show up for myself.",
    "e2cff136-1a8c-43dd-b638-8fcb0c5416c2": "Start thinking about what I want the next 6 months to look like — professionally and personally."
  }'::jsonb,
  '2026-07-20 18:30:00+00'
),

(
  gen_random_uuid(),
  '3d5e1d85-d7c6-4573-b61e-91d19daa07bb',
  '724dc304-e093-4ccf-88af-0d3bdc93334b',
  '{
    "032153c8-cff6-4d2f-8b32-394622da6b8b": 7,
    "b439e04b-8b80-4f07-b1bc-94ea43536144": 8,
    "4b40bac2-2875-4a3f-ac66-a39b3c2f9256": 7,
    "3b35fd57-839b-469b-a0b7-407091bfc743": "Quieter week. Been reflecting a lot on how different things feel compared to two months ago. Sleep has been consistently good which I think is making everything else easier.",
    "e2cff136-1a8c-43dd-b638-8fcb0c5416c2": "Explore what a healthy work boundary actually looks like in practice — not just in theory."
  }'::jsonb,
  '2026-07-27 18:30:00+00'
),

(
  gen_random_uuid(),
  '3d5e1d85-d7c6-4573-b61e-91d19daa07bb',
  '724dc304-e093-4ccf-88af-0d3bdc93334b',
  '{
    "032153c8-cff6-4d2f-8b32-394622da6b8b": 8,
    "b439e04b-8b80-4f07-b1bc-94ea43536144": 8,
    "4b40bac2-2875-4a3f-ac66-a39b3c2f9256": 8,
    "3b35fd57-839b-469b-a0b7-407091bfc743": "Said no to extra work this week and didn''t feel guilty about it afterwards — that''s genuinely new for me. Feeling more settled in myself than I have in a long time.",
    "e2cff136-1a8c-43dd-b638-8fcb0c5416c2": "Think about whether I want to reduce session frequency — not because things are bad, but because I feel ready to try holding things myself more."
  }'::jsonb,
  '2026-08-03 18:30:00+00'
);
