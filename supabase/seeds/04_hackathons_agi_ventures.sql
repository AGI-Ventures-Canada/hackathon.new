-- ============================================================================
-- HACKATHONS - AGI VENTURES CANADA
-- Depends on: tenants
-- ============================================================================

INSERT INTO hackathons (id, tenant_id, name, slug, description, rules, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, status, min_team_size, max_team_size, allow_solo, require_team_approval, created_at, updated_at)
VALUES
  (
    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    '12345678-1234-1234-1234-123456789012',
    'AGI Ventures Innovation Summit 2026',
    'agi-innovation-summit-2026',
    'Join AGI Ventures Canada for our flagship innovation summit! Build cutting-edge AI solutions that push the boundaries of what''s possible. Whether you''re working on AGI research, practical AI applications, or novel AI architectures, this is your chance to showcase your vision.',
    '1. Teams of 1-5 people
2. All projects must incorporate AI/ML technologies
3. Code must be written during the hackathon period
4. Projects must include a working demo or prototype
5. Judging criteria: Innovation, Technical Depth, Market Potential, Presentation Quality
6. Grand prize: $25,000 CAD + mentorship opportunity',
    now() + interval '20 days',
    now() + interval '22 days',
    now() - interval '5 days',
    now() + interval '18 days',
    true,
    'published',
    1,
    5,
    true,
    false,
    now() - interval '10 days',
    now()
  ),
  (
    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
    '12345678-1234-1234-1234-123456789012',
    'Canadian AI Startup Challenge',
    'canadian-ai-startup-challenge',
    'Calling all Canadian entrepreneurs and developers! Build AI-powered startups that solve real problems. From healthcare to fintech, from climate tech to education, show us how AI can transform industries and create value.',
    '1. Open to Canadian residents and students
2. Teams of 2-6 people
3. Must address a real market problem
4. Business plan required alongside technical demo
5. Top 5 teams receive seed funding and accelerator access
6. Must be able to present in English or French',
    now() + interval '50 days',
    now() + interval '52 days',
    now() + interval '10 days',
    now() + interval '45 days',
    true,
    'published',
    2,
    6,
    false,
    false,
    now() - interval '3 days',
    now()
  ),
  (
    'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    '12345678-1234-1234-1234-123456789012',
    'AGI Research Hackathon',
    'agi-research-hackathon',
    'A specialized hackathon for researchers, PhD students, and advanced practitioners working on AGI-related problems. Focus on alignment, reasoning, multi-agent systems, or novel architectures.',
    '1. Open to researchers, graduate students, and experienced practitioners
2. Solo or teams up to 4
3. Research papers or technical reports welcome
4. Access to advanced AI models and compute resources
5. Top research projects may be considered for publication support
6. 48-hour intensive format',
    now() + interval '75 days',
    now() + interval '77 days',
    now() + interval '20 days',
    now() + interval '70 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now(),
    now()
  ),
  (
    'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
    '12345678-1234-1234-1234-123456789012',
    'Healthcare AI Innovation Challenge',
    'healthcare-ai-challenge',
    'Build AI solutions that improve healthcare outcomes. From diagnostic tools to patient care systems, from drug discovery to telemedicine, use AI to make healthcare more accessible and effective.',
    '1. Teams of 1-4 people
2. Must address a real healthcare challenge
3. HIPAA compliance considerations required
4. Working prototype or demo required
5. Top 3 teams receive $15,000 CAD and healthcare industry mentorship
6. Open to all skill levels',
    now() + interval '35 days',
    now() + interval '37 days',
    now() - interval '2 days',
    now() + interval '32 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '8 days',
    now()
  ),
  (
    'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
    '12345678-1234-1234-1234-123456789012',
    'Climate AI Solutions Hack',
    'climate-ai-solutions',
    'Tackle climate change with AI! Build solutions for carbon tracking, renewable energy optimization, climate prediction, or sustainable agriculture. Help create a more sustainable future.',
    '1. Teams of 2-5 people
2. Must address climate or environmental challenges
3. Use of public climate data encouraged
4. Impact measurement required
5. Winners receive $10,000 CAD and potential pilot opportunities
6. 36-hour hackathon format',
    now() + interval '90 days',
    now() + interval '91 days',
    now() + interval '30 days',
    now() + interval '85 days',
    true,
    'published',
    2,
    5,
    false,
    false,
    now() - interval '1 day',
    now()
  ),
  (
    'f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6',
    '12345678-1234-1234-1234-123456789012',
    'FinTech AI Buildathon',
    'fintech-ai-buildathon',
    'Revolutionize financial services with AI. Build solutions for fraud detection, algorithmic trading, personal finance, credit scoring, or blockchain applications. Show us the future of finance.',
    '1. Teams of 1-4 people
2. Must incorporate AI/ML in financial applications
3. Security and compliance considerations required
4. Working demo required
5. Top projects receive $20,000 CAD and fintech accelerator access
6. Regulatory guidance provided',
    now() + interval '12 days',
    now() + interval '14 days',
    now() - interval '7 days',
    now() + interval '10 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '12 days',
    now()
  ),
  (
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7',
    '12345678-1234-1234-1234-123456789012',
    'Education AI Hack',
    'education-ai-hack',
    'Transform education with AI! Build tools for personalized learning, student assessment, content generation, or accessibility. Help make quality education accessible to everyone.',
    '1. Teams of 1-5 people
2. Focus on educational technology solutions
3. Must demonstrate learning outcomes or accessibility improvements
4. Prototype or demo required
5. Top 3 teams receive $12,000 CAD and education sector partnerships
6. Open to educators, students, and developers',
    now() + interval '60 days',
    now() + interval '62 days',
    now() + interval '15 days',
    now() + interval '55 days',
    true,
    'published',
    1,
    5,
    true,
    false,
    now() - interval '2 days',
    now()
  ),
  (
    'b8b8b8b8-b8b8-b8b8-b8b8-b8b8b8b8b8b8',
    '12345678-1234-1234-1234-123456789012',
    'AI for Good Social Impact Challenge',
    'ai-for-good-challenge',
    'Use AI to solve social problems! Address issues like poverty, inequality, accessibility, mental health, or community building. Make a positive impact on society.',
    '1. Teams of 2-6 people
2. Must address a social or community challenge
3. Impact measurement and user research required
4. Working prototype or pilot required
5. Winners receive $18,000 CAD and nonprofit partnerships
6. Focus on sustainable, scalable solutions',
    now() + interval '100 days',
    now() + interval '102 days',
    now() + interval '40 days',
    now() + interval '95 days',
    true,
    'published',
    2,
    6,
    false,
    false,
    now() + interval '2 days',
    now()
  ),
  (
    'c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9',
    '12345678-1234-1234-1234-123456789012',
    'Robotics & AI Integration Hack',
    'robotics-ai-integration',
    'Combine robotics and AI! Build autonomous systems, robotic assistants, or AI-powered automation. Whether it''s manufacturing, service robots, or research platforms, show us the future of robotics.',
    '1. Teams of 2-5 people
2. Must combine hardware and AI software
3. Physical demo or simulation required
4. Safety considerations mandatory
5. Top projects receive $22,000 CAD and robotics lab access
6. Hardware kits available for loan',
    now() + interval '120 days',
    now() + interval '122 days',
    now() + interval '50 days',
    now() + interval '115 days',
    true,
    'published',
    2,
    5,
    false,
    false,
    now() + interval '5 days',
    now()
  ),
  (
    'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
    '12345678-1234-1234-1234-123456789012',
    'AI Art & Creative Expression Contest',
    'ai-art-creative-contest',
    'Explore the intersection of AI and creativity! Build tools for art generation, music composition, storytelling, or creative workflows. Push the boundaries of AI-assisted creativity.',
    '1. Solo or teams up to 3
2. Focus on creative applications of AI
3. Portfolio or demo required
4. Multiple categories: visual art, music, writing, interactive media
5. Winners receive $8,000 CAD and gallery exhibition opportunities
6. Open to artists, musicians, writers, and developers',
    now() - interval '62 days',
    now() - interval '60 days',
    now() - interval '80 days',
    now() - interval '64 days',
    true,
    'completed',
    1,
    3,
    true,
    false,
    now() - interval '15 days',
    now()
  ),
  (
    'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
    '12345678-1234-1234-1234-123456789012',
    'AI Security & Privacy Hackathon',
    'ai-security-privacy',
    'Secure the AI future! Build tools for AI security, privacy-preserving ML, adversarial defense, or secure AI deployment. Help make AI systems more trustworthy and secure.',
    '1. Teams of 1-4 people
2. Focus on security, privacy, or trust in AI systems
3. Security analysis or proof-of-concept required
4. Open to security researchers and developers
5. Top projects receive $15,000 CAD and security research partnerships
6. 24-hour intensive format',
    now() + interval '25 days',
    now() + interval '26 days',
    now() + interval '3 days',
    now() + interval '23 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '6 days',
    now()
  ),
  (
    'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2',
    '12345678-1234-1234-1234-123456789012',
    'Student AI Innovation Challenge',
    'student-ai-innovation',
    'Exclusively for students! Showcase your AI projects and compete with peers. Open to high school, undergraduate, and graduate students. Build something amazing and launch your AI career.',
    '1. Open only to students (high school, undergraduate, graduate)
2. Teams of 1-4 people
3. Student ID verification required
4. All projects welcome - research, applications, or demos
5. Winners receive $5,000 CAD, internships, and mentorship
6. Special prizes for high school participants',
    now() + interval '15 days',
    now() + interval '17 days',
    now() - interval '3 days',
    now() + interval '13 days',
    true,
    'published',
    1,
    4,
    true,
    false,
    now() - interval '9 days',
    now()
  )
ON CONFLICT (id) DO NOTHING;
