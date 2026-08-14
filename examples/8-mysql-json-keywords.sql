SELECT g.name, o.id
FROM user u
JOIN `order` o ON o.user_id = u.id
JOIN `group` g ON g.id = o.group_id
WHERE u.email = 'alice@example.com';
