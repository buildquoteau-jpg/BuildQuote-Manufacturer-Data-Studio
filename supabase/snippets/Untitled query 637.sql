INSERT INTO data_studio_user_profiles (auth_user_id, email, global_role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your@email.com'),
  'your@email.com',
  'buildquote_admin'
);