UPDATE hackathon_schedule_items
SET title = 'Submissions Close & Judging Starts'
WHERE trigger_type = 'submission_deadline'
  AND title = 'Submissions Close';
