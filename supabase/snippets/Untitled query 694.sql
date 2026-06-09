INSERT INTO data_studio_user_profiles (auth_user_id, email, global_role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'test@test.com'),
  'test@test.com',
  'buildquote_admin'
);