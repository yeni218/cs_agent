-- Demo data. Auth users are created via the Supabase dashboard / API (you can't
-- insert into auth.users from SQL cleanly); after creating them, link with a
-- profile row (see the bottom of this file).

insert into public.tenants (id, name, plan, phone_number, status) values
  ('t_lezzet', 'Lezzet Restoran', '{"name":"Pro","monthlyPrice":299,"includedMinutes":1000}', '+902121112233', 'active'),
  ('t_kebap',  'Kebapçı Ali',     '{"name":"Başlangıç","monthlyPrice":149,"includedMinutes":400}', '+903124445566', 'active')
on conflict (id) do nothing;

insert into public.assistants (id, tenant_id, name, first_message, model, voice, transcriber, config) values
  ('asst_lezzet', 't_lezzet', 'Lezzet Sipariş Asistanı', 'Lezzet Restoran, hoş geldiniz. Nasıl yardımcı olabilirim?',
   '{"provider":"groq","model":"llama-3.3-70b-versatile"}', '{"provider":"inworld","voiceId":"Ashley"}',
   '{"provider":"groq","language":"tr"}', '{"greeting":"Lezzet Restoran, hoş geldiniz.","openHours":"11:00 - 23:00","language":"tr"}'),
  ('asst_kebap', 't_kebap', 'Kebapçı Ali Asistanı', 'Kebapçı Ali, buyurun.',
   '{"provider":"groq","model":"llama-3.3-70b-versatile"}', '{"provider":"inworld","voiceId":"Ashley"}',
   '{"provider":"groq","language":"tr"}', '{"greeting":"Kebapçı Ali, buyurun.","openHours":"11:00 - 24:00","language":"tr"}')
on conflict (id) do nothing;

insert into public.calls (id, tenant_id, assistant_id, answered, outcome, order_amount, customer_name, summary, duration_sec, cost, cost_breakdown, started_at, ended_at) values
  ('call_2001','t_lezzet','asst_lezzet', true,'order',420,'Ahmet Y.','Karışık pizza + ayran', 192, 0.056, '{"stt":0.006,"llm":0.011,"tts":0.008,"transport":0.021,"platform":0.01}', now()-interval '1 hour', now()-interval '57 minutes'),
  ('call_2002','t_lezzet','asst_lezzet', true,'faq',   0,  'Bilinmeyen','Çalışma saatleri', 66, 0.017, '{"stt":0.002,"llm":0.004,"tts":0.003,"transport":0.007,"platform":0.01}', now()-interval '5 hour', now()-interval '5 hour'),
  ('call_2003','t_kebap','asst_kebap',   true,'order',260,'Mehmet A.','Adana + lahmacun', 156, 0.047, '{"stt":0.005,"llm":0.009,"tts":0.006,"transport":0.017,"platform":0.01}', now()-interval '2 hour', now()-interval '2 hour')
on conflict (id) do nothing;

-- After creating auth users in the dashboard, link them:
--   insert into public.profiles (id, role, tenant_id) values
--     ('<lezzet-auth-user-uuid>', 'customer', 't_lezzet'),
--     ('<admin-auth-user-uuid>',  'admin',    null);
