INSERT INTO data_studio_user_profiles (auth_user_id, email, global_role)
SELECT id, email, 'buildquote_admin'
FROM auth.users
WHERE email = 'test@test.com';