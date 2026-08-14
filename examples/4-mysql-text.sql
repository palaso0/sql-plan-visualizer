SELECT u.id, o.total
FROM users u
JOIN orders o ON o.customer_id = u.id
WHERE u.email LIKE 'a%@example.com';
