DELETE FROM public.reviewvala_rating_snapshots WHERE workspace_slug = 'northstar-group';

INSERT INTO public.reviewvala_rating_snapshots (workspace_slug, channel, rating, period_label, created_at)
SELECT 'northstar-group',
       c.channel,
       round((c.base + (m.n - 12) * 0.035 + ((abs(hashtext(c.channel || m.n::text)) % 90) / 1000.0))::numeric, 2),
       to_char(date_trunc('month', now()) - ((12 - m.n) || ' months')::interval, 'Mon'),
       date_trunc('month', now()) - ((12 - m.n) || ' months')::interval
FROM (VALUES ('Google', 4.25), ('Trustpilot', 4.05), ('Facebook', 4.35), ('Tripadvisor', 3.95)) AS c(channel, base),
     generate_series(1, 12) AS m(n);

WITH cfg AS (
  SELECT
    ARRAY['Koramangala, Bengaluru','Indiranagar, Bengaluru','Shoreditch, London','SoHo, New York','Bandra West, Mumbai','Connaught Place, Delhi','Hitec City, Hyderabad','Marina Bay, Singapore']::text[] AS locs,
    ARRAY['Google','Google','Google','Trustpilot','Facebook','Tripadvisor','Internal']::text[] AS srcs,
    ARRAY['Aarav','Diya','Rohan','Meera','Kabir','Ananya','Vikram','Sana','Ishaan','Nisha','Oliver','Emma','Liam','Sophie','Noah','Ava','Ethan','Chloe','Marcus','Priya','Rahul','Tara','Zoya','Arjun','Neha']::text[] AS firsts,
    ARRAY['Sharma','Mehta','Iyer','Kapoor','Nair','Verma','Bose','Reddy','Khan','Dubois','Hale','Bennett','Walsh','Moretti','Chen','Lim','Okafor','Silva']::text[] AS lasts,
    ARRAY[5,5,4,5,4,5,4,5,3,4,5,4,5,2,4,5,4,3,5,1,5,4,4,5,3,5,4,2,5,4]::int[] AS ratings,
    ARRAY['Riya Sharma','Arjun Mehta','Chloe Dubois','Marcus Hale']::text[] AS team,
    ARRAY[
      'Service was quick and the team at %s genuinely remembered our preferences. Easily our best visit this quarter.',
      'Staff at %s were warm, the order arrived on time and billing was accurate. No complaints at all.',
      'Booked a last-minute table at %s and the team handled it smoothly. Clean space, attentive service.',
      'The %s team went out of their way to fix a small mix-up in minutes. That is why we keep coming back.'
    ]::text[] AS good,
    ARRAY[
      'Overall fine at %s, but we waited close to twenty minutes before anyone took our order.',
      'Good quality at %s, though the billing counter was slow and only one person was handling it.',
      'Mixed visit to %s — food was good, but the table was not cleared for a long time.',
      'Decent experience at %s. The staff were polite but clearly short-handed during the evening rush.'
    ]::text[] AS mid,
    ARRAY[
      'Very disappointed with %s. We were seated late despite a reservation and nobody updated us.',
      'The bill at %s had two items we never ordered and it took three attempts to get it corrected.',
      'Ordered at %s and the food arrived cold. The staff apologised but nothing was done about it.',
      'Poor handling at %s. Requested help twice and was ignored both times during a busy hour.'
    ]::text[] AS bad
),
rows AS (
  SELECT i,
         cfg.firsts[1 + (i * 7) % array_length(cfg.firsts, 1)]  AS fn,
         cfg.lasts[1 + (i * 11) % array_length(cfg.lasts, 1)]   AS ln,
         cfg.ratings[1 + (i * 13) % array_length(cfg.ratings, 1)] AS rating,
         cfg.locs[1 + (i * 3) % 8]                              AS loc,
         cfg.srcs[1 + (i * 5) % 7]                              AS src,
         (i * 37) % 178                                          AS days_ago,
         cfg.team[1 + i % 4]                                     AS owner,
         cfg.good[1 + i % 4]                                     AS good_t,
         cfg.mid[1 + i % 4]                                      AS mid_t,
         cfg.bad[1 + i % 4]                                      AS bad_t
  FROM generate_series(1, 125) AS i, cfg
)
INSERT INTO public.reviewvala_reviews
  (workspace_slug, reviewer_name, reviewer_initials, rating, review_text, review_date, time_label, source, location, sentiment, status, priority, assignee, created_at, updated_at)
SELECT 'northstar-group',
       fn || ' ' || ln,
       left(fn, 1) || left(ln, 1),
       rating,
       format(CASE WHEN rating >= 4 THEN good_t WHEN rating = 3 THEN mid_t ELSE bad_t END, split_part(loc, ',', 1)),
       (now() - (days_ago || ' days')::interval)::date,
       CASE WHEN days_ago = 0 THEN 'Today'
            WHEN days_ago = 1 THEN 'Yesterday'
            WHEN days_ago < 7 THEN days_ago || ' days ago'
            WHEN days_ago < 30 THEN (days_ago / 7) || ' week' || CASE WHEN days_ago / 7 = 1 THEN '' ELSE 's' END || ' ago'
            ELSE (days_ago / 30) || ' month' || CASE WHEN days_ago / 30 = 1 THEN '' ELSE 's' END || ' ago'
       END,
       src,
       loc,
       CASE WHEN rating >= 4 THEN 'Positive' WHEN rating = 3 THEN 'Mixed' ELSE 'Negative' END,
       CASE WHEN days_ago > 24 THEN 'Replied'
            WHEN rating <= 2 THEN 'Escalated'
            WHEN i % 3 = 0 THEN 'Assigned'
            ELSE 'Needs reply'
       END,
       CASE WHEN rating <= 2 THEN 'Urgent' WHEN rating = 3 THEN 'High' WHEN rating = 4 THEN 'Normal' ELSE 'Low' END,
       CASE WHEN days_ago > 24 OR rating <= 2 OR i % 3 = 0 THEN owner ELSE NULL END,
       now() - (days_ago || ' days')::interval,
       now() - (days_ago || ' days')::interval
FROM rows;